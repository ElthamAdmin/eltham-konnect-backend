const { randomUUID } = require("crypto");

const Setting = require("../models/Setting");
const CompanyDocument = require("../models/CompanyDocument");

const {
  configureCloudinary,
} = require("../config/cloudinary");

const getMainSettings = () =>
  Setting.findOneAndUpdate(
    { settingKey: "main" },
    { $setOnInsert: { settingKey: "main" } },
    {
      new: true,
      upsert: true,
      setDefaultsOnInsert: true,
    }
  );

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

const detectLogo = (buffer) => {
  if (!Buffer.isBuffer(buffer)) return "";

  if (
    buffer.length >= 3 &&
    buffer[0] === 0xff &&
    buffer[1] === 0xd8 &&
    buffer[2] === 0xff
  ) {
    return "jpg";
  }

  const pngSignature = Buffer.from([
    0x89, 0x50, 0x4e, 0x47,
    0x0d, 0x0a, 0x1a, 0x0a,
  ]);

  if (
    buffer.length >= 8 &&
    buffer.subarray(0, 8).equals(pngSignature)
  ) {
    return "png";
  }

  if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
    buffer.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return "webp";
  }

  return "";
};

const cleanFileName = (value, fallback) =>
  String(value || fallback)
    .split(/[\\/]/)
    .pop()
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .slice(0, 180) || fallback;

const getSettings = async (req, res) => {
  try {
    const settings = await getMainSettings();

    res.setHeader("Cache-Control", "private, no-store");

    return res.json({
      success: true,
      message: "Settings retrieved successfully",
      data: settings,
    });
  } catch (error) {
    console.error("Error getting settings:", error.message);

    return res.status(500).json({
      success: false,
      message: "Failed to retrieve settings.",
    });
  }
};

const updateSettings = async (req, res) => {
  try {
    const body = req.body || {};
    const updates = {};

    const textFields = [
      "companyName",
      "companyEmail",
      "companyPhone",
      "companyAddress",
      "defaultCurrency",
    ];

    for (const field of textFields) {
      if (!Object.prototype.hasOwnProperty.call(body, field)) continue;

      if (typeof body[field] !== "string" || body[field].length > 5000) {
        return res.status(400).json({
          success: false,
          message: `Invalid value for ${field}.`,
        });
      }

      updates[field] = body[field].trim();
    }

    if (Object.prototype.hasOwnProperty.call(body, "branches")) {
      if (
        !Array.isArray(body.branches) ||
        body.branches.length > 100 ||
        body.branches.some(
          (branch) =>
            typeof branch !== "string" ||
            branch.length > 200
        )
      ) {
        return res.status(400).json({
          success: false,
          message: "Please provide a valid branch list.",
        });
      }

      updates.branches = [
        ...new Set(body.branches.map((branch) => branch.trim()).filter(Boolean)),
      ];
    }

    const rewardFields = [
      "atWarehousePoints",
      "minimumRedeemPoints",
      "inactivityExpiryMonths",
      "pointsCap",
    ];

    for (const field of rewardFields) {
      if (!Object.prototype.hasOwnProperty.call(body.rewards || {}, field)) {
        continue;
      }

      const value = body.rewards[field];

      if (
        typeof value !== "number" ||
        !Number.isFinite(value) ||
        value < 0
      ) {
        return res.status(400).json({
          success: false,
          message: `Invalid rewards value: ${field}.`,
        });
      }

      updates[`rewards.${field}`] = value;
    }

    const nestedTextFields = [
      ["invoice", "defaultStatus"],
      ["invoice", "defaultPaymentTerms"],
      ["communication", "defaultChannel"],
      ["communication", "supportEmail"],
    ];

    for (const [section, field] of nestedTextFields) {
      if (!Object.prototype.hasOwnProperty.call(body[section] || {}, field)) {
        continue;
      }

      const value = body[section][field];

      if (typeof value !== "string" || value.length > 1000) {
        return res.status(400).json({
          success: false,
          message: `Invalid value for ${section}.${field}.`,
        });
      }

      updates[`${section}.${field}`] = value.trim();
    }

    if (
      Object.prototype.hasOwnProperty.call(
        body.communication || {},
        "notificationsEnabled"
      )
    ) {
      if (typeof body.communication.notificationsEnabled !== "boolean") {
        return res.status(400).json({
          success: false,
          message: "Notifications Enabled must be true or false.",
        });
      }

      updates["communication.notificationsEnabled"] =
        body.communication.notificationsEnabled;
    }

    /*
     * Branding is deliberately excluded from general Save Settings.
     * Only the dedicated logo-upload endpoints can change logo fields.
     */
    await getMainSettings();

    const settings = Object.keys(updates).length
      ? await Setting.findOneAndUpdate(
          { settingKey: "main" },
          { $set: updates },
          { new: true, runValidators: true }
        )
      : await Setting.findOne({ settingKey: "main" });

    return res.json({
      success: true,
      message: "Settings saved successfully",
      data: settings,
    });
  } catch (error) {
    console.error("Error updating settings:", error.message);

    return res.status(500).json({
      success: false,
      message: "Failed to save settings.",
    });
  }
};

