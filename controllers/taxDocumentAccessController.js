const TaxDocument = require("../models/TaxDocument");

const {
  configureCloudinary,
} = require("../config/cloudinary");

const T = require("../services/taxControl");

const {
  transact,
} = require("../services/taxTransactionService");

const {
  writeAuditLog,
} = require("../utils/auditLogger");

const FORMATS = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",

  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":
    "xlsx",

  "application/vnd.ms-excel":
    "xls",

  "text/csv": "csv",
};

const deriveMetadata = (fileUrl) => {
  let url;

  try {
    url = new URL(fileUrl);
  } catch {
    T.fail(
      "The stored document URL is invalid.",
      409
    );
  }

  if (
    url.protocol !== "https:" ||
    url.hostname !== "res.cloudinary.com" ||
    url.username ||
    url.password
  ) {
    T.fail(
      "Metadata recovery requires a standard HTTPS Cloudinary URL.",
      409
    );
  }

  const parts = url.pathname
    .split("/")
    .filter(Boolean)
    .map(decodeURIComponent);

  if (
    parts[0] !==
      process.env.CLOUDINARY_CLOUD_NAME ||
    !["image", "raw"].includes(parts[1]) ||
    parts[2] !== "authenticated" ||
    !/^v\d+$/.test(parts[3] || "")
  ) {
    T.fail(
      "The URL must identify an authenticated asset in the configured Cloudinary account, with an explicit version.",
      409
    );
  }

  const resourceType = parts[1];
  const version = Number(parts[3].slice(1));

  let publicId = parts.slice(4).join("/");

  // Raw public IDs include their extension.
  // Image public IDs exclude the delivery format.
  if (resourceType === "image") {
    const extension = publicId.lastIndexOf(".");

    if (extension > publicId.lastIndexOf("/")) {
      publicId = publicId.slice(0, extension);
    }
  }

  if (!publicId) {
    T.fail(
      "The asset public ID could not be determined.",
      409
    );
  }

  return {
    publicId,
    resourceType,
    version,
  };
};

const backfillTaxDocumentCloudinaryMetadata =
  T.handler(async (req, res) => {
    if (req.user?.role !== "Admin") {
      T.fail(
        "Only an administrator can recover document storage metadata.",
        403
      );
    }

    const documentNumber = T.text(
      req.params.documentNumber,
      "Document number"
    ).toUpperCase();

    const document = await TaxDocument.findOne({
      documentNumber,
    });

    if (!document) {
      T.fail("Tax document not found.", 404);
    }

    if (document.storageProvider !== "Cloudinary") {
      T.fail(
        "This document is not stored in Cloudinary.",
        409
      );
    }

    const derived = deriveMetadata(document.fileUrl);
    const cloudinary = configureCloudinary();

    const asset = await cloudinary.api.resource(
      derived.publicId,
      {
        resource_type: derived.resourceType,
        type: "authenticated",
      }
    );

    if (
      !asset.asset_id ||
      asset.public_id !== derived.publicId ||
      asset.resource_type !== derived.resourceType ||
      Number(asset.version) !== derived.version
    ) {
      T.fail(
        "The current Cloudinary asset does not match the stored URL and version. Review it without replacing the document.",
        409
      );
    }

    const data = await transact(async (session) => {
      const current = await TaxDocument.findById(
        document._id
      ).session(session);

      if (
        !current ||
        current.fileUrl !== document.fileUrl
      ) {
        T.fail(
          "The document changed during metadata recovery. Refresh and review it.",
          409
        );
      }

      if (
        (current.cloudinaryPublicId &&
          current.cloudinaryPublicId !== asset.public_id) ||
        (current.cloudinaryAssetId &&
          current.cloudinaryAssetId !== asset.asset_id) ||
        (current.resourceType &&
          current.resourceType !== asset.resource_type) ||
        (current.storageVersion !== null &&
          current.storageVersion !== undefined &&
          Number(current.storageVersion) !== Number(asset.version))
      ) {
        T.fail(
          "Existing storage metadata conflicts with the Cloudinary asset. It will not be overwritten.",
          409
        );
      }

      const beforeValues = current.toObject();

      current.storageAccess = "Authenticated";
      current.cloudinaryPublicId = asset.public_id;
      current.cloudinaryAssetId = asset.asset_id;
      current.resourceType = asset.resource_type;
      current.storageVersion = asset.version;

      await current.save({ session });

      await writeAuditLog({
        req,
        session,
        action: "RECOVER_TAX_DOCUMENT_METADATA",
        module: "Tax Center",
        description: `Recovered metadata for ${documentNumber}`,
        targetType: "TaxDocument",
        targetId: documentNumber,
        beforeValues,
        afterValues: current.toObject(),
      });

      return current;
    });

    return res.json({
      success: true,
      message:
        "Cloudinary metadata confirmed and saved. The stored file was not replaced.",
      data: {
        documentNumber: data.documentNumber,
        cloudinaryPublicId: data.cloudinaryPublicId,
        cloudinaryAssetId: data.cloudinaryAssetId,
        resourceType: data.resourceType,
        storageVersion: data.storageVersion,
      },
    });
  });

const getTaxDocumentAccessLink = T.handler(
  async (req, res) => {
    const documentNumber = T.text(
      req.params.documentNumber,
      "Document number"
    ).toUpperCase();

    const document = await TaxDocument.findOne({
      documentNumber,
    });

    if (!document) {
      T.fail("Tax document not found.", 404);
    }

    if (
      document.storageProvider !== "Cloudinary" ||
      document.storageAccess !== "Authenticated" ||
      !document.cloudinaryPublicId ||
      !document.cloudinaryAssetId ||
      !["image", "raw"].includes(document.resourceType) ||
      !document.storageVersion
    ) {
      T.fail(
        "This document requires reviewed Cloudinary metadata before secure access.",
        409
      );
    }

    const format = FORMATS[document.mimeType];

    if (!format) {
      T.fail(
        "The stored document MIME type requires review.",
        409
      );
    }

    const cloudinary = configureCloudinary();

    const asset = await cloudinary.api.resource(
      document.cloudinaryPublicId,
      {
        resource_type: document.resourceType,
        type: "authenticated",
      }
    );

    if (
      asset.asset_id !== document.cloudinaryAssetId ||
      asset.public_id !== document.cloudinaryPublicId ||
      Number(asset.version) !== Number(document.storageVersion)
    ) {
      T.fail(
        "The Cloudinary asset differs from the preserved document metadata. Review it before opening.",
        409
      );
    }

    const expiresAt =
      Math.floor(Date.now() / 1000) + 300;

    const accessUrl =
      cloudinary.utils.private_download_url(
        document.cloudinaryPublicId,
        format,
        {
          resource_type: document.resourceType,
          type: "authenticated",
          expires_at: expiresAt,
          attachment: true,
        }
      );

    return res.json({
      success: true,
      message: "Temporary document access generated.",
      data: {
        documentNumber,
        title: document.title,
        originalFileName: document.fileName,
        mimeType: document.mimeType,
        accessUrl,
        expiresAt: new Date(
          expiresAt * 1000
        ).toISOString(),
        validForSeconds: 300,
      },
    });
  }
);

module.exports = {
  backfillTaxDocumentCloudinaryMetadata,
  getTaxDocumentAccessLink,
};