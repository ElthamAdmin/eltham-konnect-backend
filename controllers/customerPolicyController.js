const { randomUUID, createHash } = require("crypto");

const CustomerPolicy = require("../models/CustomerPolicy");
const { configureCloudinary } = require("../config/cloudinary");
const { writeAuditLog } = require("../utils/auditLogger");

const getActor = (req) => ({
  userId: String(
    req.user?.userId || req.user?._id || req.user?.id || ""
  ),
  name:
    req.user?.fullName ||
    req.user?.name ||
    req.user?.email ||
    "System User",
});

const getJamaicaDate = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Jamaica",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

const cleanFileName = (value) =>
  String(value || "policy.pdf")
    .split(/[\\/]/)
    .pop()
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .slice(0, 180) || "policy.pdf";

const validDate = (value) => {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(value)
  ) {
    return false;
  }

  const date = new Date(`${value}T00:00:00.000Z`);

  return (
    !Number.isNaN(date.getTime()) &&
    date.toISOString().slice(0, 10) === value
  );
};

const publicPolicy = (document) => ({
  policyNumber: document.policyNumber,
  policyType: document.policyType,
  version: document.version,
  title: document.title,
  effectiveDate: document.effectiveDate,
  fileName: document.fileName,
  fileSize: document.fileSize,
  fileSha256: document.fileSha256,
  publishedAt: document.publishedAt,
});

const staffPolicy = (document) => ({
  ...publicPolicy(document),
  status: document.status,
  uploadedByName: document.uploadedByName,
  publishedByName: document.publishedByName,
  withdrawnAt: document.withdrawnAt,
  withdrawnByName: document.withdrawnByName,
  withdrawalReason: document.withdrawalReason,
  createdAt: document.createdAt,
});

const uploadBuffer = (cloudinary, buffer, options) =>
  new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      options,
      (error, result) => {
        if (error) return reject(error);
        return resolve(result);
      }
    );

    stream.on("error", reject);
    stream.end(buffer);
  });

const listStaffPolicies = async (req, res) => {
  try {
    const documents = await CustomerPolicy.find()
      .sort({ createdAt: -1 })
      .lean();

    res.setHeader("Cache-Control", "private, no-store");

    return res.json({
      success: true,
      data: documents.map(staffPolicy),
    });
  } catch (error) {
    console.error("List customer policies failed:", error.message);

    return res.status(500).json({
      success: false,
      message: "Customer policies could not be loaded.",
    });
  }
};