const saveLogo = async (req, res, kind) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "Please choose a logo file.",
      });
    }

    const format = detectLogo(req.file.buffer);

    if (!format) {
      return res.status(400).json({
        success: false,
        message: "The file must be a valid JPG, PNG or WebP image.",
      });
    }

    const cloudinary = configureCloudinary();

    /*
     * Branding logos use normal image delivery.
     * Internal company PDFs use authenticated delivery separately.
     */
    const asset = await uploadBuffer(cloudinary, req.file.buffer, {
      resource_type: "image",
      type: "upload",
      public_id: `ekos/branding/${kind}-${randomUUID()}`,
      overwrite: false,
      allowed_formats: ["jpg", "jpeg", "png", "webp"],
    });

    const settings = await Setting.findOneAndUpdate(
      { settingKey: "main" },
      {
        $set: {
          [`branding.${kind}LogoName`]: cleanFileName(
            req.file.originalname,
            `${kind}-logo.${format}`
          ),
          [`branding.${kind}LogoPath`]: asset.secure_url,
        },
      },
      {
        new: true,
        upsert: true,
        runValidators: true,
        setDefaultsOnInsert: true,
      }
    );

    return res.json({
      success: true,
      message:
        kind === "primary"
          ? "Primary logo uploaded successfully"
          : "Invoice logo uploaded successfully",
      data: settings,
    });
  } catch (error) {
    console.error("Logo upload failed:", error.message);

    return res.status(500).json({
      success: false,
      message: "The logo could not be saved. Please try again.",
    });
  }
};

const uploadPrimaryLogo = (req, res) => saveLogo(req, res, "primary");
const uploadInvoiceLogo = (req, res) => saveLogo(req, res, "invoice");

const getCompanyDocuments = async (req, res) => {
  try {
    const documents = await CompanyDocument.find()
      .select("-cloudinaryPublicId -cloudinaryResourceType -cloudinaryDeliveryType")
      .sort({ createdAt: -1 })
      .lean();

    res.setHeader("Cache-Control", "private, no-store");

    return res.json({
      success: true,
      message: "Company documents retrieved successfully",
      totalDocuments: documents.length,
      data: documents,
    });
  } catch (error) {
    console.error("Error getting company documents:", error.message);

    return res.status(500).json({
      success: false,
      message: "Failed to retrieve company documents.",
    });
  }
};

const uploadCompanyDocument = async (req, res) => {
  try {
    const title = String(req.body.title || "").trim();
    const category = String(req.body.category || "").trim();
    const status = String(req.body.status || "Active").trim();

    if (
      !title ||
      !category ||
      title.length > 300 ||
      category.length > 200 ||
      !["Active", "Archived"].includes(status)
    ) {
      return res.status(400).json({
        success: false,
        message: "Please provide a valid title, category and status.",
      });
    }

    if (
      !req.file ||
      req.file.buffer.subarray(0, 5).toString("ascii") !== "%PDF-"
    ) {
      return res.status(400).json({
        success: false,
        message: "Please choose a valid PDF document.",
      });
    }

    const cloudinary = configureCloudinary();
    const documentNumber = `DOC-${randomUUID()}`;

    const asset = await uploadBuffer(cloudinary, req.file.buffer, {
      resource_type: "raw",
      type: "authenticated",
      public_id: `ekos/internal-documents/${documentNumber}.pdf`,
      overwrite: false,
    });

    const document = await CompanyDocument.create({
      documentNumber,
      title,
      category,
      status,
      fileName: cleanFileName(req.file.originalname, "document.pdf"),
      filePath: `/api/settings/documents/${documentNumber}/access`,
      fileType: "application/pdf",
      storageProvider: "cloudinary",
      cloudinaryPublicId: asset.public_id,
      cloudinaryResourceType: "raw",
      cloudinaryDeliveryType: "authenticated",
      fileSize: req.file.size,
    });

    const safeDocument = document.toObject();
    delete safeDocument.cloudinaryPublicId;
    delete safeDocument.cloudinaryResourceType;
    delete safeDocument.cloudinaryDeliveryType;

    return res.status(201).json({
      success: true,
      message: "Internal PDF document uploaded successfully",
      data: safeDocument,
    });
  } catch (error) {
    console.error("Company document upload failed:", error.message);

    return res.status(500).json({
      success: false,
      message: "The PDF could not be saved. Check the document list before retrying.",
    });
  }
};

const getCompanyDocumentAccess = async (req, res) => {
  try {
    const document = await CompanyDocument.findOne({
      documentNumber: req.params.documentNumber,
    }).lean();

    if (!document) {
      return res.status(404).json({
        success: false,
        message: "Document not found.",
      });
    }

    if (
      document.storageProvider !== "cloudinary" ||
      !document.cloudinaryPublicId ||
      document.cloudinaryResourceType !== "raw" ||
      document.cloudinaryDeliveryType !== "authenticated"
    ) {
      return res.status(410).json({
        success: false,
        message: "Please upload a new copy of this document.",
      });
    }

    const cloudinary = configureCloudinary();

    const url = cloudinary.utils.private_download_url(
      document.cloudinaryPublicId,
      "",
      {
        resource_type: "raw",
        type: "authenticated",
        expires_at: Math.floor(Date.now() / 1000) + 120,
        attachment: false,
        secure: true,
      }
    );

    res.setHeader("Cache-Control", "private, no-store");

    return res.json({
      success: true,
      data: { url },
    });
  } catch (error) {
    console.error("Company document access failed:", error.message);

    return res.status(500).json({
      success: false,
      message: "Could not open the document.",
    });
  }
};

module.exports = {
  getSettings,
  updateSettings,
  uploadPrimaryLogo,
  uploadInvoiceLogo,
  getCompanyDocuments,
  uploadCompanyDocument,
  getCompanyDocumentAccess,
};