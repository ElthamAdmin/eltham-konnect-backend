const Budget = require("../models/Budget");

const roundMoney = (value) =>
  Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;

const getMonthFromDate = (dateValue) => {
  const date = dateValue ? new Date(dateValue) : new Date();

  if (Number.isNaN(date.getTime())) {
    return {
      budgetYear: new Date().getFullYear(),
      budgetMonth: new Date().getMonth() + 1,
    };
  }

  return {
    budgetYear: date.getFullYear(),
    budgetMonth: date.getMonth() + 1,
  };
};

const calculateVariance = ({ category, plannedAmount, actualAmount }) => {
  const planned = roundMoney(plannedAmount);
  const actual = roundMoney(actualAmount);

  if (category === "Revenue") {
    return roundMoney(actual - planned);
  }

  return roundMoney(planned - actual);
};

const calculateVariancePercent = ({ plannedAmount, variance }) => {
  const planned = roundMoney(plannedAmount);

  if (planned <= 0) return 0;

  return roundMoney((roundMoney(variance) / planned) * 100);
};

const refreshBudgetVariance = async (budget) => {
  const variance = calculateVariance({
    category: budget.category,
    plannedAmount: budget.plannedAmount,
    actualAmount: budget.actualAmount,
  });

  budget.variance = variance;
  budget.variancePercent = calculateVariancePercent({
    plannedAmount: budget.plannedAmount,
    variance,
  });

  await budget.save();
  return budget;
};

const findMatchingBudgets = async ({
  accountCode = "",
  category = "",
  branch = "All Branches",
  costCenter = "",
  postingDate,
}) => {
  const { budgetYear, budgetMonth } = getMonthFromDate(postingDate);

  const query = {
    budgetYear,
    budgetMonth,
    status: "Active",
  };

  const orConditions = [];

  if (accountCode) {
    orConditions.push({ linkedChartAccountCode: accountCode });
  }

  if (category) {
    orConditions.push({ category });
  }

  if (orConditions.length > 0) {
    query.$or = orConditions;
  }

  const budgets = await Budget.find(query);

  return budgets.filter((budget) => {
    const budgetBranch = budget.branch || "All Branches";
    const budgetCostCenter = budget.costCenter || "General";

    const branchMatches =
      budgetBranch === "All Branches" ||
      !branch ||
      branch === "All Branches" ||
      budgetBranch === branch;

    const costCenterMatches =
      !costCenter ||
      budgetCostCenter === "General" ||
      budgetCostCenter === costCenter;

    return branchMatches && costCenterMatches;
  });
};

const applyActualToBudgets = async ({
  accountCode = "",
  category = "",
  amount = 0,
  branch = "All Branches",
  costCenter = "",
  postingDate,
}) => {
  const numericAmount = roundMoney(amount);

  if (numericAmount <= 0) {
    return [];
  }

  const budgets = await findMatchingBudgets({
    accountCode,
    category,
    branch,
    costCenter,
    postingDate,
  });

  const updatedBudgets = [];

  for (const budget of budgets) {
    budget.actualAmount = roundMoney(
      Number(budget.actualAmount || 0) + numericAmount
    );

    updatedBudgets.push(await refreshBudgetVariance(budget));
  }

  return updatedBudgets;
};

module.exports = {
  getMonthFromDate,
  calculateVariance,
  calculateVariancePercent,
  refreshBudgetVariance,
  findMatchingBudgets,
  applyActualToBudgets,
};