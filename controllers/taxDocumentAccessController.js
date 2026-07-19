const path = require("path");

const TaxDocument = require("../models/TaxDocument");

const {
  configureCloudinary,
} = require("../config/cloudinary");

const getFormat = (document) => {
  const fromFileName = path
    .extname(document.fileName || "")
    .replace(".", "")
    .toLowerCase();

  if (fromFileName) {
    return fromFileName;
  }

  try {
    return path
      .extname(new URL(document.fileUrl).pathname)
      .replace(".", "")
      .toLowerCase();
  } catch (error) {
    return "";
  }
};

const extractCloudinaryMetadataFromUrl = (fileUrl) => {
  const parsedUrl = new URL(fileUrl);
  const segments = parsedUrl.pathname
    .split("/")
    .filter(Boolean);

  const resourceType =
    segments.find((segment) =>
      ["image", "video", "raw"].includes(segment)
    ) || "image";

  const versionIndex = segments.findIndex((segment) =>
    /^v\d+$/.test(segment)
  );

  if (
    versionIndex < 0 ||
    versionIndex >= segments.length - 1
  ) {
    throw new Error(
      "The stored Cloudinary URL does not contain a recognizable asset version."
    );
  }

  const version = Number(
    segments[versionIndex].slice(1)
  );

  const assetPath = segments
    .slice(versionIndex + 1)
    .map(decodeURIComponent)
    .join("/");

  const lastExtensionIndex =
    assetPath.lastIndexOf(".");

  const publicId =
    lastExtensionIndex > 0
      ? assetPath.slice(0, lastExtensionIndex)
      : assetPath;

  if (!publicId) {
    throw new Error(
      "The Cloudinary public ID could not be derived from the stored URL."
    );
  }

  return {
    publicId,
    resourceType,
    version,
  };
};

const backfillTaxDocumentCloudinaryMetadata = async (
  req,
  res
) => {
  try {
    const documentNumber = String(
      req.params.documentNumber || ""
    ).trim();

    const taxDocument = await TaxDocument.findOne({
      documentNumber,
    });

    if (!taxDocument) {
      return res.status(404).json({
        success: false,
        message:
          `Tax document ${documentNumber} was not found.`,
      });
    }

    if (
      String(taxDocument.storageProvider || "") !==
      "Cloudinary"
    ) {
      return res.status(400).json({
        success: false,
        message:
          `${documentNumber} is not stored in Cloudinary.`,
      });
    }

    if (!String(taxDocument.fileUrl || "").trim()) {
      return res.status(400).json({
        success: false,
        message:
          `${documentNumber} does not have a stored Cloudinary URL.`,
      });
    }

    const derivedMetadata =
      extractCloudinaryMetadataFromUrl(
        taxDocument.fileUrl
      );

    const cloudinary = configureCloudinary();

    const cloudinaryAsset =
      await cloudinary.api.resource(
        derivedMetadata.publicId,
        {
          resource_type:
            derivedMetadata.resourceType,
          type: "authenticated",
        }
      );

    taxDocument.storageAccess = "Authenticated";
    taxDocument.cloudinaryPublicId =
      cloudinaryAsset.public_id;
    taxDocument.cloudinaryAssetId =
      cloudinaryAsset.asset_id || "";
    taxDocument.resourceType =
      cloudinaryAsset.resource_type ||
      derivedMetadata.resourceType;
    taxDocument.storageVersion =
      cloudinaryAsset.version ||
      derivedMetadata.version;

    await taxDocument.save();

    return res.json({
      success: true,
      message:
        `${documentNumber} Cloudinary metadata backfilled successfully.`,
      data: {
        documentNumber: taxDocument.documentNumber,
        storageProvider:
          taxDocument.storageProvider,
        storageAccess:
          taxDocument.storageAccess,
        cloudinaryPublicId:
          taxDocument.cloudinaryPublicId,
        cloudinaryAssetId:
          taxDocument.cloudinaryAssetId,
        resourceType:
          taxDocument.resourceType,
        storageVersion:
          taxDocument.storageVersion,
      },
    });
  } catch (error) {
    console.error(
      "Tax document Cloudinary backfill error:",
      error
    );

    return res.status(400).json({
      success: false,
      message:
        "Could not backfill the tax document Cloudinary metadata.",
      error: error.message,
    });
  }
};

const getTaxDocumentAccessLink = async (req, res) => {
  try {
    const documentNumber = String(
      req.params.documentNumber || ""
    ).trim();

    const taxDocument = await TaxDocument.findOne({
      documentNumber,
    });

    if (!taxDocument) {
      return res.status(404).json({
        success: false,
        message:
          `Tax document ${documentNumber} was not found.`,
      });
    }

    if (
      String(taxDocument.storageProvider || "") !==
      "Cloudinary"
    ) {
      return res.status(400).json({
        success: false,
        message:
          `${documentNumber} is not stored in Cloudinary.`,
      });
    }

    if (
      !String(
        taxDocument.cloudinaryPublicId || ""
      ).trim()
    ) {
      return res.status(409).json({
        success: false,
        message:
          `${documentNumber} requires Cloudinary metadata backfill before it can be accessed securely.`,
      });
    }

    const format = getFormat(taxDocument);

    if (!format) {
      return res.status(400).json({
        success: false,
        message:
          `${documentNumber} does not have a recognizable file format.`,
      });
    }

    const cloudinary = configureCloudinary();

    const expiresAt =
      Math.floor(Date.now() / 1000) + 5 * 60;

    const accessUrl =
      cloudinary.utils.private_download_url(
        taxDocument.cloudinaryPublicId,
        format,
        {
          resource_type:
            taxDocument.resourceType || "image",
          type: "authenticated",
          expires_at: expiresAt,
          attachment: true,
        }
      );

    return res.json({
      success: true,
      message:
        "Temporary tax document access link generated successfully.",
      data: {
        documentNumber:
          taxDocument.documentNumber,
        title: taxDocument.title,
        originalFileName:
          taxDocument.fileName,
        mimeType: taxDocument.mimeType,
        accessUrl,
        expiresAt: new Date(
          expiresAt * 1000
        ).toISOString(),
        validForSeconds: 300,
      },
    });
  } catch (error) {
    console.error(
      "Tax document access-link error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Could not generate a secure tax document access link.",
      error: error.message,
    });
  }
};

module.exports = {
  backfillTaxDocumentCloudinaryMetadata,
  getTaxDocumentAccessLink,
};