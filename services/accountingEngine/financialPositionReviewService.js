const FinancialAccount = require("../../models/FinancialAccount");
const ChartOfAccount = require("../../models/ChartOfAccount");
const GeneralLedgerTransaction = require("../../models/GeneralLedgerTransaction");

const { dateOnly } = require("./reportingService");

const fail = (message) => {
  const error = new Error(message);
  error.statusCode = 400;
  throw error;
};

const moneyValue = (value) => {
  if (!["number", "string"].includes(typeof value)) {
    return null;
  }

  if (
    typeof value === "string" &&
    !value.trim()
  ) {
    return null;
  }

  const number = Number(value);

  if (!Number.isFinite(number)) return null;

  const cents = Math.round(number * 100);

  if (!Number.isSafeInteger(cents)) return null;

  if (Math.abs(number * 100 - cents) > 0.000001) {
    return null;
  }

  return cents / 100;
};

const buildFinancialPositionReview = async ({
  effectiveDate,
  actualBalances = [],
} = {}) => {
  if (
    typeof effectiveDate !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(effectiveDate) ||
    dateOnly(effectiveDate) !== effectiveDate
  ) {
    fail(
      "Select a valid review date in YYYY-MM-DD format."
    );
  }

  if (!Array.isArray(actualBalances)) {
    fail("Actual balances must be a list.");
  }

  const actualMap = new Map();

  for (const input of actualBalances) {
    if (
      !input ||
      typeof input.accountNumber !== "string" ||
      !input.accountNumber.trim()
    ) {
      fail(
        "Each actual balance must identify a financial account."
      );
    }

    const number = input.accountNumber.trim();

    if (actualMap.has(number)) {
      fail(
        `Actual balance supplied more than once for ${number}.`
      );
    }

    for (const field of [
      "actualBalance",
      "actualBaseBalance",
    ]) {
      if (
        input[field] !== undefined &&
        moneyValue(input[field]) === null
      ) {
        fail(
          `${field} for ${number} must be a finite amount with no more than two decimal places.`
        );
      }
    }

    actualMap.set(number, input);
  }

  /*
   * Include inactive accounts so historical balances
   * are not silently omitted.
   */
  const accounts = await FinancialAccount.find()
    .sort({ accountNumber: 1 })
    .lean();

  const accountNumbers = new Set(
    accounts.map((account) => account.accountNumber)
  );

  for (const number of actualMap.keys()) {
    if (!accountNumbers.has(number)) {
      fail(
        `Financial account ${number} was not found.`
      );
    }
  }

  const codes = [
    ...new Set(
      accounts
        .map((account) => account.linkedChartAccountCode)
        .filter(Boolean)
    ),
  ];

  const [chartAccounts, ledger] = codes.length
    ? await Promise.all([
        ChartOfAccount.find({
          accountCode: { $in: codes },
        }).lean(),

        GeneralLedgerTransaction.find({
          accountCode: { $in: codes },
        }).lean(),
      ])
    : [[], []];

  const chartMap = new Map(
    chartAccounts.map((account) => [
      account.accountCode,
      account,
    ])
  );

  const linkCounts = new Map();

  for (const account of accounts) {
    const code = account.linkedChartAccountCode;

    if (code) {
      linkCounts.set(
        code,
        (linkCounts.get(code) || 0) + 1
      );
    }
  }

  const aggregates = new Map(
    codes.map((code) => [
      code,
      {
        debitCents: 0,
        creditCents: 0,
        lineCount: 0,
        invalidDateCount: 0,
        invalidAmountCount: 0,
        unusualLineCount: 0,
        unassignedEntityCount: 0,
        entityCodes: new Set(),
        unsafeTotal: false,
      },
    ])
  );

  for (const line of ledger) {
    const total = aggregates.get(line.accountCode);

    if (!total) continue;

    const day = dateOnly(line.entryDate);

    if (!day) {
      total.invalidDateCount += 1;
      continue;
    }

    if (day > effectiveDate) continue;

    const debit = moneyValue(line.debit ?? 0);
    const credit = moneyValue(line.credit ?? 0);

    if (debit === null || credit === null) {
      total.invalidAmountCount += 1;
      continue;
    }

    total.debitCents += Math.round(debit * 100);
    total.creditCents += Math.round(credit * 100);
    total.lineCount += 1;

    if (
      !Number.isSafeInteger(total.debitCents) ||
      !Number.isSafeInteger(total.creditCents)
    ) {
      total.unsafeTotal = true;
    }

    if (
      debit < 0 ||
      credit < 0 ||
      (debit > 0 && credit > 0)
    ) {
      total.unusualLineCount += 1;
    }

    const entity = String(
      line.entityCode || ""
    ).trim();

    if (entity) {
      total.entityCodes.add(entity);
    } else {
      total.unassignedEntityCount += 1;
    }
  }

  const rows = accounts.map((account) => {
    const issues = [];

    const warn = (code, message) => {
      issues.push({ code, message });
    };

    const code =
      account.linkedChartAccountCode || "";

    const chart = chartMap.get(code);
    const total = aggregates.get(code);
    const input = actualMap.get(account.accountNumber);

    const currency = String(
      account.currency || ""
    )
      .trim()
      .toUpperCase();

    const baseCurrency = String(
      account.baseCurrency || ""
    )
      .trim()
      .toUpperCase();

    let ledgerBaseBalance = null;

    if (!code) {
      warn(
        "MISSING_LINK",
        "No ledger account is linked. No account was created or repaired."
      );
    } else if (!chart) {
      warn(
        "MISSING_CHART_ACCOUNT",
        "The linked ledger account does not exist."
      );
    }

    if ((linkCounts.get(code) || 0) > 1) {
      warn(
        "SHARED_LINK",
        "Multiple financial accounts share this ledger account. Its total cannot be attributed to this financial account."
      );
    }

    if (account.status !== "Active") {
      warn(
        "INACTIVE_FINANCIAL_ACCOUNT",
        "This financial account is inactive; its historical balance is retained for review."
      );
    }

    if (!["JMD", "USD"].includes(currency)) {
      warn(
        "UNSUPPORTED_CURRENCY",
        "This review supports JMD and USD accounts. Review this currency separately."
      );
    }

    if (baseCurrency !== "JMD") {
      warn(
        "BASE_CURRENCY_REVIEW",
        "The financial account is not explicitly configured with JMD as its base currency."
      );
    }

    if (chart) {
      if (chart.status !== "Active") {
        warn(
          "INACTIVE_CHART_ACCOUNT",
          "The linked ledger account is inactive; historical entries are still included."
        );
      }

      const expectedCategory =
        account.accountType === "Credit Card"
          ? "Liability"
          : "Asset";

      const expectedNormal =
        account.accountType === "Credit Card"
          ? "Credit"
          : "Debit";

      if (
        !["Bank", "Cash", "Credit Card"].includes(
          account.accountType
        ) ||
        chart.accountCategory !== expectedCategory ||
        chart.normalBalance !== expectedNormal
      ) {
        warn(
          "ACCOUNT_CLASSIFICATION",
          "The financial account type and ledger classification require review."
        );
      }

      if (total.invalidDateCount) {
        warn(
          "INVALID_LEDGER_DATE",
          "Some ledger lines have invalid dates. A reliable balance through the selected date cannot be calculated."
        );
      }

      if (total.invalidAmountCount) {
        warn(
          "INVALID_LEDGER_AMOUNT",
          "Some ledger amounts are invalid. A reliable balance cannot be calculated."
        );
      }

      if (total.unusualLineCount) {
        warn(
          "UNUSUAL_LEDGER_LINE",
          "Negative or two-sided ledger lines were included as recorded and require review."
        );
      }

      if (total.unassignedEntityCount) {
        warn(
          "UNASSIGNED_ENTITY",
          "Some ledger lines have no recorded business identity."
        );
      }

      if (total.entityCodes.size > 1) {
        warn(
          "MULTIPLE_ENTITIES",
          "This ledger account contains entries for multiple businesses. Ownership must be resolved before using the balance as an entity baseline."
        );
      }

      if (!total.lineCount) {
        warn(
          "NO_LEDGER_HISTORY",
          "No valid ledger entries were found through this date. A calculated zero does not establish a verified opening balance."
        );
      }

      const signed =
        total.debitCents - total.creditCents;

      if (
        !total.invalidDateCount &&
        !total.invalidAmountCount &&
        !total.unsafeTotal &&
        Number.isSafeInteger(total.debitCents) &&
        Number.isSafeInteger(total.creditCents) &&
        Number.isSafeInteger(signed) &&
        ["Debit", "Credit"].includes(chart.normalBalance)
      ) {
        ledgerBaseBalance =
          (chart.normalBalance === "Debit"
            ? signed
            : -signed) / 100;
      }

      if (ledgerBaseBalance === null) {
        warn(
          "BALANCE_UNAVAILABLE",
          "The ledger balance is unavailable; it has not been replaced with zero."
        );
      }
    }

    const actualBalance =
      input?.actualBalance !== undefined
        ? moneyValue(input.actualBalance)
        : null;

    if (actualBalance === null) {
      warn(
        "ACTUAL_NOT_SUPPLIED",
        "No actual native-currency balance was supplied. It has not been assumed to equal the recorded balance."
      );
    }

    let actualBaseBalance = null;

    if (currency === "JMD") {
      actualBaseBalance = actualBalance;

      if (
        input?.actualBaseBalance !== undefined &&
        moneyValue(input.actualBaseBalance) !==
          actualBalance
      ) {
        fail(
          `JMD actual and base balances disagree for ${account.accountNumber}.`
        );
      }
    } else if (currency === "USD") {
      actualBaseBalance =
        input?.actualBaseBalance !== undefined
          ? moneyValue(input.actualBaseBalance)
          : null;

      warn(
        "USD_NATIVE_HISTORY",
        "The JMD ledger does not establish a historical USD native balance. No automatic conversion or reconstruction was performed."
      );

      if (actualBaseBalance === null) {
        warn(
          "USD_BASE_NOT_SUPPLIED",
          "A reviewed JMD equivalent is required before comparing this USD actual balance with the JMD ledger."
        );
      }
    }

    const comparable =
      ledgerBaseBalance !== null &&
      actualBaseBalance !== null &&
      actualBalance !== null &&
      (linkCounts.get(code) || 0) === 1 &&
      baseCurrency === "JMD" &&
      ["JMD", "USD"].includes(currency) &&
      !issues.some(
        (issue) =>
          issue.code === "ACCOUNT_CLASSIFICATION"
      );

    const differenceCents = comparable
      ? Math.round(actualBaseBalance * 100) -
        Math.round(ledgerBaseBalance * 100)
      : null;

    return {
      accountNumber: account.accountNumber,
      accountName: account.accountName,
      accountType: account.accountType,
      status: account.status,
      linkedChartAccountCode: code,
      currency,
      baseCurrency,

      ledgerBalance:
        currency === "JMD" &&
        (linkCounts.get(code) || 0) === 1
          ? ledgerBaseBalance
          : null,

      ledgerBaseBalance,
      actualBalance,
      actualBaseBalance,

      difference:
        differenceCents !== null &&
        Number.isSafeInteger(differenceCents)
          ? differenceCents / 100
          : null,

      ledgerLineCount: total?.lineCount || 0,

      recordedEntityCodes: [
        ...(total?.entityCodes || []),
      ].sort(),

      notes:
        typeof input?.notes === "string"
          ? input.notes.trim()
          : "",

      issues,
    };
  });

  return {
    effectiveDate,
    generatedAt: new Date().toISOString(),
    readOnly: true,
    canPost: false,

    balanceBasis:
      "Recorded ledger entries through the selected date, in JMD. Actual balances are user-supplied and not independently verified.",

    entityBasis:
      "Financial-account business ownership is not yet verified. No entity attribution was created or changed.",

    accountBasis:
      "All currently configured financial accounts, including inactive accounts; this is not a reconstruction of the historical account list.",

    rows,

    accountsWithIssues: rows.filter(
      (row) => row.issues.length > 0
    ).length,
  };
};

module.exports = {
  buildFinancialPositionReview,
};