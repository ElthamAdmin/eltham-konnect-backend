const crypto = require("crypto");

const Budget = require("../models/Budget");
const ChartOfAccount = require("../models/ChartOfAccount");

const T = require("../services/taxControl");
const S = require("../services/taxScopeService");

const {
  getBudgetRange,
  evaluateBudget,
  markOverlaps,
} = require("../services/budgetEngine");

const handle = (work) => async (req, res) => {
  res.set("Cache-Control", "no-store");

  try {
    await work(req, res);
  } catch (error) {
    console.error("Budgeting:", error);

    const status =
      error.statusCode ||
      (error.name === "ValidationError" ? 400 : 500);

    res.status(status).json({
      success: false,
      message:
        status === 500
          ? "Could not complete the budget operation."
          : error.message,
    });
  }
};

const getBudgets = handle(async (req, res) => {
  const unassigned = req.query.unassigned === "true";

  const entityCode = unassigned
    ? ""
    : T.text(
        req.query.entityCode,
        "Business entity"
      ).toUpperCase();

  const scope = {
    budgetYear: Number(req.query.budgetYear),
    budgetMonth: Number(req.query.budgetMonth),
    frequency: T.text(
      req.query.frequency || "Monthly",
      "Frequency"
    ),
  };

  getBudgetRange(scope);

  const query = {
    ...scope,

    ...(unassigned
      ? {
          $or: [
            { entityCode: "" },
            { entityCode: null },
          ],
        }
      : { entityCode }),
  };

  const budgets = await Budget.find(query)
    .sort({ budgetType: 1, category: 1, budgetName: 1 });

  const data = markOverlaps(
    await Promise.all(
      budgets.map(evaluateBudget)
    )
  );

  res.json({
    success: true,

    filters: {
      entityCode,
      unassigned,
      ...scope,
    },

    summary: {
      totalBudgets: data.length,

      comparedCount: data.filter(
        (row) =>
          row.comparisonStatus ===
          "Recorded ledger comparison"
      ).length,

      noActivityCount: data.filter(
        (row) =>
          row.comparisonStatus ===
          "No ledger activity"
      ).length,

      unavailableCount: data.filter(
        (row) =>
          row.comparisonStatus === "Unavailable"
      ).length,

      overlappingCount: data.filter(
        (row) => row.overlapWarning
      ).length,
    },

    notice:
      "Actuals are recorded JMD ledger amounts, not proof of complete records or cash available for staffing. Revenue, expenses, and planning-only budgets are not combined into a financial-health score.",

    data,
  });
});

const budgetValues = async (body) => {
  const entityCode = T.text(
    body.entityCode,
    "Business entity"
  ).toUpperCase();

  const values = {
    budgetName: T.text(
      body.budgetName,
      "Budget name"
    ),

    entityCode,
    currency: "JMD",

    budgetYear: Number(body.budgetYear),
    budgetMonth: Number(body.budgetMonth),

    frequency: T.text(
      body.frequency || "Monthly",
      "Frequency"
    ),

    category: T.text(
      body.category,
      "Budget category"
    ),

    budgetType: T.text(
      body.budgetType,
      "Budget type"
    ),

    branch: T.text(
      body.branch || "All Branches",
      "Branch"
    ),

    costCenter: "General",

    plannedAmount: T.amount(
      body.plannedAmount,
      "Planned amount"
    ),

    linkedChartAccountCode: T.text(
      body.linkedChartAccountCode || "",
      "Chart account",
      false
    ),

    linkedChartAccountName: "",

    notes: T.text(
      body.notes || "",
      "Notes",
      false
    ),
  };

  if (
    body.currency &&
    body.currency !== "JMD"
  ) {
    T.fail(
      "This budget comparison supports JMD base currency."
    );
  }

  if (
    body.costCenter &&
    body.costCenter !== "General"
  ) {
    T.fail(
      "New comparisons use General because consistent cost-center attribution is not available in the ledger."
    );
  }

  if (
    ![
      "All Branches",
      "Eltham Park Mainstore",
      "Brown's Town Square",
    ].includes(values.branch)
  ) {
    T.fail("Select a configured branch.");
  }

  const range = getBudgetRange(values);

  await S.resolve(
    entityCode,
    range.periodStart,
    range.periodEnd
  );

  if (
    ["Operating", "Revenue"].includes(
      values.budgetType
    )
  ) {
    if (!values.linkedChartAccountCode) {
      T.fail(
        "Operating and Revenue comparisons require a specific Chart of Accounts mapping."
      );
    }

    const account = await ChartOfAccount.findOne({
      accountCode: values.linkedChartAccountCode,
      status: "Active",
    });

    if (
      !account ||
      (
        values.budgetType === "Revenue"
          ? account.accountCategory !== "Revenue"
          : !["Expense", "Cost of Sales"].includes(
              account.accountCategory
            )
      )
    ) {
      T.fail(
        "Select an Active account matching the budget type."
      );
    }

    values.linkedChartAccountName =
      account.accountName;
  } else {
    values.linkedChartAccountCode = "";
  }

  if (
    values.category === "Revenue" &&
    values.budgetType !== "Revenue"
  ) {
    T.fail(
      "The Revenue category requires the Revenue budget type."
    );
  }

  return values;
};

const createBudget = handle(async (req, res) => {
  const values = await budgetValues(req.body || {});

  const budget = await Budget.create({
    ...values,
    budgetNumber: `BUD-${crypto.randomUUID()}`,
    status: "Active",
  });

  res.status(201).json({
    success: true,
    message:
      "Budget plan saved. No financial transaction was posted.",
    data: await evaluateBudget(budget),
  });
});

const updateBudget = handle(async (req, res) => {
  const budget = await Budget.findOne({
    budgetNumber: T.text(
      req.params.budgetNumber,
      "Budget number"
    ),
  });

  if (!budget) {
    T.fail("Budget not found.", 404);
  }

  if (budget.status !== "Active") {
    T.fail(
      "A Closed budget cannot be edited here.",
      409
    );
  }

  const values = await budgetValues(req.body || {});

  if (
    budget.entityCode &&
    budget.entityCode !== values.entityCode
  ) {
    T.fail(
      "An attributed budget cannot be moved to another business.",
      409
    );
  }

  Object.assign(budget, values);
  await budget.save();

  res.json({
    success: true,
    message:
      "Budget plan updated. Ledger transactions were not changed.",
    data: await evaluateBudget(budget),
  });
});

module.exports = {
  getBudgets,
  createBudget,
  updateBudget,
};