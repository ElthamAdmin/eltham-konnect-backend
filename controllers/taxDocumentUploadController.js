const path = require("path");

const TaxDocument = require("../models/TaxDocument");

const BusinessEntity = require("../models/BusinessEntity");

const {
  configureCloudinary,
} = require("../config/cloudinary");

const getUserName = (user) =>
  user?.fullName ||
  user?.name ||
  user?.email ||
  "System User";

const sanitizeFileName = (fileName) =>
  String(fileName || "tax-document")
    .replace(/\.[^/.]+$/, "")
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "tax-document";

const createDocumentNumber = () =>
  `TDOC-${Date.now()}-${Math.floor(
    1000 + Math.random() * 9000
  )}`;

  const buildBusinessEntitySnapshot = (entity) => ({
  entityId: entity._id,
  entityCode: entity.entityCode,
  legalName: entity.legalName,
  tradingName: entity.tradingName || "",
  entityType: entity.entityType,
  lifecycleStatus: entity.lifecycleStatus,
  effectiveFrom: entity.effectiveFrom,
  effectiveTo: entity.effectiveTo,
  registrationNumber: entity.registrationNumber || "",
  registrationDate: entity.registrationDate || "",
  incorporationDate: entity.incorporationDate || null,
  trn: entity.trn || "",
  registeredAddress: entity.registeredAddress || "",
  fiscalYearStart: entity.fiscalYearStart || "",
  fiscalYearEnd: entity.fiscalYearEnd || "",
  taxTreatment: entity.taxTreatment,
  accountingConfiguration:
    entity.accountingConfiguration,
  predecessorEntityCode:
    entity.predecessorEntityCode || "",
  successorEntityCode:
    entity.successorEntityCode || "",
});

const hasSchemaPath = (pathName) =>
  Boolean(TaxDocument.schema.path(pathName));

const setNestedValue = (target, pathName, value) => {
  const segments = pathName.split(".");
  let current = target;

  segments.forEach((segment, index) => {
    if (index === segments.length - 1) {
      current[segment] = value;
      return;
    }

    if (
      !current[segment] ||
      typeof current[segment] !== "object"
    ) {
      current[segment] = {};
    }

    current = current[segment];
  });
};

const assignFirstSupportedPath = (
  target,
  candidatePaths,
  value
) => {
  const supportedPath = candidatePaths.find(hasSchemaPath);

  if (!supportedPath) {
    return "";
  }

  setNestedValue(target, supportedPath, value);
  return supportedPath;
};

const parseMetadata = (req) => {
  let parsedMetadata = {};

  if (req.body?.metadata) {
    try {
      parsedMetadata = JSON.parse(req.body.metadata);
    } catch (error) {
      const metadataError = new Error(
        "The metadata field must contain valid JSON."
      );

      metadataError.statusCode = 400;
      throw metadataError;
    }
  }

  return {
    ...req.body,
    ...parsedMetadata,
    metadata: undefined,
  };
};

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

const deleteCloudinaryAsset = async (uploadedAsset) => {
  if (!uploadedAsset?.public_id) {
    return;
  }

  const cloudinary = configureCloudinary();

  await cloudinary.uploader.destroy(
    uploadedAsset.public_id,
    {
      resource_type:
        uploadedAsset.resource_type || "image",
      type: "authenticated",
      invalidate: true,
    }
  );
};

