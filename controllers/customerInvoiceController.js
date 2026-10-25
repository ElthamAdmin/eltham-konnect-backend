const path = require("path");
const fs = require("fs");
const https = require("https");
const { randomUUID } = require("crypto");
const { pipeline } = require("stream");

const Customer = require("../models/Customer");
const CustomerInvoiceUpload = require("../models/CustomerInvoiceUpload");
const Package = require("../models/Package");
const CustomerNotification = require("../models/CustomerNotification");

const {
  configureCloudinary,
} = require("../config/cloudinary");

const { writeAuditLog } = require("../utils/auditLogger");

const invoiceDirectory = path.resolve(
  __dirname,
  "../uploads/customer-invoices"
);

const detectInvoiceType = (buffer) => {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) return null;

  if (buffer.subarray(0, 5).toString("ascii") === "%PDF-") {
    return { extension: ".pdf", mimeType: "application/pdf" };
  }

  if (
    buffer.length >= 3 &&
    buffer[0] === 0xff &&
    buffer[1] === 0xd8 &&
    buffer[2] === 0xff
  ) {
    return { extension: ".jpg", mimeType: "image/jpeg" };
  }

  const pngSignature = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  ]);

  if (
    buffer.length >= 8 &&
    buffer.subarray(0, 8).equals(pngSignature)
  ) {
    return { extension: ".png", mimeType: "image/png" };
  }

  if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
    buffer.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return { extension: ".webp", mimeType: "image/webp" };
  }

  if (
    buffer.length >= 16 &&
    buffer.subarray(4, 8).toString("ascii") === "ftyp"
  ) {
    const supportedBrands = new Set([
      "heic", "heix", "hevc", "hevx",
      "heim", "heis", "hevm", "hevs",
      "mif1", "msf1",
    ]);

    const boxSize = buffer.readUInt32BE(0);
    const end = Math.min(
      boxSize >= 16 ? boxSize : 16,
      buffer.length,
      256
    );

    const brands = [buffer.subarray(8, 12).toString("ascii")];

    for (let offset = 16; offset + 4 <= end; offset += 4) {
      brands.push(buffer.subarray(offset, offset + 4).toString("ascii"));
    }

    if (brands.some((brand) => supportedBrands.has(brand))) {
      return { extension: ".heic", mimeType: "image/heic" };
    }
  }

  return null;
};

const uploadBuffer = (cloudinary, buffer, publicId) =>
  new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        resource_type: "raw",
        type: "authenticated",
        public_id: publicId,
        overwrite: false,
      },
      (error, result) => {
        if (error) return reject(error);
        return resolve(result);
      }
    );

    stream.on("error", reject);
    stream.end(buffer);
  });

const removeUnreferencedAsset = async (cloudinary, publicId) => {
  try {
    await cloudinary.uploader.destroy(publicId, {
      resource_type: "raw",
      type: "authenticated",
      invalidate: true,
    });
  } catch (error) {
    console.error(
      "Unreferenced invoice asset cleanup failed:",
      publicId,
      error.message
    );
  }
};

const getMyInvoiceUploads = async (req, res) => {
  try {
    const uploads = await CustomerInvoiceUpload.find({
      customerEkonId: req.user.ekonId,
    })
      .select("-cloudinaryPublicId -cloudinaryResourceType -cloudinaryDeliveryType")
      .sort({ createdAt: -1 })
      .lean();

    res.setHeader("Cache-Control", "no-store");

    return res.json({
      success: true,
      message: "Invoice uploads retrieved successfully",
      data: uploads,
    });
  } catch (error) {
    console.error("Error retrieving invoice uploads:", error.message);

    return res.status(500).json({
      success: false,
      message: "Could not retrieve invoice uploads.",
    });
  }
};

