const TaxRecord = require("../models/TaxRecord");
const BusinessEntity = require("../models/BusinessEntity");
const GeneralLedgerTransaction = require(
  "../models/GeneralLedgerTransaction"
);

const roundMoney = (value) =>
  Math.round(
    (Number(value || 0) + Number.EPSILON) * 100
  ) / 100;

const TAX_ACCOUNT_MAP = {
  PAYE: {
    accountCode: "2100",
    accountName: "PAYE Payable",
  },

  NIS: {
    accountCode: "2110",
    accountName: "NIS Payable",
  },

  NHT: {
    accountCode: "2120",
    accountName: "NHT Payable",
  },

  "Education Tax": {
    accountCode: "2130",
    accountName: "Education Tax Payable",
  },

  Pension: {
    accountCode: "2140",
    accountName: "Pension Payable",
  },

  HEART: {
    accountCode: "2150",
    accountName: "HEART Payable",
  },

  GCT: {
    accountCode: "2160",
    accountName: "GCT Output Tax Payable",
  },

  "Income Tax": {
    accountCode: "2170",
    accountName:
      "Individual Income Tax Payable",
  },

  "Company Tax": {
    accountCode: "2180",
    accountName:
      "Company Income Tax Payable",
  },
};

const cleanText = (value) =>
  String(value || "").trim();

const getPeriodDates = (periodKey) => {
  if (/^\d{4}$/.test(periodKey)) {
    return {
      startDate: `${periodKey}-01-01`,
      endDate: `${periodKey}-12-31`,
    };
  }

  if (/^\d{4}-\d{2}$/.test(periodKey)) {
    const [year, month] = periodKey
      .split("-")
      .map(Number);

    const lastDay = new Date(
      Date.UTC(year, month, 0)
    )
      .toISOString()
      .slice(0, 10);

    return {
      startDate: `${periodKey}-01`,
      endDate: lastDay,
    };
  }

  const error = new Error(
    "Period key must use YYYY or YYYY-MM format."
  );

  error.statusCode = 400;
  throw error;
};

const validateEntityPeriod = ({
  entity,
  startDate,
  endDate,
}) => {
  const entityStart = cleanText(
    entity.effectiveFrom
  );

  const entityEnd = cleanText(
    entity.effectiveTo
  );

  if (
    entityStart &&
    startDate < entityStart
  ) {
    const error = new Error(
      `${entity.entityCode} was not effective at the start of the selected period.`
    );

    error.statusCode = 409;
    throw error;
  }

  if (
    entityEnd &&
    endDate > entityEnd
  ) {
    const error = new Error(
      `${entity.entityCode} was not effective through the end of the selected period.`
    );

    error.statusCode = 409;
    throw error;
  }
};

const calculateGlCreditBalance = (transactions) =>
  roundMoney(
    transactions.reduce(
      (sum, transaction) =>
        sum +
        Number(transaction.credit || 0) -
        Number(transaction.debit || 0),
      0
    )
  );

