const path = require("path");
const {
  configureCloudinary,
} = require("../config/cloudinary");

const sanitizeFileName = (fileName) =>
  String(fileName || "tax-document")
    .replace(/\.[^/.]+$/, "")
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "tax-document";

const uploadBufferToCloudinary = ({
  buffer,
  publicId,
  originalFileName,
}) =>
  new Promise((resolve, reject) => {
    const cloudinary = configureCloudinary();

    const uploadStream = cloudinary.uploader.upload_stream(
      {
        resource_type: "auto",
        type: "authenticated",
        folder: "eltham-konnect/tax-center/documents",
        public_id: publicId,
        overwrite: false,
        use_filename: false,
        unique_filename: true,
        context: {
          originalFileName,
          sourceModule: "Tax Center",
        },
      },
      (error, result) => {
        if (error) {
          return reject(error);
        }

        return resolve(result);
      }
    );

    uploadStream.end(buffer);
  });

const uploadTaxDocument = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message:
          "A tax document is required. Use the multipart field name document.",
      });
    }

    const extension = path
      .extname(req.file.originalname || "")
      .toLowerCase();

    const baseFileName = sanitizeFileName(
      req.file.originalname
    );

    const publicId = `${baseFileName}-${Date.now()}${extension}`;

    const uploadedAsset = await uploadBufferToCloudinary({
      buffer: req.file.buffer,
      publicId,
      originalFileName: req.file.originalname,
    });

    return res.status(201).json({
      success: true,
      message: "Tax document uploaded securely successfully.",
      data: {
        storageProvider: "Cloudinary",
        storageAccess: "Authenticated",
        publicId: uploadedAsset.public_id,
        assetId: uploadedAsset.asset_id || "",
        resourceType: uploadedAsset.resource_type || "",
        format: uploadedAsset.format || extension.replace(".", ""),
        version: uploadedAsset.version || null,
        fileUrl: uploadedAsset.secure_url || "",
        originalFileName: req.file.originalname,
        mimeType: req.file.mimetype,
        fileSize: req.file.size,
        width: uploadedAsset.width || null,
        height: uploadedAsset.height || null,
        uploadedAt:
          uploadedAsset.created_at || new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error("Tax document Cloudinary upload error:", error);

    return res.status(500).json({
      success: false,
      message: "Could not upload the tax document securely.",
      error: error.message,
    });
  }
};

module.exports = {
  uploadTaxDocument,
};