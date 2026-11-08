const path = require("path");
const fs = require("fs");
const https = require("https");
const { pipeline } = require("stream");
const { randomUUID } = require("crypto");

const PreAlert = require("../models/PreAlert");
const { configureCloudinary } = require("../config/cloudinary");

const legacyDirectory = path.resolve(__dirname, "../uploads/prealerts");

const hiddenFields =
  "-invoiceCloudinaryPublicId";

const safeRecord = (record) => {
  const result = record.toObject ? record.toObject() : { ...record };
  delete result.invoiceCloudinaryPublicId;
  return result;
};

const detectInvoiceType = (buffer) => {
  if (!Buffer.isBuffer(buffer) || !buffer.length) return null;

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

  return null;
};

const uploadInvoice = (cloudinary, buffer, publicId) =>
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
        resolve(result);
      }
    );

    stream.on("error", reject);
    stream.end(buffer);
  });

const getPreAlerts = async (req, res) => {
  try {
    const user = req.user;

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required.",
      });
    }

    const query = {};

    if (user.userType === "customer") {
      if (!user.ekonId) {
        return res.status(403).json({
          success: false,
          message: "Customer account could not be verified.",
        });
      }

      query.customerEkonId = user.ekonId;
    }

    const preAlerts = await PreAlert.find(query)
      .select(hiddenFields)
      .sort({ createdAt: -1 })
      .lean();

    res.setHeader("Cache-Control", "private, no-store");

    return res.json({
      success: true,
      message: "Pre-alerts retrieved successfully",
      totalPreAlerts: preAlerts.length,
      data: preAlerts,
    });
  } catch (error) {
    console.error("Error getting pre-alerts:", error.message);

    return res.status(500).json({
      success: false,
      message: "Failed to retrieve pre-alerts.",
    });
  }
};

const createPreAlert = async (req, res) => {
  let cloudinary;
  let asset;
  let preAlertNumber;

  try {
    const user = req.user || {};

    if (user.userType !== "customer" || !user.ekonId) {
      return res.status(403).json({
        success: false,
        message: "Customer access only.",
      });
    }

    const readText = (name) => {
      const value = req.body?.[name];

      if (value !== undefined && typeof value !== "string") {
        const error = new Error(`Invalid ${name}.`);
        error.statusCode = 400;
        throw error;
      }

      return String(value || "").trim();
    };

    const trackingNumber = readText("trackingNumber");
    const courier = readText("courier");
    const storeName = readText("storeName");
    const itemDescription = readText("itemDescription");
    const notes = readText("notes");
    const weightText = readText("estimatedWeight");
    const estimatedWeight = Number(weightText || 0);

    if (!trackingNumber || trackingNumber.length > 200) {
      return res.status(400).json({
        success: false,
        message: "Enter a tracking number of 1–200 characters.",
      });
    }

    if (
      courier.length > 200 ||
      storeName.length > 200 ||
      itemDescription.length > 2000 ||
      notes.length > 5000
    ) {
      return res.status(400).json({
        success: false,
        message: "The courier, store, description or notes are too long.",
      });
    }

    if (!Number.isFinite(estimatedWeight) || estimatedWeight < 0) {
      return res.status(400).json({
        success: false,
        message: "Estimated weight must be zero or greater.",
      });
    }

    const existing = await PreAlert.findOne({
      customerEkonId: user.ekonId,
      trackingNumber,
    }).select("_id");

    if (existing) {
      return res.status(409).json({
        success: false,
        message: "A pre-alert already exists for that tracking number.",
      });
    }

    let detectedType = null;

    if (req.file) {
      detectedType = detectInvoiceType(req.file.buffer);

      if (!detectedType) {
        return res.status(400).json({
          success: false,
          message: "The invoice must be a valid PDF, JPG, PNG or WEBP file.",
        });
      }
    }

    preAlertNumber = `PAL-${randomUUID()}`;

    const invoiceFields = {};

    if (req.file) {
      cloudinary = configureCloudinary();

      try {
        asset = await uploadInvoice(
          cloudinary,
          req.file.buffer,
          `ekos/prealerts/${preAlertNumber}${detectedType.extension}`
        );
      } catch (error) {
        console.error("Pre-alert invoice storage failed:", error.message);

        return res.status(502).json({
          success: false,
          message:
            "Invoice storage is temporarily unavailable. The pre-alert was not submitted. Please try again.",
        });
      }

      const originalName = String(req.file.originalname || "invoice")
        .split(/[\\/]/)
        .pop()
        .replace(/[\u0000-\u001f\u007f]/g, "")
        .slice(0, 180);

      invoiceFields.invoiceFileName =
        `${path.parse(originalName).name || "invoice"}${detectedType.extension}`;

      invoiceFields.invoiceFilePath =
        `/api/pre-alerts/my/${preAlertNumber}/invoice`;

      invoiceFields.invoiceStorageProvider = "cloudinary";
      invoiceFields.invoiceCloudinaryPublicId = asset.public_id;
      invoiceFields.invoiceMimeType = detectedType.mimeType;
      invoiceFields.invoiceFileSize = req.file.size;
    }

    const preAlert = await PreAlert.create({
      preAlertNumber,
      customerEkonId: user.ekonId,
      customerName: user.name,
      trackingNumber,
      courier,
      storeName,
      itemDescription,
      estimatedWeight,
      notes,
      ...invoiceFields,
      status: "Submitted",
      date: new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/Jamaica",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date()),
    });

    res.setHeader("Cache-Control", "no-store");

    return res.status(201).json({
      success: true,
      message: "Pre-alert submitted successfully.",
      data: safeRecord(preAlert),
    });
  } catch (error) {
    /*
     * Remove a new asset only after confirming that no saved record
     * references it. An uncertain database result must retain the file.
     */
    if (asset && cloudinary && preAlertNumber) {
      try {
        const referenced = await PreAlert.exists({
          $or: [
            { preAlertNumber },
            { invoiceCloudinaryPublicId: asset.public_id },
          ],
        });

        if (!referenced) {
          await cloudinary.uploader.destroy(asset.public_id, {
            resource_type: "raw",
            type: "authenticated",
            invalidate: true,
          });
        }
      } catch (cleanupError) {
        console.error(
          "Pre-alert asset verification/cleanup failed:",
          cleanupError.message
        );
      }
    }

    console.error("Error creating pre-alert:", error.message);

    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.statusCode
        ? error.message
        : "Could not confirm submission. Refresh My Pre-Alerts before retrying.",
    });
  }
};

