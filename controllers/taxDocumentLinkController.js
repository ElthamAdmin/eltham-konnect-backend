const TaxDocument = require("../models/TaxDocument");
const TaxRecord = require("../models/TaxRecord");
const IncomeTaxEstimate = require("../models/IncomeTaxEstimate");
const GctFilingPeriod = require("../models/GctFilingPeriod");
const AccountTransaction = require("../models/AccountTransaction");

const getUserName = (user) =>
  user?.fullName ||
  user?.name ||
  user?.email ||
  "System User";

const cleanText = (value) =>
  String(value || "").trim();

const getTargetPeriodKey = (target) => {
  if (cleanText(target?.periodKey)) {
    return cleanText(target.periodKey);
  }

  const periodStart = target?.periodStart;

  if (!periodStart) {
    return "";
  }

  if (periodStart instanceof Date) {
    return periodStart.toISOString().slice(0, 7);
  }

  return cleanText(periodStart).slice(0, 7);
};

const getIncomeTaxDocumentType = (estimate) =>
  cleanText(estimate.incomeTaxType) ===
  "Company Income Tax"
    ? "Company Tax"
    : "Income Tax";

const assertEntityCompatible = ({
  taxDocument,
  target,
  targetName,
}) => {
  const targetEntityCode = cleanText(
    target?.entityCode ||
      target?.entitySnapshot?.entityCode
  );

  if (
    targetEntityCode &&
    targetEntityCode !== taxDocument.entityCode
  ) {
    const error = new Error(
      `${targetName} belongs to ${targetEntityCode}, but the document belongs to ${taxDocument.entityCode}.`
    );

    error.statusCode = 409;
    throw error;
  }
};

const assertPeriodCompatible = ({
  taxDocument,
  target,
  targetName,
}) => {
  const documentPeriod = cleanText(
    taxDocument.periodKey
  );

  const targetPeriod = getTargetPeriodKey(target);

  if (
    documentPeriod &&
    targetPeriod &&
    documentPeriod !== targetPeriod
  ) {
    const error = new Error(
      `${targetName} belongs to period ${targetPeriod}, but the document belongs to period ${documentPeriod}.`
    );

    error.statusCode = 409;
    throw error;
  }
};

const assertTaxTypeCompatible = ({
  taxDocument,
  expectedTaxType,
  targetName,
}) => {
  const documentTaxType = cleanText(
    taxDocument.taxType
  );

  if (
    documentTaxType &&
    expectedTaxType &&
    documentTaxType !== expectedTaxType
  ) {
    const error = new Error(
      `${targetName} uses ${expectedTaxType}, but the document is classified as ${documentTaxType}.`
    );

    error.statusCode = 409;
    throw error;
  }
};

const assertLinkNotBeingReplaced = ({
  currentReference,
  requestedReference,
  linkName,
}) => {
  if (
    cleanText(currentReference) &&
    cleanText(currentReference) !==
      cleanText(requestedReference)
  ) {
    const error = new Error(
      `The document is already linked to ${linkName} ${currentReference}. Unlink it through an audited action before assigning another ${linkName}.`
    );

    error.statusCode = 409;
    throw error;
  }
};

const pushLinkHistory = ({
  taxDocument,
  targetType,
  targetReference,
  notes,
  userName,
}) => {
  taxDocument.linkageHistory.push({
    targetType,
    targetReference,
    action: "Linked",
    notes,
    performedBy: userName,
    performedAt: new Date(),
  });
};