const buildAccountReconciliation = ({
  taxType,
  account,
  taxRecords,
  ledgerTransactions,
  unattributedTransactions,
}) => {
  const recordsForType = taxRecords.filter(
    (record) => record.taxType === taxType
  );

  const ledgerForAccount =
    ledgerTransactions.filter(
      (transaction) =>
        transaction.accountCode ===
        account.accountCode
    );

  const unattributedForAccount =
    unattributedTransactions.filter(
      (transaction) =>
        transaction.accountCode ===
        account.accountCode
    );

  const calculatedLiability = roundMoney(
    recordsForType.reduce(
      (sum, record) =>
        sum + Number(record.taxDue || 0),
      0
    )
  );

  const recordedPayments = roundMoney(
    recordsForType.reduce(
      (sum, record) =>
        sum + Number(record.amountPaid || 0),
      0
    )
  );

  const taxCenterBalance = roundMoney(
    recordsForType.reduce(
      (sum, record) =>
        sum + Number(record.balanceDue || 0),
      0
    )
  );

  const glBalance =
    calculateGlCreditBalance(
      ledgerForAccount
    );

  const reconciliationDifference = roundMoney(
    taxCenterBalance - glBalance
  );

  return {
    taxType,
    accountCode: account.accountCode,
    accountName: account.accountName,

    recordCount: recordsForType.length,

    calculatedLiability,
    recordedPayments,
    taxCenterBalance,
    glBalance,
    reconciliationDifference,

    reconciled:
      Math.abs(reconciliationDifference) < 0.01,

    ledgerTransactionCount:
      ledgerForAccount.length,

    unattributedLedgerTransactionCount:
      unattributedForAccount.length,

    warning:
      unattributedForAccount.length > 0
        ? `${unattributedForAccount.length} ledger transaction(s) in the date range have no entity or reporting-period attribution and were excluded.`
        : "",

    records: recordsForType.map((record) => ({
      taxNumber: record.taxNumber,
      entityCode: record.entityCode,
      periodKey: record.periodKey,
      status: record.status,
      taxDue: roundMoney(record.taxDue),
      amountPaid: roundMoney(
        record.amountPaid
      ),
      balanceDue: roundMoney(
        record.balanceDue
      ),
      journalEntryNumber:
        record.journalEntryNumber || "",
    })),

    ledgerTransactions:
      ledgerForAccount.map((transaction) => ({
        ledgerNumber:
          transaction.ledgerNumber,
        entryNumber: transaction.entryNumber,
        entryDate: transaction.entryDate,
        reference: transaction.reference,
        sourceModule:
          transaction.sourceModule,
        entityCode: transaction.entityCode,
        reportingPeriodKey:
          transaction.reportingPeriodKey,
        debit: roundMoney(transaction.debit),
        credit: roundMoney(
          transaction.credit
        ),
        description:
          transaction.description || "",
      })),

    unattributedLedgerTransactions:
      unattributedForAccount.map(
        (transaction) => ({
          ledgerNumber:
            transaction.ledgerNumber,
          entryNumber:
            transaction.entryNumber,
          entryDate:
            transaction.entryDate,
          reference: transaction.reference,
          sourceModule:
            transaction.sourceModule,
          debit: roundMoney(
            transaction.debit
          ),
          credit: roundMoney(
            transaction.credit
          ),
        })
      ),
  };
};