const openPreAlertInvoice = async (req, res) => {
  try {
    const user = req.user;

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required.",
      });
    }

    const query = {
      preAlertNumber: String(req.params.preAlertNumber || ""),
    };

    if (user.userType === "customer") {
      if (!user.ekonId) {
        return res.status(403).json({
          success: false,
          message: "Customer account could not be verified.",
        });
      }

      query.customerEkonId = user.ekonId;
    }

    const preAlert = await PreAlert.findOne(query).lean();

    if (!preAlert || !preAlert.invoiceFilePath) {
      return res.status(404).json({
        success: false,
        message: "Pre-alert invoice not found.",
      });
    }

    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");

    if (preAlert.invoiceStorageProvider === "cloudinary") {
      if (!preAlert.invoiceCloudinaryPublicId) {
        return res.status(500).json({
          success: false,
          message: "This invoice has an incomplete storage record.",
        });
      }

      const cloudinary = configureCloudinary();

      const signedUrl = cloudinary.utils.private_download_url(
        preAlert.invoiceCloudinaryPublicId,
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
        if (res.destroyed) {
          response.destroy();
          return;
        }

        if (response.statusCode !== 200) {
          response.resume();

          return res.status(502).json({
            success: false,
            message: "Invoice storage could not return this file. Please try again.",
          });
        }

        res.setHeader(
          "Content-Type",
          preAlert.invoiceMimeType || "application/octet-stream"
        );
        res.setHeader("Content-Disposition", "inline");

        pipeline(response, res, (error) => {
          if (error) {
            console.error("Pre-alert invoice streaming failed:", error.message);
          }
        });
      });

      upstream.setTimeout(30000, () => {
        upstream.destroy(new Error("Invoice storage request timed out."));
      });

      upstream.on("error", (error) => {
        console.error("Pre-alert invoice download failed:", error.message);

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

    // Read existing local files without modifying historical records.
    const prefix = "/uploads/prealerts/";
    const savedPath = String(preAlert.invoiceFilePath || "");

    if (!savedPath.startsWith(prefix)) {
      return res.status(404).json({
        success: false,
        message: "This invoice does not have a supported file reference.",
      });
    }

    const fileName = savedPath.slice(prefix.length);

    if (
      !fileName ||
      fileName.includes("\\") ||
      path.basename(fileName) !== fileName
    ) {
      return res.status(404).json({
        success: false,
        message: "Invalid invoice file reference.",
      });
    }

    const mimeTypes = {
      ".pdf": "application/pdf",
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".png": "image/png",
      ".webp": "image/webp",
    };

    const mimeType = mimeTypes[path.extname(fileName).toLowerCase()];

    if (!mimeType) {
      return res.status(404).json({
        success: false,
        message: "Unsupported invoice file type.",
      });
    }

    const localFile = path.resolve(legacyDirectory, fileName);

    try {
      await fs.promises.access(localFile, fs.constants.R_OK);
    } catch {
      return res.status(410).json({
        success: false,
        message: "This older invoice file is no longer available on the server.",
      });
    }

    res.setHeader("Content-Type", mimeType);
    res.setHeader("Content-Disposition", "inline");

    return res.sendFile(localFile, (error) => {
      if (error && !res.headersSent) {
        res.status(404).json({
          success: false,
          message: "The invoice file could not be opened.",
        });
      }
    });
  } catch (error) {
    console.error("Pre-alert invoice access failed:", error.message);

    if (!res.headersSent && !res.destroyed) {
      return res.status(500).json({
        success: false,
        message: "Could not open the invoice.",
      });
    }
  }
};

module.exports = {
  getPreAlerts,
  createPreAlert,
  openPreAlertInvoice,
};