const linkTaxDocument = async (req, res) => {
  try {
    const documentNumber = cleanText(
      req.params.documentNumber
    );

    const {
      taxNumber,
      estimateNumber,
      filingNumber,
      transactionNumber,
      notes = "",
    } = req.body;

    const requestedReferences = [
      taxNumber,
      estimateNumber,
      filingNumber,
      transactionNumber,
    ].filter((value) => cleanText(value));

    if (requestedReferences.length === 0) {
      return res.status(400).json({
        success: false,
        message:
          "Provide at least one tax number, estimate number, filing number, or transaction number.",
      });
    }

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

    const userName = getUserName(req.user);
    const linkNotes = cleanText(notes);

    if (cleanText(taxNumber)) {
      const normalizedTaxNumber =
        cleanText(taxNumber);

      assertLinkNotBeingReplaced({
        currentReference: taxDocument.taxNumber,
        requestedReference: normalizedTaxNumber,
        linkName: "TaxRecord",
      });

      const taxRecord = await TaxRecord.findOne({
        taxNumber: normalizedTaxNumber,
      });

      if (!taxRecord) {
        return res.status(404).json({
          success: false,
          message:
            `TaxRecord ${normalizedTaxNumber} was not found.`,
        });
      }

      assertEntityCompatible({
        taxDocument,
        target: taxRecord,
        targetName: `TaxRecord ${normalizedTaxNumber}`,
      });

      assertPeriodCompatible({
        taxDocument,
        target: taxRecord,
        targetName: `TaxRecord ${normalizedTaxNumber}`,
      });

      assertTaxTypeCompatible({
        taxDocument,
        expectedTaxType: cleanText(
          taxRecord.taxType
        ),
        targetName: `TaxRecord ${normalizedTaxNumber}`,
      });

      taxDocument.taxRecordId = taxRecord._id;
      taxDocument.taxNumber =
        taxRecord.taxNumber;

      pushLinkHistory({
        taxDocument,
        targetType: "Tax Record",
        targetReference: taxRecord.taxNumber,
        notes: linkNotes,
        userName,
      });
    }

    if (cleanText(estimateNumber)) {
      const normalizedEstimateNumber =
        cleanText(estimateNumber);

      assertLinkNotBeingReplaced({
        currentReference:
          taxDocument.estimateNumber,
        requestedReference:
          normalizedEstimateNumber,
        linkName: "income-tax estimate",
      });

      const estimate =
        await IncomeTaxEstimate.findOne({
          estimateNumber:
            normalizedEstimateNumber,
        });

      if (!estimate) {
        return res.status(404).json({
          success: false,
          message:
            `Income-tax estimate ${normalizedEstimateNumber} was not found.`,
        });
      }

      assertEntityCompatible({
        taxDocument,
        target: estimate,
        targetName:
          `Income-tax estimate ${normalizedEstimateNumber}`,
      });

      assertPeriodCompatible({
        taxDocument,
        target: estimate,
        targetName:
          `Income-tax estimate ${normalizedEstimateNumber}`,
      });

      assertTaxTypeCompatible({
        taxDocument,
        expectedTaxType:
          getIncomeTaxDocumentType(estimate),
        targetName:
          `Income-tax estimate ${normalizedEstimateNumber}`,
      });

      taxDocument.incomeTaxEstimateId =
        estimate._id;
      taxDocument.estimateNumber =
        estimate.estimateNumber;

      pushLinkHistory({
        taxDocument,
        targetType: "Income Tax Estimate",
        targetReference:
          estimate.estimateNumber,
        notes: linkNotes,
        userName,
      });
    }

    if (cleanText(filingNumber)) {
      const normalizedFilingNumber =
        cleanText(filingNumber);

      assertLinkNotBeingReplaced({
        currentReference:
          taxDocument.filingNumber,
        requestedReference:
          normalizedFilingNumber,
        linkName: "GCT filing",
      });

      const filing =
        await GctFilingPeriod.findOne({
          filingNumber:
            normalizedFilingNumber,
        });

      if (!filing) {
        return res.status(404).json({
          success: false,
          message:
            `GCT filing ${normalizedFilingNumber} was not found.`,
        });
      }

      assertEntityCompatible({
        taxDocument,
        target: filing,
        targetName:
          `GCT filing ${normalizedFilingNumber}`,
      });

      assertPeriodCompatible({
        taxDocument,
        target: filing,
        targetName:
          `GCT filing ${normalizedFilingNumber}`,
      });

      assertTaxTypeCompatible({
        taxDocument,
        expectedTaxType: "GCT",
        targetName:
          `GCT filing ${normalizedFilingNumber}`,
      });

      taxDocument.gctFilingPeriodId =
        filing._id;
      taxDocument.filingNumber =
        filing.filingNumber;

      pushLinkHistory({
        taxDocument,
        targetType: "GCT Filing",
        targetReference:
          filing.filingNumber,
        notes: linkNotes,
        userName,
      });
    }

    if (cleanText(transactionNumber)) {
      const normalizedTransactionNumber =
        cleanText(transactionNumber);

      assertLinkNotBeingReplaced({
        currentReference:
          taxDocument.transactionNumber,
        requestedReference:
          normalizedTransactionNumber,
        linkName: "tax payment transaction",
      });

      const transaction =
        await AccountTransaction.findOne({
          transactionNumber:
            normalizedTransactionNumber,
        });

      if (!transaction) {
        return res.status(404).json({
          success: false,
          message:
            `Account transaction ${normalizedTransactionNumber} was not found.`,
        });
      }

      if (
        cleanText(transaction.transactionType) !==
        "Tax Payment"
      ) {
        return res.status(409).json({
          success: false,
          message:
            `${normalizedTransactionNumber} is a ${transaction.transactionType} transaction, not a Tax Payment.`,
        });
      }

      if (
        cleanText(taxNumber) &&
        cleanText(transaction.reference) &&
        cleanText(transaction.reference) !==
          cleanText(taxNumber) &&
        cleanText(transaction.ledgerReference) !==
          cleanText(taxNumber)
      ) {
        return res.status(409).json({
          success: false,
          message:
            `${normalizedTransactionNumber} does not reference TaxRecord ${cleanText(
              taxNumber
            )}.`,
        });
      }

      taxDocument.accountTransactionId =
        transaction._id;
      taxDocument.transactionNumber =
        transaction.transactionNumber;
      taxDocument.journalEntryNumber =
        transaction.journalEntryNumber || "";

      pushLinkHistory({
        taxDocument,
        targetType: "Tax Payment",
        targetReference:
          transaction.transactionNumber,
        notes: linkNotes,
        userName,
      });
    }

    taxDocument.linkedBy = userName;
    taxDocument.linkedAt = new Date();

    await taxDocument.save();

    return res.json({
      success: true,
      message:
        `${documentNumber} linked successfully.`,
      data: taxDocument,
    });
  } catch (error) {
    console.error(
      "Tax document linkage error:",
      error
    );

    return res
      .status(error.statusCode || 400)
      .json({
        success: false,
        message:
          error.message ||
          "Could not link the tax document.",
      });
  }
};

module.exports = {
  linkTaxDocument,
};