const uploadPolicyDraft = async (req, res) => {
  let uploadedAsset = null;
  let documentSaved = false;

  try {
    const body = req.body || {};

    const policyType =
      typeof body.policyType === "string"
        ? body.policyType.trim()
        : "";

    const version =
      typeof body.version === "string"
        ? body.version.trim()
        : "";

    const title =
      typeof body.title === "string"
        ? body.title.trim()
        : "";

    const effectiveDate =
      typeof body.effectiveDate === "string"
        ? body.effectiveDate.trim()
        : "";

    if (!["terms", "privacy"].includes(policyType)) {
      return res.status(400).json({
        success: false,
        message: "Select Terms and Conditions or Privacy Policy.",
      });
    }

    if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,79}$/.test(version)) {
      return res.status(400).json({
        success: false,
        message:
          "Enter a version using letters, numbers, dots, hyphens or underscores, up to 80 characters.",
      });
    }

    if (!title || title.length > 300) {
      return res.status(400).json({
        success: false,
        message: "Enter a document title of up to 300 characters.",
      });
    }

    if (!validDate(effectiveDate)) {
      return res.status(400).json({
        success: false,
        message: "Select a valid effective date.",
      });
    }

    const buffer = req.file?.buffer;

    if (
      !Buffer.isBuffer(buffer) ||
      buffer.length < 5 ||
      buffer.length > 10 * 1024 * 1024 ||
      buffer.subarray(0, 5).toString("ascii") !== "%PDF-"
    ) {
      return res.status(400).json({
        success: false,
        message: "Choose a PDF document no larger than 10 MB.",
      });
    }

    const duplicate = await CustomerPolicy.exists({
      policyType,
      version,
    });

    if (duplicate) {
      return res.status(409).json({
        success: false,
        message:
          "That policy type and version already exist. Use a new version for a revised document.",
      });
    }

    const cloudinary = configureCloudinary();
    const policyNumber = `POL-${randomUUID()}`;
    const actor = getActor(req);

    uploadedAsset = await uploadBuffer(cloudinary, buffer, {
      resource_type: "raw",
      type: "authenticated",
      public_id: `ekos/customer-policies/${policyNumber}.pdf`,
      overwrite: false,
    });

    if (!uploadedAsset?.public_id) {
      throw new Error("The PDF storage reference was not returned.");
    }

    const document = await CustomerPolicy.create({
      policyNumber,
      policyType,
      version,
      title,
      effectiveDate,
      status: "Draft",
      fileName: cleanFileName(req.file.originalname),
      mimeType: "application/pdf",
      fileSize: buffer.length,
      fileSha256: createHash("sha256")
        .update(buffer)
        .digest("hex"),
      storageProvider: "cloudinary",
      cloudinaryPublicId: uploadedAsset.public_id,
      cloudinaryResourceType: "raw",
      cloudinaryDeliveryType: "authenticated",
      uploadedByUserId: actor.userId,
      uploadedByName: actor.name,
    });

    documentSaved = true;

    await writeAuditLog({
      req,
      action: "UPLOAD_CUSTOMER_POLICY_DRAFT",
      module: "Settings",
      description: `${title} version ${version} uploaded as a draft.`,
      targetType: "CustomerPolicy",
      targetId: policyNumber,
      metadata: {
        policyType,
        version,
        effectiveDate,
        fileSha256: document.fileSha256,
      },
    });

    return res.status(201).json({
      success: true,
      message:
        "Policy uploaded as a draft. Customers cannot view it until it is published.",
      data: staffPolicy(document),
    });
  } catch (error) {
    console.error("Upload customer policy failed:", error.message);

    /*
     * Never remove an asset after its database record
     * has been saved.
     */
    if (!documentSaved && uploadedAsset?.public_id) {
      try {
        await configureCloudinary().uploader.destroy(
          uploadedAsset.public_id,
          {
            resource_type: "raw",
            type: "authenticated",
            invalidate: true,
          }
        );
      } catch (cleanupError) {
        console.error(
          "Policy upload cleanup failed:",
          cleanupError.message
        );
      }
    }

    return res.status(error.code === 11000 ? 409 : 500).json({
      success: false,
      message:
        error.code === 11000
          ? "That policy type and version already exist."
          : "The policy could not be uploaded. Check the policy list before retrying.",
    });
  }
};

const sendPolicyAccess = async (req, res, staffAccess) => {
  try {
    const query = {
      policyNumber: req.params.policyNumber,
    };

    if (!staffAccess) {
      query.status = "Published";
    }

    const document = await CustomerPolicy.findOne(query)
      .select(
        "+cloudinaryPublicId +cloudinaryResourceType +cloudinaryDeliveryType"
      )
      .lean();

    if (!document) {
      return res.status(404).json({
        success: false,
        message: "Policy document not found.",
      });
    }

    const url = configureCloudinary().utils.private_download_url(
      document.cloudinaryPublicId,
      "",
      {
        resource_type: "raw",
        type: "authenticated",
        expires_at: Math.floor(Date.now() / 1000) + 120,
        attachment: req.query.download === "1",
        secure: true,
      }
    );

    res.setHeader("Cache-Control", "private, no-store");

    return res.json({
      success: true,
      data: { url },
    });
  } catch (error) {
    console.error("Customer policy access failed:", error.message);

    return res.status(500).json({
      success: false,
      message: "The policy PDF could not be opened.",
    });
  }
};

const getStaffPolicyAccess = (req, res) =>
  sendPolicyAccess(req, res, true);

const getPublishedPolicyAccess = (req, res) =>
  sendPolicyAccess(req, res, false);

