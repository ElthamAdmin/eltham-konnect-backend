const { SYSTEM_ACCOUNTS } = require("./accountingConstants");

const getExpenseAccountCode = (category = "") => {
  const normalized = String(category).trim().toLowerCase();

  const costOfSalesCategories = [
    "ltw package invoice",
    "kp package invoice",
    "ox package invoice",
    "ltw pickup fee",
    "kp pickup fee",
    "ox pickup fee",
    "customs",
    "clearance",
    "customs / clearance expense",
    "delivery expense",
    "packaging supplies",
    "package wrapping",
  ];

  if (costOfSalesCategories.some((item) => normalized.includes(item))) {
    return SYSTEM_ACCOUNTS.COST_OF_SALES;
  }

  if (normalized.includes("rent")) {
    return SYSTEM_ACCOUNTS.RENT_EXPENSE;
  }

  if (
    normalized.includes("utility") ||
    normalized.includes("light") ||
    normalized.includes("water") ||
    normalized.includes("internet")
  ) {
    return SYSTEM_ACCOUNTS.UTILITIES_EXPENSE;
  }

  if (
    normalized.includes("supply") ||
    normalized.includes("supplies") ||
    normalized.includes("stationery") ||
    normalized.includes("office")
  ) {
    return SYSTEM_ACCOUNTS.SUPPLIES_EXPENSE;
  }

  if (
    normalized.includes("payroll") ||
    normalized.includes("wages") ||
    normalized.includes("salary")
  ) {
    return SYSTEM_ACCOUNTS.PAYROLL_EXPENSE;
  }

  if (normalized.includes("delivery")) {
    return SYSTEM_ACCOUNTS.DELIVERY_EXPENSE;
  }

  return SYSTEM_ACCOUNTS.OPERATING_EXPENSE;
};

module.exports = {
  getExpenseAccountCode,
};