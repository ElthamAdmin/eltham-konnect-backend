const { SYSTEM_ACCOUNTS } = require("./accountingConstants");

const EXPENSE_CATEGORY_MAP = {
  "KP Package Invoice": {
    classification: "Cost of Goods Sold",
    group: "Package Cost",
    accountCode: SYSTEM_ACCOUNTS.COST_OF_SALES,
    accountName: "Cost of Sales",
    isCOGS: true,
  },
  "LTW Package Invoice": {
    classification: "Cost of Goods Sold",
    group: "Package Cost",
    accountCode: SYSTEM_ACCOUNTS.COST_OF_SALES,
    accountName: "Cost of Sales",
    isCOGS: true,
  },
  "KP Warehouse Invoice": {
    classification: "Cost of Goods Sold",
    group: "Warehouse Cost",
    accountCode: SYSTEM_ACCOUNTS.COST_OF_SALES,
    accountName: "Cost of Sales",
    isCOGS: true,
  },
  "LTW Warehouse Invoice": {
    classification: "Cost of Goods Sold",
    group: "Warehouse Cost",
    accountCode: SYSTEM_ACCOUNTS.COST_OF_SALES,
    accountName: "Cost of Sales",
    isCOGS: true,
  },
  "Inventory Expenses": {
    classification: "Cost of Goods Sold",
    group: "Inventory",
    accountCode: SYSTEM_ACCOUNTS.COST_OF_SALES,
    accountName: "Cost of Sales",
    isCOGS: true,
  },

  "Amazon Prime Subscription": {
    classification: "Operating Expense",
    group: "Subscriptions",
    accountCode: SYSTEM_ACCOUNTS.OPERATING_EXPENSE,
    accountName: "Operating Expense",
    isCOGS: false,
  },
  "Fygaro Subscription": {
    classification: "Operating Expense",
    group: "Subscriptions",
    accountCode: SYSTEM_ACCOUNTS.OPERATING_EXPENSE,
    accountName: "Operating Expense",
    isCOGS: false,
  },
  "Render Subscription": {
    classification: "Operating Expense",
    group: "Subscriptions",
    accountCode: SYSTEM_ACCOUNTS.OPERATING_EXPENSE,
    accountName: "Operating Expense",
    isCOGS: false,
  },

  "Travel Expense (Taxi Fare)": {
    classification: "Operating Expense",
    group: "Travel",
    accountCode: SYSTEM_ACCOUNTS.DELIVERY_EXPENSE,
    accountName: "Delivery Expense",
    isCOGS: false,
  },
  Fuel: {
    classification: "Operating Expense",
    group: "Vehicle",
    accountCode: SYSTEM_ACCOUNTS.DELIVERY_EXPENSE,
    accountName: "Delivery Expense",
    isCOGS: false,
  },
  "Vehicle Maintenance": {
    classification: "Operating Expense",
    group: "Vehicle",
    accountCode: SYSTEM_ACCOUNTS.DELIVERY_EXPENSE,
    accountName: "Delivery Expense",
    isCOGS: false,
  },
  "Vehicle Insurance": {
    classification: "Operating Expense",
    group: "Vehicle",
    accountCode: SYSTEM_ACCOUNTS.OPERATING_EXPENSE,
    accountName: "Operating Expense",
    isCOGS: false,
  },
  "Vehicle Fitness": {
    classification: "Operating Expense",
    group: "Vehicle",
    accountCode: SYSTEM_ACCOUNTS.OPERATING_EXPENSE,
    accountName: "Operating Expense",
    isCOGS: false,
  },
  "Vehicle Registration": {
    classification: "Operating Expense",
    group: "Vehicle",
    accountCode: SYSTEM_ACCOUNTS.OPERATING_EXPENSE,
    accountName: "Operating Expense",
    isCOGS: false,
  },
  "Toll Fee": {
    classification: "Operating Expense",
    group: "Vehicle",
    accountCode: SYSTEM_ACCOUNTS.DELIVERY_EXPENSE,
    accountName: "Delivery Expense",
    isCOGS: false,
  },
  "Parking Fee": {
    classification: "Operating Expense",
    group: "Vehicle",
    accountCode: SYSTEM_ACCOUNTS.DELIVERY_EXPENSE,
    accountName: "Delivery Expense",
    isCOGS: false,
  },

  "Bank Charges / Fees": {
    classification: "Operating Expense",
    group: "Banking",
    accountCode: SYSTEM_ACCOUNTS.OPERATING_EXPENSE,
    accountName: "Operating Expense",
    isCOGS: false,
  },

  Rent: {
    classification: "Operating Expense",
    group: "Occupancy",
    accountCode: SYSTEM_ACCOUNTS.RENT_EXPENSE,
    accountName: "Rent Expense",
    isCOGS: false,
  },
  Light: {
    classification: "Operating Expense",
    group: "Utilities",
    accountCode: SYSTEM_ACCOUNTS.UTILITIES_EXPENSE,
    accountName: "Utilities Expense",
    isCOGS: false,
  },
  Internet: {
    classification: "Operating Expense",
    group: "Utilities",
    accountCode: SYSTEM_ACCOUNTS.UTILITIES_EXPENSE,
    accountName: "Utilities Expense",
    isCOGS: false,
  },
  "Phone Credit": {
    classification: "Operating Expense",
    group: "Communications",
    accountCode: SYSTEM_ACCOUNTS.UTILITIES_EXPENSE,
    accountName: "Utilities Expense",
    isCOGS: false,
  },

  "Staff Treat": {
    classification: "Operating Expense",
    group: "Staff Welfare",
    accountCode: SYSTEM_ACCOUNTS.OPERATING_EXPENSE,
    accountName: "Operating Expense",
    isCOGS: false,
  },
  "Office Expense": {
    classification: "Operating Expense",
    group: "Office",
    accountCode: SYSTEM_ACCOUNTS.SUPPLIES_EXPENSE,
    accountName: "Supplies Expense",
    isCOGS: false,
  },
  Stationery: {
    classification: "Operating Expense",
    group: "Office",
    accountCode: SYSTEM_ACCOUNTS.SUPPLIES_EXPENSE,
    accountName: "Supplies Expense",
    isCOGS: false,
  },

  "Wages / Salary": {
    classification: "Operating Expense",
    group: "Payroll",
    accountCode: SYSTEM_ACCOUNTS.PAYROLL_EXPENSE,
    accountName: "Payroll Expense",
    isCOGS: false,
  },

  Marketing: {
    classification: "Operating Expense",
    group: "Marketing",
    accountCode: SYSTEM_ACCOUNTS.OPERATING_EXPENSE,
    accountName: "Operating Expense",
    isCOGS: false,
  },

  "Cleaning Supplies": {
    classification: "Operating Expense",
    group: "Office",
    accountCode: SYSTEM_ACCOUNTS.SUPPLIES_EXPENSE,
    accountName: "Supplies Expense",
    isCOGS: false,
  },

  Miscellaneous: {
    classification: "Operating Expense",
    group: "Miscellaneous",
    accountCode: SYSTEM_ACCOUNTS.OPERATING_EXPENSE,
    accountName: "Operating Expense",
    isCOGS: false,
  },
};

const normalizeCategory = (category = "") => String(category).trim();

const getExpenseCategoryMeta = (category = "") => {
  const normalized = normalizeCategory(category);

  return (
    EXPENSE_CATEGORY_MAP[normalized] || {
      classification: "Operating Expense",
      group: "Miscellaneous",
      accountCode: SYSTEM_ACCOUNTS.OPERATING_EXPENSE,
      accountName: "Operating Expense",
      isCOGS: false,
    }
  );
};

const getExpenseAccountCode = (category = "") =>
  getExpenseCategoryMeta(category).accountCode;

const getExpenseCategories = () =>
  Object.entries(EXPENSE_CATEGORY_MAP).map(([category, meta]) => ({
    category,
    ...meta,
  }));

module.exports = {
  EXPENSE_CATEGORY_MAP,
  getExpenseCategoryMeta,
  getExpenseAccountCode,
  getExpenseCategories,
};