const publishPolicy = async (req, res) => {
  try {
    if (req.body?.confirmPublication !== true) {
      return res.status(400).json({
        success: false,
        message:
          "Confirm that the PDF has been reviewed and is ready for customers.",
      });
    }

    const actor = getActor(req);

    const document = await CustomerPolicy.findOneAndUpdate(
      {
        policyNumber: req.params.policyNumber,
        status: "Draft",
      },
      {
        $set: {
          status: "Published",
          publishedAt: new Date(),
          publishedByUserId: actor.userId,
          publishedByName: actor.name,
        },
      },
      {
        returnDocument: "after",
        runValidators: true,
      }
    );

    if (!document) {
      return res.status(409).json({
        success: false,
        message:
          "This policy was not found as a draft. Refresh the policy list.",
      });
    }

    await writeAuditLog({
      req,
      action: "PUBLISH_CUSTOMER_POLICY",
      module: "Settings",
      description:
        `${document.title} version ${document.version} published.`,
      targetType: "CustomerPolicy",
      targetId: document.policyNumber,
      metadata: {
        policyType: document.policyType,
        version: document.version,
        effectiveDate: document.effectiveDate,
        fileSha256: document.fileSha256,
      },
    });

    return res.json({
      success: true,
      message:
        "Policy published. Customers can now view it. Its effective date is displayed separately.",
      data: staffPolicy(document),
    });
  } catch (error) {
    console.error("Publish customer policy failed:", error.message);

    return res.status(500).json({
      success: false,
      message:
        "Publication could not be confirmed. Refresh the policy list before retrying.",
    });
  }
};

const withdrawPolicy = async (req, res) => {
  try {
    const reason =
      typeof req.body?.reason === "string"
        ? req.body.reason.trim()
        : "";

    if (!reason || reason.length > 1000) {
      return res.status(400).json({
        success: false,
        message: "Enter a withdrawal reason of up to 1,000 characters.",
      });
    }

    const actor = getActor(req);

    const document = await CustomerPolicy.findOneAndUpdate(
      {
        policyNumber: req.params.policyNumber,
        status: "Published",
      },
      {
        $set: {
          status: "Withdrawn",
          withdrawnAt: new Date(),
          withdrawnByUserId: actor.userId,
          withdrawnByName: actor.name,
          withdrawalReason: reason,
        },
      },
      {
        returnDocument: "after",
        runValidators: true,
      }
    );

    if (!document) {
      return res.status(409).json({
        success: false,
        message:
          "This policy was not found as published. Refresh the policy list.",
      });
    }

    await writeAuditLog({
      req,
      action: "WITHDRAW_CUSTOMER_POLICY",
      module: "Settings",
      description:
        `${document.title} version ${document.version} withdrawn: ${reason}`,
      targetType: "CustomerPolicy",
      targetId: document.policyNumber,
      metadata: {
        policyType: document.policyType,
        version: document.version,
        reason,
      },
    });

    return res.json({
      success: true,
      message:
        "Policy withdrawn from customer viewing. Its record and PDF remain available to authorized staff.",
      data: staffPolicy(document),
    });
  } catch (error) {
    console.error("Withdraw customer policy failed:", error.message);

    return res.status(500).json({
      success: false,
      message:
        "Withdrawal could not be confirmed. Refresh the policy list before retrying.",
    });
  }
};

const listPublishedPolicies = async (req, res) => {
  try {
    const today = getJamaicaDate();

    const documents = await CustomerPolicy.find({
      status: "Published",
    })
      .sort({
        effectiveDate: -1,
        publishedAt: -1,
        _id: -1,
      })
      .lean();

    const current = {
      terms: null,
      privacy: null,
    };

    const upcoming = [];
    const previous = [];

    for (const document of documents) {
      const safeDocument = publicPolicy(document);

      if (document.effectiveDate > today) {
        upcoming.push(safeDocument);
      } else if (!current[document.policyType]) {
        current[document.policyType] = safeDocument;
      } else {
        previous.push(safeDocument);
      }
    }

    res.setHeader("Cache-Control", "no-store");

    return res.json({
      success: true,
      data: {
        current,
        upcoming,
        previous,
      },
    });
  } catch (error) {
    console.error("Published policies load failed:", error.message);

    return res.status(500).json({
      success: false,
      message: "Customer policies could not be loaded.",
    });
  }
};

module.exports = {
  listStaffPolicies,
  uploadPolicyDraft,
  getStaffPolicyAccess,
  publishPolicy,
  withdrawPolicy,
  listPublishedPolicies,
  getPublishedPolicyAccess,
};