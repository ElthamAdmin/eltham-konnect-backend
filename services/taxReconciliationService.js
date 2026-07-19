const TaxRecord = require("../models/TaxRecord");
const ChartOfAccount = require("../models/ChartOfAccount");

const {
  SYSTEM_ACCOUNTS,
} = require("./accountingEngine/accountingConstants");

const roundMoney = (value) =>
  Math.round(
    (Number(value || 0) + Number.EPSILON) * 100
  ) / 100;

const TAX_ACCOUNT_MAP = {
  PAYE: {
    accountCode:
      SYSTEM_ACCOUNTS.PAYE_PAYABLE,
    accountName: "PAYE Payable",
  },

  NIS: {
    accountCode:
      SYSTEM_ACCOUNTS.NIS_PAYABLE,
    accountName: "NIS Payable",
  },

  NHT: {
    accountCode:
      SYSTEM_ACCOUNTS.NHT_PAYABLE,
    accountName: "NHT Payable",
  },

  "Education Tax": {
    accountCode:
      SYSTEM_ACCOUNTS.EDUCATION_TAX_PAYABLE,
    accountName: "Education Tax Payable",
  },

  Pension: {
    accountCode:
      SYSTEM_ACCOUNTS.PENSION_PAYABLE,
    accountName: "Pension Payable",
  },

  HEART: {
    accountCode:
      SYSTEM_ACCOUNTS.HEART_PAYABLE,
    accountName: "HEART Payable",
  },

  GCT: {
    accountCode:
      SYSTEM_ACCOUNTS.GCT_OUTPUT_TAX_PAYABLE,
    accountName: "GCT Output Tax Payable",
  },

  "Income Tax": {
    accountCode:
      SYSTEM_ACCOUNTS
        .INDIVIDUAL_INCOME_TAX_PAYABLE,
    accountName:
      "Individual Income Tax Payable",
  },

  "Company Tax": {
    accountCode:
      SYSTEM_ACCOUNTS
        .COMPANY_INCOME_TAX_PAYABLE,
    accountName:
      "Company Income Tax Payable",
  },
};

const getTaxToGlReconciliation = async ({
  taxType = "",
} = {}) => {
  const normalizedTaxType = String(
    taxType || ""
  ).trim();

  if (
    normalizedTaxType &&
    !TAX_ACCOUNT_MAP[normalizedTaxType]
  ) {
    throw new Error(
      `No General Ledger payable mapping exists for ${normalizedTaxType}.`
    );
  }

  const taxTypes = normalizedTaxType
    ? [normalizedTaxType]
    : Object.keys(TAX_ACCOUNT_MAP);

  const accountCodes = taxTypes.map(
    (type) => TAX_ACCOUNT_MAP[type].accountCode
  );

  const [taxRecords, chartAccounts] =
    await Promise.all([
      TaxRecord.find({
        taxType: { $in: taxTypes },
        status: {
          $nin: [
            "Draft",
            "Calculated",
            "Cancelled",
          ],
        },
      }).select(
        "taxNumber taxType taxDue amountPaid balanceDue status periodStart periodEnd"
      ),

      ChartOfAccount.find({
        accountCode: { $in: accountCodes },
      }).select(
        "accountCode accountName accountCategory normalBalance currentBalance status"
      ),
    ]);

  const chartAccountMap = new Map(
    chartAccounts.map((account) => [
      account.accountCode,
      account,
    ])
  );

  const reconciliation = taxTypes.map(
    (currentTaxType) => {
      const accountConfiguration =
        TAX_ACCOUNT_MAP[currentTaxType];

      const relatedRecords = taxRecords.filter(
        (record) =>
          record.taxType === currentTaxType
      );

      const calculatedLiability = roundMoney(
        relatedRecords.reduce(
          (sum, record) =>
            sum + Number(record.taxDue || 0),
          0
        )
      );

      const recordedPayments = roundMoney(
        relatedRecords.reduce(
          (sum, record) =>
            sum +
            Number(record.amountPaid || 0),
          0
        )
      );

      const taxCenterBalance = roundMoney(
        relatedRecords.reduce(
          (sum, record) =>
            sum +
            Number(record.balanceDue || 0),
          0
        )
      );

      const chartAccount =
        chartAccountMap.get(
          accountConfiguration.accountCode
        ) || null;

      const glBalance = roundMoney(
        chartAccount?.currentBalance || 0
      );

      const reconciliationDifference =
        roundMoney(
          taxCenterBalance - glBalance
        );

      return {
        taxType: currentTaxType,
        accountCode:
          accountConfiguration.accountCode,
        accountName:
          chartAccount?.accountName ||
          accountConfiguration.accountName,
        accountFound: Boolean(chartAccount),
        accountStatus:
          chartAccount?.status || "Missing",
        normalBalance:
          chartAccount?.normalBalance ||
          "Credit",
        recordCount: relatedRecords.length,
        calculatedLiability,
        recordedPayments,
        taxCenterBalance,
        glBalance,
        reconciliationDifference,
        reconciled:
          Boolean(chartAccount) &&
          Math.abs(
            reconciliationDifference
          ) < 0.01,
        records: relatedRecords.map(
          (record) => ({
            taxNumber: record.taxNumber,
            periodStart:
              record.periodStart,
            periodEnd: record.periodEnd,
            status: record.status,
            taxDue: roundMoney(
              record.taxDue
            ),
            amountPaid: roundMoney(
              record.amountPaid
            ),
            balanceDue: roundMoney(
              record.balanceDue
            ),
          })
        ),
      };
    }
  );

  const summary = reconciliation.reduce(
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
        totals.glBalance + item.glBalance
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
    }),
    {
      calculatedLiability: 0,
      recordedPayments: 0,
      taxCenterBalance: 0,
      glBalance: 0,
      absoluteDifference: 0,
      reconciledAccountCount: 0,
      unreconciledAccountCount: 0,
    }
  );

  return {
    generatedAt: new Date(),
    taxType: normalizedTaxType,
    summary,
    data: reconciliation,
  };
};

const assertTaxTypeReconciled = async (
  taxType
) => {
  const reconciliation =
    await getTaxToGlReconciliation({
      taxType,
    });

  const result = reconciliation.data[0];

  if (!result?.reconciled) {
    throw new Error(
      `${taxType} cannot be reconciled. Tax Center balance is JMD ${roundMoney(
        result?.taxCenterBalance || 0
      ).toFixed(
        2
      )}, GL balance is JMD ${roundMoney(
        result?.glBalance || 0
      ).toFixed(
        2
      )}, and the difference is JMD ${roundMoney(
        result?.reconciliationDifference || 0
      ).toFixed(2)}.`
    );
  }

  return result;
};

module.exports = {
  TAX_ACCOUNT_MAP,
  getTaxToGlReconciliation,
  assertTaxTypeReconciled,
};