const uploadCustomerInvoice = async (req, res) => {
  try {
    const trackingNumber = String(req.body.trackingNumber || "").trim();
    const invoiceNumber = String(req.body.invoiceNumber || "").trim();
    const notes = String(req.body.notes || "").trim();

    if (!trackingNumber) {
      return res.status(400).json({
        success: false,
        message: "Tracking number is required.",
      });
    }

    if (
      trackingNumber.length > 200 ||
      invoiceNumber.length > 200 ||
      notes.length > 5000
    ) {
      return res.status(400).json({
        success: false,
        message: "Tracking number, invoice number or notes are too long.",
      });
    }

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "Invoice file is required.",
      });
    }

    const detectedType = detectInvoiceType(req.file.buffer);

    if (!detectedType) {
      return res.status(400).json({
        success: false,
        message: "The file is not a supported PDF or image invoice.",
      });
    }

    const customer = await Customer.findOne({
      _id: req.user.customerId,
      ekonId: req.user.ekonId,
      status: "Active",
    });

    if (!customer) {
      return res.status(404).json({
        success: false,
        message: "Active customer account not found.",
      });
    }

    const pkg = await Package.findOne({
      trackingNumber,
      customerEkonId: customer.ekonId,
      status: { $ne: "Deleted" },
    });

    if (!pkg) {
      return res.status(404).json({
        success: false,
        message: "Package not found for this customer.",
      });
    }

    const cloudinary = configureCloudinary();
    const uploadNumber = `CIU-${randomUUID()}`;
    const publicId =
      `ekos/customer-invoices/${uploadNumber}${detectedType.extension}`;

    let asset;

    try {
      asset = await uploadBuffer(
        cloudinary,
        req.file.buffer,
        publicId
      );
    } catch (error) {
      console.error("Cloudinary invoice upload failed:", error.message);

      return res.status(502).json({
        success: false,
        message: "Invoice storage is temporarily unavailable. Please try again.",
      });
    }

    const originalName = String(req.file.originalname || "invoice")
      .split(/[\\/]/)
      .pop()
      .replace(/[\u0000-\u001f\u007f]/g, "")
      .slice(0, 180);

    const fileName =
      `${path.parse(originalName).name || "invoice"}${detectedType.extension}`;

    let upload;

    try {
      upload = await CustomerInvoiceUpload.create({
        uploadNumber,
        customerEkonId: customer.ekonId,
        customerName: customer.name,
        trackingNumber: pkg.trackingNumber,
        invoiceNumber,
        fileName,
        filePath: `/api/customer-invoices/files/${uploadNumber}`,
        storageProvider: "cloudinary",
        cloudinaryPublicId: asset.public_id,
        cloudinaryResourceType: "raw",
        cloudinaryDeliveryType: "authenticated",
        mimeType: detectedType.mimeType,
        fileSize: req.file.size,
        notes,
        status: "Uploaded",
      });
    } catch (error) {
      /*
       * A network failure can leave a database write's outcome uncertain.
       * Delete the Cloudinary asset only after confirming no record exists.
       */
      let definitelyUnreferenced = false;

      try {
        definitelyUnreferenced =
          !(await CustomerInvoiceUpload.exists({ uploadNumber }));
      } catch (lookupError) {
        console.error(
          "Invoice record verification failed:",
          lookupError.message
        );
      }

      if (definitelyUnreferenced) {
        await removeUnreferencedAsset(cloudinary, asset.public_id);
      }

      throw error;
    }

    let updatedPackage = null;

    try {
      updatedPackage = await Package.findOneAndUpdate(
        {
          _id: pkg._id,
          customerEkonId: customer.ekonId,
          status: { $ne: "Deleted" },
        },
        {
          $set: {
            customerInvoiceUploaded: true,
            customerInvoiceUploadNumber: upload.uploadNumber,
            customerInvoiceNumber: invoiceNumber,
            customerInvoiceFileName: upload.fileName,
            customerInvoiceFilePath: upload.filePath,
            customerInvoiceNotes: notes,
            customerInvoiceUploadedAt: upload.createdAt,
          },
        },
        { new: true, runValidators: true }
      );
    } catch (error) {
      console.error("Invoice package linking failed:", error.message);
    }

    /*
     * The invoice is already stored safely.
     * Notification or audit failures must not report the upload as failed.
     */
    try {
      await CustomerNotification.create({
        notificationNumber: `CNT-${randomUUID()}`,
        customerEkonId: customer.ekonId,
        customerName: customer.name,
        type: "Invoice Upload",
        title: "Invoice Uploaded Successfully",
        message: `Your invoice for package ${pkg.trackingNumber} was saved successfully.`,
        isRead: false,
        date: new Intl.DateTimeFormat("en-CA", {
          timeZone: "America/Jamaica",
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        }).format(new Date()),
      });
    } catch (error) {
      console.error("Invoice notification failed:", error.message);
    }

    try {
      await writeAuditLog({
        req,
        action: "CUSTOMER_INVOICE_UPLOADED",
        module: "Customer Invoices",
        description: `Customer invoice uploaded for package ${pkg.trackingNumber}`,
        targetType: "Package",
        targetId: pkg.trackingNumber,
        metadata: {
          customerEkonId: customer.ekonId,
          uploadNumber: upload.uploadNumber,
          invoiceNumber,
          storageProvider: "cloudinary",
          packageLinked: Boolean(updatedPackage),
        },
      });
    } catch (error) {
      console.error("Invoice audit logging failed:", error.message);
    }

    const safeUpload = upload.toObject();
    delete safeUpload.cloudinaryPublicId;
    delete safeUpload.cloudinaryResourceType;
    delete safeUpload.cloudinaryDeliveryType;

    return res.status(201).json({
      success: true,
      message: updatedPackage
        ? `Invoice uploaded and connected to package ${pkg.trackingNumber} successfully.`
        : "Invoice saved in Upload History, but the package link could not be updated. Please contact support with the upload number.",
      data: {
        upload: safeUpload,
        package: updatedPackage,
        packageLinked: Boolean(updatedPackage),
      },
    });
  } catch (error) {
    console.error("Error uploading customer invoice:", error.message);

    return res.status(500).json({
      success: false,
      message: "Could not complete the invoice upload. Check Upload History before retrying.",
    });
  }
};

