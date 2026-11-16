const TaxDocument = require("../models/TaxDocument");
const TaxRecord = require("../models/TaxRecord");
const IncomeTaxEstimate = require("../models/IncomeTaxEstimate");
const GctFilingPeriod = require("../models/GctFilingPeriod");
const AccountTransaction = require("../models/AccountTransaction");
const JournalEntry = require("../models/JournalEntry");

const T = require("../services/taxControl");

const {
  transact,
} = require("../services/taxTransactionService");

const {
  writeAuditLog,
} = require("../utils/auditLogger");

const linkTaxDocument = T.handler(
  async (req, res) => {
    const body = req.body || {};

    const documentNumber = T.text(
      req.params.documentNumber,
      "Document number"
    ).toUpperCase();

    const notes = T.text(
      body.notes ?? "",
      "Linkage notes",
      false
    );

    const suppliedTargets = [
      "taxNumber",
      "estimateNumber",
      "filingNumber",
      "transactionNumber",
    ].filter(
      (field) =>
        body[field] !== undefined &&
        body[field] !== ""
    );

    const paymentLink =
      suppliedTargets.includes("transactionNumber");

    if (
      suppliedTargets.length === 0 ||
      (!paymentLink && suppliedTargets.length !== 1) ||
      (paymentLink &&
        suppliedTargets.some(
          (field) =>
            !["taxNumber", "transactionNumber"].includes(field)
        ))
    ) {
      T.fail(
        "Select one target. A payment transaction may also include its related tax obligation."
      );
    }

    const data = await transact(async (session) => {
      const document = await TaxDocument.findOne({
        documentNumber,
      }).session(session);

      if (!document) {
        T.fail("Tax document not found.", 404);
      }

      if (
        ["Rejected", "Superseded"].includes(
          document.verificationStatus
        )
      ) {
        T.fail(
          "A rejected or superseded document cannot receive new links.",
          409
        );
      }

      const beforeValues = document.toObject();
      const performedBy = T.actor(req);
      const performedAt = new Date();
      let changed = false;
      let relatedTaxRecord = null;

      const configurations = [
        {
          field: "taxNumber",
          idField: "taxRecordId",
          Model: TaxRecord,
          targetType: "Tax Record",
        },
        {
          field: "estimateNumber",
          idField: "incomeTaxEstimateId",
          Model: IncomeTaxEstimate,
          targetType: "Income Tax Estimate",
        },
        {
          field: "filingNumber",
          idField: "gctFilingPeriodId",
          Model: GctFilingPeriod,
          targetType: "GCT Filing",
        },
      ];

      const requested = {};

      for (const field of suppliedTargets) {
        requested[field] = T.text(
          body[field],
          field
        );
      }

      if (paymentLink && !requested.taxNumber) {
        requested.taxNumber = document.taxNumber;
      }

      if (paymentLink && !requested.taxNumber) {
        T.fail(
          "The related tax obligation number is required."
        );
      }

      const checkTarget = (
        target,
        targetTaxType
      ) => {
        if (
          !target.entityCode ||
          target.entityCode !== document.entityCode ||
          (target.entityId &&
            String(target.entityId) !==
              String(document.entityId))
        ) {
          T.fail(
            "Document and target require matching business attribution.",
            409
          );
        }

        if (
          !document.periodKey ||
          !target.periodKey ||
          document.periodKey !== target.periodKey
        ) {
          T.fail(
            "Document and target require matching reporting periods.",
            409
          );
        }

        if (
          T.canonical(document.taxType) !==
          T.canonical(targetTaxType)
        ) {
          T.fail(
            "Document and target tax types disagree.",
            409
          );
        }

        if (target.status === "Cancelled") {
          T.fail(
            "Documents cannot be linked to a cancelled target.",
            409
          );
        }
      };

      const addHistory = (
        targetType,
        targetReference
      ) => {
        document.linkageHistory.push({
          targetType,
          targetReference,
          action: "Linked",
          notes,
          performedBy,
          performedAt,
        });

        changed = true;
      };

      for (const configuration of configurations) {
        const {
          field,
          idField,
          Model,
          targetType,
        } = configuration;

        if (!requested[field]) {
          continue;
        }

        const target = await Model.findOne({
          [field]: requested[field],
        }).session(session);

        if (!target) {
          T.fail(`${targetType} not found.`, 404);
        }

        const reference = target[field];

        if (
          (document[field] &&
            document[field] !== reference) ||
          (document[idField] &&
            String(document[idField]) !==
              String(target._id))
        ) {
          T.fail(
            "An existing document link cannot be replaced through this action.",
            409
          );
        }

        let targetTaxType = target.taxType;

        if (field === "estimateNumber") {
          if (
            ![
              "Individual Income Tax",
              "Company Income Tax",
            ].includes(target.incomeTaxType)
          ) {
            T.fail(
              "The estimate has an unsupported tax type.",
              409
            );
          }

          targetTaxType = target.incomeTaxType;
        }

        if (field === "filingNumber") {
          targetTaxType = "GCT";
        }

        checkTarget(target, targetTaxType);

        if (field === "taxNumber") {
          relatedTaxRecord = target;
        }

        if (!document[field]) {
          document[field] = reference;
          document[idField] = target._id;

          addHistory(
            targetType,
            reference
          );
        } else if (!document[idField]) {
          document[idField] = target._id;
          changed = true;
        }
      }

      if (paymentLink) {
        const transaction =
          await AccountTransaction.findOne({
            transactionNumber:
              requested.transactionNumber,

            transactionType:
              "Tax Payment",

            taxNumber:
              relatedTaxRecord.taxNumber,
          }).session(session);

        if (
          !transaction ||
          transaction.taxPeriodKey !==
            document.periodKey ||
          T.canonical(transaction.taxType) !==
            T.canonical(document.taxType)
        ) {
          T.fail(
            "The payment does not match the obligation, reporting period, and tax type.",
            409
          );
        }

        if (
          (document.transactionNumber &&
            document.transactionNumber !==
              transaction.transactionNumber) ||
          (document.accountTransactionId &&
            String(document.accountTransactionId) !==
              String(transaction._id))
        ) {
          T.fail(
            "The document is already linked to another payment.",
            409
          );
        }

        const remittance =
          relatedTaxRecord.remittances.find(
            (entry) =>
              entry.journalEntryNumber ===
                transaction.journalEntryNumber &&
              entry.paymentReference ===
                transaction.reference &&
              T.amount(entry.amount) ===
                T.amount(transaction.amount)
          );

        const journal =
          await JournalEntry.findOne({
            entryNumber:
              transaction.journalEntryNumber,

            entityCode:
              document.entityCode,

            reportingPeriodKey:
              document.periodKey,

            status: "Posted",
          }).session(session);

        if (
          !remittance ||
          !journal ||
          journal.reversalEntryNumber
        ) {
          T.fail(
            "The payment requires matching remittance and unreversed posted-journal evidence.",
            409
          );
        }

        if (!document.transactionNumber) {
          document.transactionNumber =
            transaction.transactionNumber;

          document.accountTransactionId =
            transaction._id;

          document.journalEntryNumber =
            transaction.journalEntryNumber;

          addHistory(
            "Tax Payment",
            transaction.transactionNumber
          );
        }
      }

      if (changed) {
        document.linkedBy = performedBy;
        document.linkedAt = performedAt;

        await document.save({ session });

        await writeAuditLog({
          req,
          session,
          action: "LINK_TAX_DOCUMENT",
          module: "Tax Center",
          description:
            `Linked ${documentNumber}`,
          targetType: "TaxDocument",
          targetId: documentNumber,
          beforeValues,
          afterValues: document.toObject(),
        });
      }

      return document;
    });

    return res.json({
      success: true,
      message:
        "Document links checked and saved. Cloudinary storage was not changed.",
      data,
    });
  }
);

module.exports = {
  linkTaxDocument,
};