const buildTaxDocumentPayload = ({
  metadata,
  file,
  uploadedAsset,
  entity,
  documentDate,
  user,
}) => {
  const userName = getUserName(user);
  const uploadedAt =
    uploadedAsset.created_at || new Date();

  const payload = {
    ...metadata,
  };
    payload.entityId = entity._id;
  payload.entityCode = entity.entityCode;
  payload.entitySnapshot =
    buildBusinessEntitySnapshot(entity);
  payload.documentDate = documentDate;

  delete payload.document;
  delete payload.metadata;

  assignFirstSupportedPath(
    payload,
    ["documentNumber"],
    metadata.documentNumber || createDocumentNumber()
  );

  assignFirstSupportedPath(
    payload,
    ["title", "documentTitle", "documentName"],
    metadata.title ||
      metadata.documentTitle ||
      metadata.documentName ||
      file.originalname
  );

  assignFirstSupportedPath(
    payload,
    ["originalFileName", "fileMetadata.originalFileName"],
    file.originalname
  );

  assignFirstSupportedPath(
    payload,
    ["fileName", "fileMetadata.fileName"],
    file.originalname
  );

  assignFirstSupportedPath(
    payload,
    ["mimeType", "fileMetadata.mimeType"],
    file.mimetype
  );

  assignFirstSupportedPath(
    payload,
    ["fileSize", "fileMetadata.fileSize"],
    file.size
  );

  assignFirstSupportedPath(
    payload,
    ["fileUrl", "documentUrl", "url"],
    uploadedAsset.secure_url || ""
  );

  assignFirstSupportedPath(
    payload,
    ["storageProvider"],
    "Cloudinary"
  );

  assignFirstSupportedPath(
    payload,
    ["storageAccess", "fileMetadata.storageAccess"],
    "Authenticated"
  );

  assignFirstSupportedPath(
    payload,
    [
      "storageKey",
      "publicId",
      "cloudinaryPublicId",
      "fileMetadata.publicId",
    ],
    uploadedAsset.public_id
  );

  assignFirstSupportedPath(
    payload,
    [
      "assetId",
      "cloudinaryAssetId",
      "fileMetadata.assetId",
    ],
    uploadedAsset.asset_id || ""
  );

  assignFirstSupportedPath(
    payload,
    ["resourceType", "fileMetadata.resourceType"],
    uploadedAsset.resource_type || ""
  );

  assignFirstSupportedPath(
    payload,
    ["format", "fileMetadata.format"],
    uploadedAsset.format || ""
  );

  assignFirstSupportedPath(
    payload,
    ["storageVersion", "version", "fileMetadata.version"],
    uploadedAsset.version || null
  );

  assignFirstSupportedPath(
    payload,
    ["uploadedAt", "fileMetadata.uploadedAt"],
    uploadedAt
  );

  assignFirstSupportedPath(
    payload,
    ["uploadedBy"],
    userName
  );

  assignFirstSupportedPath(
    payload,
    ["createdBy"],
    userName
  );

  assignFirstSupportedPath(
    payload,
    ["updatedBy"],
    userName
  );

  return payload;
};

const uploadTaxDocument = async (req, res) => {
  let uploadedAsset = null;

  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message:
          "A tax document is required. Use the multipart field name document.",
      });
    }

    const metadata = parseMetadata(req);

    if (
      !String(metadata.entityCode || "").trim()
    ) {
      return res.status(400).json({
        success: false,
        message: "An entity code is required.",
      });
    }

    if (
      !String(metadata.documentType || "").trim()
    ) {
      return res.status(400).json({
        success: false,
        message: "A document type is required.",
      });
    }

        const documentDateText = String(
      metadata.documentDate || ""
    ).trim();

    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(documentDateText)
    ) {
      return res.status(400).json({
        success: false,
        message:
          "A valid document date using YYYY-MM-DD format is required.",
      });
    }

    const documentDate = new Date(
      `${documentDateText}T12:00:00.000Z`
    );

    if (Number.isNaN(documentDate.getTime())) {
      return res.status(400).json({
        success: false,
        message: "The document date is invalid.",
      });
    }

    const entityCode = String(
      metadata.entityCode
    ).trim();

    const entity = await BusinessEntity.findOne({
      entityCode,
    });

    if (!entity) {
      return res.status(404).json({
        success: false,
        message:
          `Business entity ${entityCode} was not found.`,
      });
    }

    const effectiveFrom = new Date(
      `${entity.effectiveFrom}T00:00:00.000Z`
    );

    const effectiveTo = entity.effectiveTo
      ? new Date(
          `${entity.effectiveTo}T23:59:59.999Z`
        )
      : null;

    if (
      documentDate < effectiveFrom ||
      (effectiveTo && documentDate > effectiveTo)
    ) {
      return res.status(400).json({
        success: false,
        message:
          `${entityCode} was not effective on ${documentDateText}.`,
      });
    }

    const extension = path
      .extname(req.file.originalname || "")
      .toLowerCase();

    const publicId = `${sanitizeFileName(
      req.file.originalname
    )}-${Date.now()}${extension}`;

    uploadedAsset = await uploadBufferToCloudinary({
      buffer: req.file.buffer,
      publicId,
      originalFileName: req.file.originalname,
    });

    const documentPayload = buildTaxDocumentPayload({
  metadata,
  file: req.file,
  uploadedAsset,
  entity,
  documentDate,
  user: req.user,
});

    const taxDocument =
      await TaxDocument.create(documentPayload);

    return res.status(201).json({
      success: true,
      message:
        "Tax document uploaded and registered successfully.",
      data: taxDocument,
    });
  } catch (error) {
    if (uploadedAsset?.public_id) {
      try {
        await deleteCloudinaryAsset(uploadedAsset);
      } catch (cleanupError) {
        console.error(
          "Tax document Cloudinary cleanup error:",
          cleanupError
        );
      }
    }

    console.error(
      "Tax document upload and registration error:",
      error
    );

    return res
      .status(error.statusCode || 400)
      .json({
        success: false,
        message:
          error.message ||
          "Could not upload and register the tax document.",
      });
  }
};

module.exports = {
  uploadTaxDocument,
};