const getLegacyMimeType = (fileName) => {
  const types = {
    ".pdf": "application/pdf",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
    ".heic": "image/heic",
    ".heif": "image/heif",
  };

  return types[path.extname(fileName || "").toLowerCase()] ||
    "application/octet-stream";
};

const openCustomerInvoice = async (req, res) => {
  try {
    const query = {
      uploadNumber: String(req.params.uploadNumber || ""),
    };

    if (req.user.userType === "customer") {
      query.customerEkonId = req.user.ekonId;
    }

    const upload = await CustomerInvoiceUpload.findOne(query).lean();

    if (!upload) {
      return res.status(404).json({
        success: false,
        message: "Invoice upload not found.",
      });
    }

    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");

    if (upload.storageProvider === "cloudinary") {
      if (
        !upload.cloudinaryPublicId ||
        upload.cloudinaryResourceType !== "raw" ||
        upload.cloudinaryDeliveryType !== "authenticated"
      ) {
        return res.status(500).json({
          success: false,
          message: "This invoice has an incomplete storage record.",
        });
      }

      const cloudinary = configureCloudinary();

      const signedUrl = cloudinary.utils.private_download_url(
        upload.cloudinaryPublicId,
        "",
        {
          resource_type: "raw",
          type: "authenticated",
          expires_at: Math.floor(Date.now() / 1000) + 120,
          attachment: false,
          secure: true,
        }
      );

      const upstream = https.get(signedUrl, (response) => {
        if (response.statusCode !== 200) {
          response.resume();

          return res.status(502).json({
            success: false,
            message: "Invoice storage could not return this file. Please try again or contact support.",
          });
        }

        res.setHeader(
          "Content-Type",
          upload.mimeType || getLegacyMimeType(upload.fileName)
        );

        res.setHeader("Content-Disposition", "inline");

        pipeline(response, res, (error) => {
          if (error) {
            console.error("Invoice streaming failed:", error.message);
          }
        });
      });

      upstream.setTimeout(30000, () => {
        upstream.destroy(new Error("Invoice storage request timed out."));
      });

      upstream.on("error", (error) => {
        console.error("Invoice storage download failed:", error.message);

        if (!res.headersSent && !res.destroyed) {
          res.status(502).json({
            success: false,
            message: "Invoice storage is temporarily unavailable.",
          });
        } else if (!res.destroyed) {
          res.destroy();
        }
      });

      res.on("close", () => upstream.destroy());
      return;
    }

    /*
     * Legacy files are read only from the original invoice directory.
     * Never use an arbitrary saved URL or filesystem path.
     */
    const legacyPrefix = "/uploads/customer-invoices/";
    const savedPath = String(upload.filePath || "");

    if (!savedPath.startsWith(legacyPrefix)) {
      return res.status(404).json({
        success: false,
        message: "This older invoice needs to be uploaded again.",
      });
    }

    const legacyName = savedPath.slice(legacyPrefix.length);

    if (!legacyName || path.basename(legacyName) !== legacyName) {
      return res.status(404).json({
        success: false,
        message: "Invalid legacy invoice reference.",
      });
    }

    const localFile = path.resolve(invoiceDirectory, legacyName);

    try {
      await fs.promises.access(localFile, fs.constants.R_OK);
    } catch {
      return res.status(410).json({
        success: false,
        message: "This older invoice file is no longer on the server. Please upload it again.",
      });
    }

    res.type(getLegacyMimeType(legacyName));
    res.setHeader("Content-Disposition", "inline");

    return res.sendFile(localFile, (error) => {
      if (error && !res.headersSent) {
        res.status(404).json({
          success: false,
          message: "The older invoice file could not be opened.",
        });
      }
    });
  } catch (error) {
    console.error("Invoice access failed:", error.message);

    if (!res.headersSent) {
      return res.status(500).json({
        success: false,
        message: "Could not open the invoice.",
      });
    }
  }
};

module.exports = {
  getMyInvoiceUploads,
  uploadCustomerInvoice,
  openCustomerInvoice,
};