const crypto = require("crypto");

const TaxDocument = require(
  "../models/TaxDocument"
);

const BusinessEntity = require(
  "../models/BusinessEntity"
);

const {
  configureCloudinary,
} = require("../config/cloudinary");

const {
  writeAuditLog,
} = require("../utils/auditLogger");

const {
  transact,
} = require(
  "../services/taxTransactionService"
);

const T = require("../services/taxControl");
const S = require("../services/taxScopeService");

const FILE_TYPES = {
  "application/pdf": {
    extension: "pdf",
    resourceType: "image",
  },

  "image/jpeg": {
    extension: "jpg",
    resourceType: "image",
  },

  "image/png": {
    extension: "png",
    resourceType: "image",
  },

  "image/webp": {
    extension: "webp",
    resourceType: "image",
  },

  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": {
    extension: "xlsx",
    resourceType: "raw",
  },

  "application/vnd.ms-excel": {
    extension: "xls",
    resourceType: "raw",
  },

  "text/csv": {
    extension: "csv",
    resourceType: "raw",
  },
};

const optionalDate = (
  value,
  label
) =>
  value
    ? new Date(
        `${T.date(
          value,
          label
        )}T12:00:00.000Z`
      )
    : null;

const uploadTaxDocument = T.handler(
  async (req, res) => {
    const file = req.file;
    const body = req.body || {};

    if (
      !file?.buffer ||
      file.buffer.length === 0
    ) {
      T.fail(
        "Select one document to upload."
      );
    }

    if (
      file.buffer.length >
      10 * 1024 * 1024
    ) {
      T.fail(
        "The document exceeds the 10 MB upload limit.",
        413
      );
    }

    const fileType =
      FILE_TYPES[file.mimetype];

    if (!fileType) {
      T.fail(
        "Unsupported document format."
      );
    }

    for (const field of [
      "verificationStatus",
      "verifiedBy",
      "verifiedAt",
      "taxRecordId",
      "taxNumber",
      "incomeTaxEstimateId",
      "estimateNumber",
      "gctFilingPeriodId",
      "filingNumber",
      "accountTransactionId",
      "transactionNumber",
      "cloudinaryPublicId",
      "cloudinaryAssetId",
      "fileUrl",
    ]) {
      if (
        body[field] !== undefined &&
        body[field] !== ""
      ) {
        T.fail(
          `${field} cannot be supplied during upload. Use the separate verification or document-link action.`
        );
      }
    }

    const entityCode = T.text(
      body.entityCode,
      "Business entity"
    ).toUpperCase();

    const taxType = T.canonical(
      T.text(
        body.taxType,
        "Tax type"
      )
    );

    const documentType = T.text(
      body.documentType,
      "Document type"
    );

    if (
      !TaxDocument.schema
        .path("taxType")
        .enumValues.includes(taxType)
    ) {
      T.fail(
        "Invalid document tax type."
      );
    }

    if (
      !TaxDocument.schema
        .path("documentType")
        .enumValues.includes(
          documentType
        )
    ) {
      T.fail(
        "Invalid document type."
      );
    }

    const title = T.text(
      body.title,
      "Document title"
    );

    const documentDate =
      optionalDate(
        body.documentDate,
        "Document date"
      );

    if (!documentDate) {
      T.fail(
        "Document date is required."
      );
    }

    const periodKey = T.text(
      body.periodKey ?? "",
      "Reporting period",
      false
    );

    if (periodKey) {
      if (
        /^\d{4}$/.test(periodKey)
      ) {
        T.date(
          `${periodKey}-01-01`,
          "Reporting year"
        );
      } else {
        T.period(periodKey);
      }
    }

    const periodStart =
      optionalDate(
        body.periodStart,
        "Period start"
      );

    const periodEnd =
      optionalDate(
        body.periodEnd,
        "Period end"
      );

    if (
      Boolean(periodStart) !==
      Boolean(periodEnd)
    ) {
      T.fail(
        "Supply both period dates or leave both blank."
      );
    }

    if (
      periodStart &&
      periodEnd < periodStart
    ) {
      T.fail(
        "Period end cannot precede period start."
      );
    }

    if (
      body.confidential !== undefined &&
      ![
        true,
        false,
        "true",
        "false",
      ].includes(
        body.confidential
      )
    ) {
      T.fail(
        "Confidential must be true or false."
      );
    }

    const metadata = {
      taxType,
      documentType,
      title,
      documentDate,
      periodKey,
      periodStart,
      periodEnd,

      receivedDate:
        optionalDate(
          body.receivedDate,
          "Received date"
        ),

      description: T.text(
        body.description ?? "",
        "Description",
        false
      ),

      externalReference: T.text(
        body.externalReference ?? "",
        "External reference",
        false
      ),

      receiptNumber: T.text(
        body.receiptNumber ?? "",
        "Receipt number",
        false
      ),

      notes: T.text(
        body.notes ?? "",
        "Notes",
        false
      ),

      confidential:
        body.confidential !== false &&
        body.confidential !== "false",
    };

    const entity =
      await BusinessEntity.findOne({
        entityCode,
      });

    if (!entity) {
      T.fail(
        "Business entity not found.",
        404
      );
    }

    // Registration evidence may predate
    // operations. Later receipts may support
    // obligations of a predecessor business.
    const documentNumber =
      T.number("TDOC");

    const originalFileName = T.text(
      file.originalname,
      "Original file name"
    )
      .replace(
        /[\\/\u0000-\u001f]/g,
        "_"
      );

    const publicId =
      fileType.resourceType === "raw"
        ? `${documentNumber}.${fileType.extension}`
        : documentNumber;

    const cloudinary =
      configureCloudinary();

    const asset = await new Promise(
      (resolve, reject) => {
        const stream =
          cloudinary.uploader.upload_stream(
            {
              resource_type:
                fileType.resourceType,

              type:
                "authenticated",

              folder:
                "eltham-konnect/tax-center/documents",

              public_id:
                publicId,

              overwrite: false,
              use_filename: false,
              unique_filename: false,
            },

            (error, result) => {
              if (error) {
                reject(error);
              } else {
                resolve(result);
              }
            }
          );

        stream.end(file.buffer);
      }
    );

    if (
      !asset?.public_id ||
      !asset.asset_id ||
      !asset.secure_url ||
      asset.resource_type !==
        fileType.resourceType
    ) {
      T.fail(
        "Cloudinary did not return complete document metadata. The upload requires review.",
        502
      );
    }

    let savedDocument;

    try {
      savedDocument =
        await transact(
          async (session) => {
            const currentEntity =
              await BusinessEntity.findById(
                entity._id
              ).session(session);

            if (
              !currentEntity ||
              currentEntity.entityCode !==
                entityCode
            ) {
              T.fail(
                "Business identity changed during upload. Review the preserved upload before retrying.",
                409
              );
            }

            const [document] =
              await TaxDocument.create(
                [
                  {
                    ...metadata,

                    documentNumber,

                    entityId:
                      currentEntity._id,

                    entityCode,

                    entitySnapshot:
                      S.snapshot(
                        currentEntity
                      ),

                    fileName:
                      originalFileName,

                    fileUrl:
                      asset.secure_url,

                    mimeType:
                      file.mimetype,

                    fileSize:
                      file.buffer.length,

                    storageProvider:
                      "Cloudinary",

                    storageAccess:
                      "Authenticated",

                    cloudinaryPublicId:
                      asset.public_id,

                    cloudinaryAssetId:
                      asset.asset_id,

                    resourceType:
                      asset.resource_type,

                    storageVersion:
                      asset.version,

                    checksum:
                      crypto
                        .createHash(
                          "sha256"
                        )
                        .update(
                          file.buffer
                        )
                        .digest("hex"),

                    verificationStatus:
                      "Unverified",

                    uploadedBy:
                      T.actor(req),
                  },
                ],
                { session }
              );

            await writeAuditLog({
              req,
              session,

              action:
                "UPLOAD_TAX_DOCUMENT",

              module: "Tax Center",

              description:
                `Uploaded ${documentNumber}`,

              targetType:
                "TaxDocument",

              targetId:
                documentNumber,

              metadata: {
                entityCode,

                cloudinaryAssetId:
                  asset.asset_id,

                cloudinaryPublicId:
                  asset.public_id,
              },
            });

            return document;
          }
        );
    } catch (error) {
      // A database commit can succeed even
      // when its acknowledgement is lost.
      // Never delete the preserved asset
      // merely because saving returned an error.
      console.error(
        "Tax document registration requires outcome check:",
        {
          documentNumber,
          cloudinaryAssetId:
            asset.asset_id,
          message: error.message,
        }
      );

      try {
        savedDocument =
          await TaxDocument.findOne({
            documentNumber,

            cloudinaryAssetId:
              asset.asset_id,
          }).read("primary");
      } catch (lookupError) {
        console.error(
          "Tax document outcome lookup failed:",
          lookupError.message
        );
      }

      if (!savedDocument) {
        T.fail(
          `Cloudinary received the upload, but document registration could not be confirmed. Review upload ${documentNumber} before uploading it again.`,
          503
        );
      }
    }

    return res.status(201).json({
      success: true,

      message:
        "Document preserved in authenticated Cloudinary storage and registered successfully.",

      data: savedDocument,
    });
  }
);

module.exports = {
  uploadTaxDocument,
};