const generateEntityPeriodTaxReconciliation =
  async ({
    entityCode,
    periodKey,
    taxType = "",
  }) => {
    const normalizedEntityCode =
      cleanText(entityCode);

    const normalizedPeriodKey =
      cleanText(periodKey);

    const normalizedTaxType =
      cleanText(taxType);

    if (!normalizedEntityCode) {
      const error = new Error(
        "An entity code is required."
      );

      error.statusCode = 400;
      throw error;
    }

    const {
      startDate,
      endDate,
    } = getPeriodDates(normalizedPeriodKey);

    const entity = await BusinessEntity.findOne({
      entityCode: normalizedEntityCode,
    });

    if (!entity) {
      const error = new Error(
        `Business entity ${normalizedEntityCode} was not found.`
      );

      error.statusCode = 404;
      throw error;
    }

    validateEntityPeriod({
      entity,
      startDate,
      endDate,
    });

    if (
      normalizedTaxType &&
      !TAX_ACCOUNT_MAP[normalizedTaxType]
    ) {
      const error = new Error(
        `Unsupported tax type ${normalizedTaxType}.`
      );

      error.statusCode = 400;
      throw error;
    }

    const selectedTaxTypes =
      normalizedTaxType
        ? [normalizedTaxType]
        : Object.keys(TAX_ACCOUNT_MAP);

    const selectedAccountCodes =
      selectedTaxTypes.map(
        (selectedType) =>
          TAX_ACCOUNT_MAP[selectedType]
            .accountCode
      );

    const [
      taxRecords,
      ledgerTransactions,
      unattributedTransactions,
    ] = await Promise.all([
      TaxRecord.find({
        entityCode: normalizedEntityCode,
        periodKey: normalizedPeriodKey,

        taxType: {
          $in: selectedTaxTypes,
        },

        status: {
          $nin: ["Cancelled", "Reversed"],
        },
      }).sort({
        taxType: 1,
        taxNumber: 1,
      }),

      GeneralLedgerTransaction.find({
        entityCode: normalizedEntityCode,

        reportingPeriodKey:
          normalizedPeriodKey,

        accountCode: {
          $in: selectedAccountCodes,
        },
      }).sort({
        entryDate: 1,
        ledgerNumber: 1,
      }),

      GeneralLedgerTransaction.find({
        accountCode: {
          $in: selectedAccountCodes,
        },

        entryDate: {
          $gte: startDate,
          $lte: endDate,
        },

        $or: [
          { entityCode: "" },
          { entityCode: null },
          {
            entityCode: {
              $exists: false,
            },
          },
          { reportingPeriodKey: "" },
          {
            reportingPeriodKey: null,
          },
          {
            reportingPeriodKey: {
              $exists: false,
            },
          },
        ],
      }).sort({
        entryDate: 1,
        ledgerNumber: 1,
      }),
    ]);

    const data = selectedTaxTypes.map(
      (selectedType) =>
        buildAccountReconciliation({
          taxType: selectedType,
          account:
            TAX_ACCOUNT_MAP[selectedType],
          taxRecords,
          ledgerTransactions,
          unattributedTransactions,
        })
    );

    const summary = data.reduce(
      (totals, item) => ({
        calculatedLiability: roundMoney(
          totals.calculatedLiability +
            item.calculatedLiability
        ),

        recordedPayments: roundMoney(
          totals.recordedPayments +
            item.recordedPayments
        ),

        taxCenterBalance: roundMoney(
          totals.taxCenterBalance +
            item.taxCenterBalance
        ),

        glBalance: roundMoney(
          totals.glBalance +
            item.glBalance
        ),

        absoluteDifference: roundMoney(
          totals.absoluteDifference +
            Math.abs(
              item.reconciliationDifference
            )
        ),

        reconciledAccountCount:
          totals.reconciledAccountCount +
          (item.reconciled ? 1 : 0),

        unreconciledAccountCount:
          totals.unreconciledAccountCount +
          (item.reconciled ? 0 : 1),

        unattributedLedgerTransactionCount:
          totals.unattributedLedgerTransactionCount +
          item
            .unattributedLedgerTransactionCount,
      }),
      {
        calculatedLiability: 0,
        recordedPayments: 0,
        taxCenterBalance: 0,
        glBalance: 0,
        absoluteDifference: 0,
        reconciledAccountCount: 0,
        unreconciledAccountCount: 0,
        unattributedLedgerTransactionCount: 0,
      }
    );

    return {
      filters: {
        entityCode: normalizedEntityCode,
        periodKey: normalizedPeriodKey,
        taxType: normalizedTaxType,
      },

      entity: {
        entityId: entity._id,
        entityCode: entity.entityCode,
        legalName: entity.legalName,
        entityType: entity.entityType,
        effectiveFrom: entity.effectiveFrom,
        effectiveTo: entity.effectiveTo,
      },

      period: {
        periodKey: normalizedPeriodKey,
        startDate,
        endDate,
      },

      generatedAt: new Date(),
      summary,
      data,
    };
  };

const assertEntityPeriodTaxTypeReconciled =
  async ({
    entityCode,
    periodKey,
    taxType,
  }) => {
    const result =
      await generateEntityPeriodTaxReconciliation({
        entityCode,
        periodKey,
        taxType,
      });

    const reconciliation = result.data[0];

    if (!reconciliation) {
      const error = new Error(
        `No reconciliation result was generated for ${taxType}, ${entityCode}, ${periodKey}.`
      );

      error.statusCode = 409;
      throw error;
    }

    if (!reconciliation.reconciled) {
      const error = new Error(
        `${taxType} for ${entityCode}, period ${periodKey}, cannot be reconciled. Tax Center balance is JMD ${reconciliation.taxCenterBalance.toFixed(
          2
        )}, GL balance is JMD ${reconciliation.glBalance.toFixed(
          2
        )}, and the difference is JMD ${reconciliation.reconciliationDifference.toFixed(
          2
        )}.`
      );

      error.statusCode = 409;

      error.reconciliation = {
        entityCode,
        periodKey,
        taxType,
        accountCode:
          reconciliation.accountCode,
        taxCenterBalance:
          reconciliation.taxCenterBalance,
        glBalance: reconciliation.glBalance,
        reconciliationDifference:
          reconciliation.reconciliationDifference,
      };

      throw error;
    }

    return reconciliation;
  };

module.exports = {
  TAX_ACCOUNT_MAP,
  generateEntityPeriodTaxReconciliation,
  assertEntityPeriodTaxTypeReconciled,
};