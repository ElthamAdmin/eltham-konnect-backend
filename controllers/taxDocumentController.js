const TaxDocument = require(
  "../models/TaxDocument"
);

const Expense = require(
  "../models/Expense"
);

const GctRegisterEntry = require(
  "../models/GctRegisterEntry"
);

const GctFilingPeriod = require(
  "../models/GctFilingPeriod"
);

const T = require("../services/taxControl");

const {
  transact,
} = require(
  "../services/taxTransactionService"
);

const {
  writeAuditLog,
} = require("../utils/auditLogger");

const getTaxDocuments = T.handler(
  async (req, res) => {
    const entityCode = T.text(
      req.query.entityCode,
      "Business entity"
    ).toUpperCase();

    const query = {
      entityCode,
    };

    for (const field of [
      "documentType",
      "verificationStatus",
    ]) {
      if (req.query[field]) {
        query[field] = T.text(
          req.query[field],
          field
        );
      }
    }

    if (req.query.taxType) {
      query.taxType = T.canonical(
        T.text(
          req.query.taxType,
          "Tax type"
        )
      );
    }

    if (req.query.periodKey) {
      const periodKey = T.text(
        req.query.periodKey,
        "Reporting period"
      );

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

      query.periodKey =
        periodKey;
    }

    if (req.query.search) {
      const search = T.text(
        req.query.search,
        "Search"
      );

      if (search.length > 120) {
        T.fail(
          "Search must not exceed 120 characters."
        );
      }

      const escapedSearch =
        search.replace(
          /[.*+?^${}()|[\]\\]/g,
          "\\$&"
        );

      query.$or = [
        "documentNumber",
        "title",
        "externalReference",
        "receiptNumber",
      ].map((field) => ({
        [field]: {
          $regex:
            escapedSearch,

          $options: "i",
        },
      }));
    }

    const documents =
      await TaxDocument.find(
        query
      )
        .sort({
          documentDate: -1,
          createdAt: -1,
        })
        .limit(1000)
        .lean();

    return res.json({
      success: true,

      message:
        "Tax documents retrieved successfully. Up to 1,000 matching documents are displayed.",

      filters: {
        entityCode,

        periodKey:
          query.periodKey || "",
      },

      totalRecords:
        documents.length,

      data: documents,
    });
  }
);

const createTaxDocument = T.handler(
  async () => {
    T.fail(
      "Use the document upload action so the Cloudinary asset and its metadata are preserved. Registering an arbitrary file URL is not supported.",
      409
    );
  }
);

const verifyTaxDocument = T.handler(
  async (req, res) => {
    const body = req.body || {};

    const documentNumber =
      T.text(
        req.params.documentNumber,
        "Document number"
      ).toUpperCase();

    const action = T.text(
      body.action,
      "Verification action"
    ).toLowerCase();

    if (
      ![
        "verify",
        "reject",
      ].includes(action)
    ) {
      T.fail(
        "Action must be Verify or Reject."
      );
    }

    const notes = T.text(
      body.notes ?? "",
      "Verification notes",
      false
    );

    if (
      action === "reject" &&
      !notes
    ) {
      T.fail(
        "A reason is required when rejecting a document."
      );
    }

    const data = await transact(
      async (session) => {
        const document =
          await TaxDocument.findOne({
            documentNumber,
          }).session(session);

        if (!document) {
          T.fail(
            "Tax document not found.",
            404
          );
        }

        if (
          document.verificationStatus ===
          "Superseded"
        ) {
          T.fail(
            "A superseded document cannot be verified or rejected.",
            409
          );
        }

        if (
          document.storageProvider !==
            "Cloudinary" ||
          document.storageAccess !==
            "Authenticated" ||
          !document.cloudinaryPublicId ||
          !document.cloudinaryAssetId ||
          ![
            "image",
            "raw",
          ].includes(
            document.resourceType
          )
        ) {
          T.fail(
            "Confirm the authenticated Cloudinary asset metadata before verification.",
            409
          );
        }

        const nextStatus =
          action === "verify"
            ? "Verified"
            : "Rejected";

        if (
          document.verificationStatus ===
          nextStatus
        ) {
          return document;
        }

        const expenses =
          await Expense.find({
            "gctTreatment.supportingDocumentNumber":
              documentNumber,
          })
            .select("_id")
            .session(session)
            .lean();

        if (expenses.length) {
          const registers =
            await GctRegisterEntry.find({
              sourceDocumentType:
                "Expense",

              sourceDocumentId: {
                $in:
                  expenses.map(
                    (expense) =>
                      expense._id
                  ),
              },
            })
              .select(
                "filingNumber"
              )
              .session(session)
              .lean();

          const lockedFiling =
            await GctFilingPeriod.findOne({
              filingNumber: {
                $in:
                  registers.map(
                    (entry) =>
                      entry.filingNumber
                  ),
              },

              status: {
                $in: [
                  "Reviewed",
                  "Approved",
                  "Submitted",
                  "Paid",
                  "Reconciled",
                ],
              },
            }).session(session);

          if (lockedFiling) {
            T.fail(
              "This document supports a reviewed or later GCT filing. Its verification status requires a separately reviewed correction.",
              409
            );
          }
        }

        const beforeValues =
          document.toObject();

        document.verificationStatus =
          nextStatus;

        document.verifiedBy =
          T.actor(req);

        document.verifiedAt =
          new Date();

        document.verificationNotes =
          notes;

        await document.save({
          session,
        });

        await writeAuditLog({
          req,
          session,

          action:
            action === "verify"
              ? "VERIFY_TAX_DOCUMENT"
              : "REJECT_TAX_DOCUMENT",

          module: "Tax Center",

          description:
            `${action}: ${documentNumber}`,

          targetType:
            "TaxDocument",

          targetId:
            documentNumber,

          beforeValues,

          afterValues:
            document.toObject(),
        });

        return document;
      }
    );

    return res.json({
      success: true,

      message:
        "Document verification status saved with its audit record.",

      data,
    });
  }
);

module.exports = {
  getTaxDocuments,
  createTaxDocument,
  verifyTaxDocument,
};