const ExpenseCategory = require("../models/ExpenseCategory");
const ChartOfAccount = require("../models/ChartOfAccount");

const fail = (message, statusCode = 400) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  throw error;
};

const cleanText = (
  value,
  label,
  maximum,
  required = true
) => {
  if (value === undefined || value === null) {
    value = "";
  }

  if (typeof value !== "string") {
    fail(`${label} must be text.`);
  }

  const text = value.trim().replace(/\s+/g, " ");

  if (required && !text) {
    fail(`${label} is required.`);
  }

  if (text.length > maximum) {
    fail(
      `${label} must not exceed ${maximum} characters.`
    );
  }

  return text;
};

const mappingIssue = (category, account) => {
  if (!account) {
    return "The linked ledger account does not exist.";
  }

  if (account.status !== "Active") {
    return "The linked ledger account is inactive.";
  }

  if (
    !["Expense", "Cost of Sales"].includes(
      account.accountCategory
    )
  ) {
    return "Select an Expense or Cost of Sales ledger account.";
  }

  if (account.normalBalance !== "Debit") {
    return "The expense ledger account must have a Debit normal balance.";
  }

  const classification =
    account.accountCategory === "Cost of Sales"
      ? "Cost of Goods Sold"
      : "Operating Expense";

  if (
    category &&
    category.classification !== classification
  ) {
    return "The category classification no longer matches its ledger account. Admin review is required.";
  }

  return "";
};

const getExpensePostingAccount = async (value) => {
  const accountCode = cleanText(
    value,
    "Ledger account code",
    100
  );

  const account = await ChartOfAccount.findOne({
    accountCode,
  }).lean();

  const issue = mappingIssue(null, account);

  if (issue) fail(issue, 409);

  return account;
};

const toCategoryResult = (record, account) => {
  const issue = mappingIssue(record, account);

  return {
    _id: String(record._id),
    category: record.category,
    classification: record.classification,
    group: record.group,
    accountCode: record.accountCode,
    accountName:
      account?.accountName || record.accountName,
    isCOGS:
      record.classification === "Cost of Goods Sold",
    status: record.status,
    description: record.description || "",
    version: Number(record.__v || 0),
    mappingValid: !issue,
    mappingIssue: issue,
    availableForExpenses:
      record.status === "Active" && !issue,
  };
};

const listExpenseCategories = async ({
  includeInactive = false,
  user,
} = {}) => {
  if (includeInactive && user?.role !== "Admin") {
    fail(
      "Only Admin can manage inactive expense categories.",
      403
    );
  }

  const records = await ExpenseCategory.find(
    includeInactive ? {} : { status: "Active" }
  )
    .sort({ category: 1, _id: 1 })
    .lean();

  if (!records.length) return [];

  const codes = [
    ...new Set(
      records.map((record) => record.accountCode)
    ),
  ];

  const accounts = await ChartOfAccount.find({
    accountCode: { $in: codes },
  }).lean();

  const accountMap = new Map(
    accounts.map((account) => [
      account.accountCode,
      account,
    ])
  );

  return records.map((record) =>
    toCategoryResult(
      record,
      accountMap.get(record.accountCode)
    )
  );
};

const resolveExpenseCategory = async (value) => {
  const category = cleanText(
    value,
    "Expense category",
    120
  );

  const record = await ExpenseCategory.findOne({
    categoryKey: category.toLowerCase(),
  }).lean();

  if (!record) {
    fail(
      "Create this expense category before using it. Preset categories are no longer used for new expenses."
    );
  }

  if (record.status !== "Active") {
    fail(
      "This expense category is inactive. Select an active category.",
      409
    );
  }

  const account = await getExpensePostingAccount(
    record.accountCode
  );

  const issue = mappingIssue(record, account);

  if (issue) fail(issue, 409);

  return toCategoryResult(record, account);
};

const validateExpenseCategoryInput = async (
  input = {}
) => {
  if (
    !input ||
    typeof input !== "object" ||
    Array.isArray(input)
  ) {
    fail("Category details are required.");
  }

  const category = cleanText(
    input.category,
    "Category name",
    120
  );

  const group = cleanText(
    input.group,
    "Category group",
    100
  );

  const description = cleanText(
    input.description,
    "Description",
    500,
    false
  );

  const account = await getExpensePostingAccount(
    input.accountCode
  );

  const isCOGS =
    account.accountCategory === "Cost of Sales";

  return {
    category,
    categoryKey: category.toLowerCase(),
    group,
    description,
    accountCode: account.accountCode,
    accountName: account.accountName,
    classification: isCOGS
      ? "Cost of Goods Sold"
      : "Operating Expense",
    isCOGS,
  };
};

const getExpensePostingAccounts = async ({
  user,
} = {}) => {
  if (user?.role !== "Admin") {
    fail(
      "Only Admin can manage expense category mappings.",
      403
    );
  }

  const accounts = await ChartOfAccount.find({
    status: "Active",
    accountCategory: {
      $in: ["Expense", "Cost of Sales"],
    },
    normalBalance: "Debit",
  })
    .sort({ accountCode: 1 })
    .lean();

  return accounts.map((account) => ({
    accountCode: account.accountCode,
    accountName: account.accountName,
    classification:
      account.accountCategory === "Cost of Sales"
        ? "Cost of Goods Sold"
        : "Operating Expense",
    isCOGS:
      account.accountCategory === "Cost of Sales",
  }));
};

module.exports = {
  listExpenseCategories,
  resolveExpenseCategory,
  validateExpenseCategoryInput,
  getExpensePostingAccounts,
};