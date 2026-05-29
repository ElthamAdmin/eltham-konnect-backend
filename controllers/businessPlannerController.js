const BusinessPlanner = require("../models/BusinessPlanner");
const Customer = require("../models/Customer");
const Package = require("../models/Package");
const Invoice = require("../models/Invoice");
const Expense = require("../models/Expense");
const SupportTicket = require("../models/SupportTicket");
const Budget = require("../models/Budget");

const buildAdvisorNote = (item) => {
  if (item.category === "Giveaway / Promotion") {
    return "Before running this giveaway, check cash flow, unpaid bills, debt obligations, and monthly profit. Giveaways should only be done when the business can afford the cost without affecting operations.";
  }

  if (item.category === "Hiring Plan") {
    return "Before hiring, confirm the business can cover at least 3 months of payroll, statutory obligations, and training time without hurting cash flow.";
  }

  if (item.category === "LLC Transition") {
    return "This supports the move away from sole trader operations. Keep company documents, tax registration, bank account setup, and compliance deadlines organized.";
  }

  if (item.category === "Compliance") {
    return "For Jamaica employment compliance, track staff contracts, PAYE, NIS, NHT, HEART, leave records, payroll records, and employee files.";
  }

  if (item.category === "Financial Strategy") {
    return "Review revenue, expenses, debt, cash reserve, and profit margin before making this decision.";
  }

  if (item.category === "Business Decision") {
    return "Record the reason for the decision, expected outcome, cost, risks, and review the result later.";
  }

  if (item.category === "5-Year Goal") {
    return "Break this goal into yearly milestones, monthly actions, and measurable targets.";
  }

  if (
  [
    "Revenue Goal",
    "Profit Goal",
    "Customer Goal",
    "Package Goal",
    "Hiring Goal",
    "Compliance Goal",
    "Expansion Goal",
    "Marketing Goal",
  ].includes(item.category)
) {
  return "This is a strategic roadmap goal. Track the target value, current progress, due date, and status so EKOS can measure yearly growth progress.";
}

  return "Track this item carefully and update its status as progress is made.";
};

const getSummary = (items) => {
  const total = items.length;
  const completed = items.filter((item) => item.status === "Completed").length;
  const pending = items.filter((item) =>
    ["Planned", "In Progress", "On Hold"].includes(item.status)
  ).length;
  const highPriority = items.filter((item) =>
    ["High", "Critical"].includes(item.priority)
  ).length;

  const complianceItems = items.filter((item) =>
    ["Compliance", "LLC Transition"].includes(item.category)
  );

  const completedCompliance = complianceItems.filter(
    (item) => item.status === "Completed"
  ).length;

  const complianceReadiness =
    complianceItems.length === 0
      ? 0
      : Math.round((completedCompliance / complianceItems.length) * 100);

  const giveawayItems = items.filter(
    (item) => item.category === "Giveaway / Promotion"
  );

  const activeGiveaways = giveawayItems.filter((item) =>
    ["Planned", "In Progress"].includes(item.status)
  ).length;

  return {
    total,
    completed,
    pending,
    highPriority,
    complianceReadiness,
    activeGiveaways,
  };
};

const buildFiveYearRoadmap = (plannerItems, intelligenceValues = {}) => {
  const years = [2026, 2027, 2028, 2029, 2030];

  const roadmapCategories = [
    "5-Year Goal",
    "Revenue Goal",
    "Profit Goal",
    "Customer Goal",
    "Package Goal",
    "Hiring Goal",
    "Compliance Goal",
    "Expansion Goal",
    "Marketing Goal",
  ];

  return years.map((year) => {
    const yearItems = plannerItems.filter(
      (item) =>
        Number(item.targetYear) === year &&
        roadmapCategories.includes(item.category)
    );

    const completedGoals = yearItems.filter(
      (item) => item.status === "Completed"
    ).length;

    const roadmapProgress =
      yearItems.length === 0
        ? 0
        : Math.round((completedGoals / yearItems.length) * 100);

    const revenueGoal = yearItems.find((item) => item.category === "Revenue Goal");
    const profitGoal = yearItems.find((item) => item.category === "Profit Goal");
    const customerGoal = yearItems.find((item) => item.category === "Customer Goal");
    const packageGoal = yearItems.find((item) => item.category === "Package Goal");

    const progressFromTarget = (goalItem, liveValue) => {
      const target = Number(goalItem?.targetValue || 0);
      const current = Number(liveValue || goalItem?.currentValue || 0);

      if (!goalItem || target <= 0) return 0;

      return Math.min(100, Math.round((current / target) * 100));
    };

    return {
      year,
      totalGoals: yearItems.length,
      completedGoals,
      roadmapProgress,

      revenue: {
        target: Number(revenueGoal?.targetValue || 0),
        current: Number(intelligenceValues.totalRevenue || revenueGoal?.currentValue || 0),
        progress: progressFromTarget(revenueGoal, intelligenceValues.totalRevenue),
      },

      profit: {
        target: Number(profitGoal?.targetValue || 0),
        current: Number(intelligenceValues.estimatedProfit || profitGoal?.currentValue || 0),
        progress: progressFromTarget(profitGoal, intelligenceValues.estimatedProfit),
      },

      customers: {
        target: Number(customerGoal?.targetValue || 0),
        current: Number(intelligenceValues.customers || customerGoal?.currentValue || 0),
        progress: progressFromTarget(customerGoal, intelligenceValues.customers),
      },

      packages: {
        target: Number(packageGoal?.targetValue || 0),
        current: Number(intelligenceValues.packages || packageGoal?.currentValue || 0),
        progress: progressFromTarget(packageGoal, intelligenceValues.packages),
      },
    };
  });
};

const buildExecutiveActionEngine = ({
  plannerItems,
  unpaidInvoices,
  estimatedProfit,
  profitMargin,
  complianceReadiness,
  criticalOpenItems,
  budgetVariance,
  totalRevenue,
  fiveYearRoadmap,
}) => {
  const priorityQueue = [];

  if (unpaidInvoices.length > 0) {
    priorityQueue.push({
      title: `Follow up ${unpaidInvoices.length} unpaid invoice(s)`,
      category: "Collections",
      impact: unpaidInvoices.length >= 5 ? "High" : "Medium",
      status: "Action Needed",
      reason:
        "Unpaid invoices reduce cash flow and can delay payroll, freight payments, rent, giveaways, hiring, and expansion.",
    });
  }

  const openCriticalItems = plannerItems
    .filter(
      (item) =>
        item.priority === "Critical" &&
        !["Completed", "Cancelled"].includes(item.status)
    )
    .slice(0, 3);

  openCriticalItems.forEach((item) => {
    priorityQueue.push({
      title: item.title,
      category: item.category,
      impact: "High",
      status: item.status,
      reason:
        item.advisorNote ||
        "This is a critical business item and should be resolved before major business moves.",
    });
  });

  const currentYear = new Date().getFullYear();
  const currentYearPlan = fiveYearRoadmap.find(
    (item) => Number(item.year) === Number(currentYear)
  );

  if (
    currentYearPlan?.revenue?.target > 0 &&
    currentYearPlan.revenue.progress < 100
  ) {
    const revenueGap =
      Number(currentYearPlan.revenue.target || 0) -
      Number(currentYearPlan.revenue.current || 0);

    priorityQueue.push({
      title: `Close revenue gap of JMD ${Math.max(
        0,
        revenueGap
      ).toLocaleString()}`,
      category: "Revenue Growth",
      impact: revenueGap > 100000 ? "High" : "Medium",
      status: "In Progress",
      reason:
        "The current year revenue goal is not yet complete. Focus on invoice collection, customer growth, package volume, and repeat customer activity.",
    });
  }

  if (budgetVariance < 0) {
    priorityQueue.push({
      title: "Review negative budget variance",
      category: "Budget Control",
      impact: "High",
      status: "Action Needed",
      reason:
        "Actual performance is worse than planned. Review expenses, budget categories, and upcoming obligations before increasing spending.",
    });
  }

  if (complianceReadiness < 70) {
    priorityQueue.push({
      title: "Improve compliance readiness",
      category: "Compliance",
      impact: "High",
      status: "Action Needed",
      reason:
        "Compliance readiness is below the safe level. Prioritize LLC, payroll, employment records, statutory obligations, and staff documentation.",
    });
  }

  if (estimatedProfit <= 0) {
    priorityQueue.push({
      title: "Restore business profitability",
      category: "Profitability",
      impact: "Critical",
      status: "Urgent",
      reason:
        "Profit is zero or negative. Delay hiring, giveaways, and expansion until revenue improves or expenses are reduced.",
    });
  }

  const financialStability =
    estimatedProfit > 0
      ? Math.min(100, Math.max(30, profitMargin * 2))
      : 20;

  const growthReadiness =
    estimatedProfit > 0 && profitMargin >= 15 && criticalOpenItems === 0
      ? 90
      : estimatedProfit > 0 && profitMargin >= 8
      ? 65
      : 35;

  const complianceStrength = complianceReadiness;

  const customerGrowth =
    totalRevenue > 0
      ? Math.min(100, Math.round(totalRevenue / 6000))
      : 25;

  const operationalHealth =
    unpaidInvoices.length <= 3 && criticalOpenItems === 0
      ? 90
      : unpaidInvoices.length <= 5
      ? 70
      : 45;

  const giveawayRecommendation =
    estimatedProfit > 0 && unpaidInvoices.length <= 5 && criticalOpenItems === 0
      ? {
          type: "Referral Campaign",
          budget: Math.round(estimatedProfit * 0.05),
          recommendation: "Safe with limits",
          reason:
            "Profit is positive and collections risk is manageable. A referral campaign gives value while encouraging customer growth.",
          expectedOutcome:
            "Encourage repeat business and attract new customers without putting pressure on operating cash.",
        }
      : {
          type: "No giveaway recommended",
          budget: 0,
          recommendation: "Delay giveaway",
          reason:
            "There are open risks such as critical tasks, unpaid invoices, weak profit, or budget pressure.",
          expectedOutcome:
            "Protect cash flow until the business position is stronger.",
        };

  const hiringRecommendation =
    estimatedProfit > 0 && profitMargin >= 10 && complianceReadiness >= 70
      ? {
          position: "Customer Service / Operations Assistant",
          estimatedMonthlyCost: 15000,
          recommendation: "Consider hiring carefully",
          timeline: "After cash reserve and payroll obligations are reviewed",
          reason:
            "The business is profitable enough to start planning support staff, but payroll and compliance must remain controlled.",
        }
      : {
          position: "No new hire recommended",
          estimatedMonthlyCost: 0,
          recommendation: "Delay hiring",
          timeline: "After profitability, compliance, and cash reserve improve",
          reason:
            "Hiring now may increase fixed costs before the business is ready.",
        };

  return {
    priorityQueue: priorityQueue.slice(0, 5),
    executiveScores: {
      financialStability: Math.round(financialStability),
      growthReadiness: Math.round(growthReadiness),
      complianceStrength: Math.round(complianceStrength),
      customerGrowth: Math.round(customerGrowth),
      operationalHealth: Math.round(operationalHealth),
    },
    giveawayRecommendation,
    hiringRecommendation,
  };
};

const getBusinessPlannerIntelligence = async (req, res) => {
  try {
    const [customers, packages, invoices, expenses, tickets, plannerItems, budgets] =
      await Promise.all([
        Customer.find(),
        Package.find(),
        Invoice.find(),
        Expense.find(),
        SupportTicket.find(),
        BusinessPlanner.find(),
        Budget.find(),
      ]);

    const paidInvoices = invoices.filter((inv) => inv.status === "Paid");
    const unpaidInvoices = invoices.filter((inv) => inv.status !== "Paid");

    const totalRevenue = paidInvoices.reduce(
      (sum, inv) => sum + Number(inv.finalTotal || 0),
      0
    );

    const totalExpenses = expenses.reduce(
      (sum, exp) => sum + Number(exp.amount || 0),
      0
    );

    const estimatedProfit = totalRevenue - totalExpenses;

    const profitMargin =
      totalRevenue > 0 ? Math.round((estimatedProfit / totalRevenue) * 100) : 0;

    const complianceItems = plannerItems.filter((item) =>
      ["Compliance", "LLC Transition"].includes(item.category)
    );

    const completedCompliance = complianceItems.filter(
      (item) => item.status === "Completed"
    ).length;

    const complianceReadiness =
      complianceItems.length === 0
        ? 0
        : Math.round((completedCompliance / complianceItems.length) * 100);

    const criticalOpenItems = plannerItems.filter(
      (item) =>
        item.priority === "Critical" &&
        !["Completed", "Cancelled"].includes(item.status)
    ).length;

    const resolvedTickets = tickets.filter((ticket) =>
      ["Resolved", "Closed"].includes(ticket.status)
    ).length;

    const supportResolutionRate =
      tickets.length > 0 ? Math.round((resolvedTickets / tickets.length) * 100) : 100;

    const budgetVariance = budgets.reduce(
      (sum, budget) => sum + Number(budget.variance || 0),
      0
    );

    let healthScore = 0;

    if (estimatedProfit > 0) healthScore += 25;
    if (profitMargin >= 15) healthScore += 15;
    else if (profitMargin >= 8) healthScore += 8;

    if (complianceReadiness >= 80) healthScore += 20;
    else if (complianceReadiness >= 50) healthScore += 10;

    if (unpaidInvoices.length <= 3) healthScore += 10;
    else if (unpaidInvoices.length <= 8) healthScore += 5;

    if (packages.length >= 50) healthScore += 10;
    else if (packages.length >= 20) healthScore += 5;

    if (customers.length >= 50) healthScore += 10;
    else if (customers.length >= 20) healthScore += 5;

    if (supportResolutionRate >= 80) healthScore += 10;
    else if (supportResolutionRate >= 50) healthScore += 5;

    healthScore = Math.min(100, healthScore);

    const giveawayBudget =
      estimatedProfit > 0 && unpaidInvoices.length <= 5 && criticalOpenItems === 0
        ? Math.round(estimatedProfit * 0.05)
        : 0;

    const giveawayStatus =
      giveawayBudget > 0 ? "Safe with limits" : "Not recommended now";

    const hiringStatus =
      estimatedProfit > 0 && profitMargin >= 10 && complianceReadiness >= 70
        ? "Consider hiring carefully"
        : "Delay hiring";

    const expansionStatus =
      estimatedProfit > 0 &&
      profitMargin >= 15 &&
      complianceReadiness >= 80 &&
      criticalOpenItems === 0
        ? "Expansion planning allowed"
        : "Do not expand yet";

    const alerts = [];

    if (estimatedProfit <= 0) {
      alerts.push("Profit is currently zero or negative. Focus on revenue and expense control before hiring, giveaways, or expansion.");
    }

    if (unpaidInvoices.length > 5) {
      alerts.push("Unpaid invoices are high. Follow up on collections before offering giveaways.");
    }

    if (complianceReadiness < 70) {
      alerts.push("Compliance readiness is below 70%. Prioritize LLC, employment, payroll, and statutory compliance tasks.");
    }

    if (criticalOpenItems > 0) {
      alerts.push(`${criticalOpenItems} critical planner item(s) are still open. Resolve these before major business moves.`);
    }

    if (budgetVariance < 0) {
      alerts.push("Budget variance is negative. Review spending and compare actual expenses against planned amounts.");
    }

    if (alerts.length === 0) {
      alerts.push("Business position looks stable. Continue monitoring profitability, compliance, cash flow, and customer service.");
    }

    const fiveYearRoadmap = buildFiveYearRoadmap(plannerItems, {
  totalRevenue,
  estimatedProfit,
  customers: customers.length,
  packages: packages.length,
});

const executiveEngine = buildExecutiveActionEngine({
  plannerItems,
  unpaidInvoices,
  estimatedProfit,
  profitMargin,
  complianceReadiness,
  criticalOpenItems,
  budgetVariance,
  totalRevenue,
  fiveYearRoadmap,
});

    res.json({
      success: true,
      data: {
        executiveEngine,
        fiveYearRoadmap,
        healthScore,
        profitMargin,
        totalRevenue,
        totalExpenses,
        estimatedProfit,
        unpaidInvoices: unpaidInvoices.length,
        customers: customers.length,
        packages: packages.length,
        complianceReadiness,
        criticalOpenItems,
        supportResolutionRate,
        budgetVariance,
        giveawayBudget,
        giveawayStatus,
        hiringStatus,
        expansionStatus,
        alerts,
      },
    });
  } catch (error) {
    console.error("Business planner intelligence error:", error);
    res.status(500).json({
      success: false,
      message: "Could not load business intelligence.",
      error: error.message,
    });
  }
};

const getBusinessPlannerItems = async (req, res) => {
  try {
    const items = await BusinessPlanner.find().sort({
      targetYear: 1,
      priority: 1,
      createdAt: -1,
    });

    res.json({
      success: true,
      data: items,
      summary: getSummary(items),
      advisor: {
        title: "EKOS Business Advisor",
        message:
          "Use this center to guide Eltham Konnect’s growth, profitability, compliance, hiring, giveaways, and major business decisions. This tool gives business guidance, but final financial, legal, and tax decisions should be checked with the proper professional where needed.",
      },
    });
  } catch (error) {
    console.error("Business planner load error:", error);
    res.status(500).json({
      success: false,
      message: "Could not load business planner items.",
    });
  }
};

const createBusinessPlannerItem = async (req, res) => {
  try {
    const payload = {
      ...req.body,
      advisorNote: buildAdvisorNote(req.body),
      createdBy: req.user?.fullName || req.user?.email || "",
    };

    const item = await BusinessPlanner.create(payload);

    res.status(201).json({
      success: true,
      message: "Business planner item created.",
      data: item,
    });
  } catch (error) {
    console.error("Business planner create error:", error);
    res.status(500).json({
      success: false,
      message: "Could not create business planner item.",
    });
  }
};

const updateBusinessPlannerItem = async (req, res) => {
  try {
    const payload = {
      ...req.body,
    };

    if (req.body.category) {
      payload.advisorNote = buildAdvisorNote(req.body);
    }

    const item = await BusinessPlanner.findByIdAndUpdate(
      req.params.id,
      payload,
      { new: true, runValidators: true }
    );

    if (!item) {
      return res.status(404).json({
        success: false,
        message: "Business planner item not found.",
      });
    }

    res.json({
      success: true,
      message: "Business planner item updated.",
      data: item,
    });
  } catch (error) {
    console.error("Business planner update error:", error);
    res.status(500).json({
      success: false,
      message: "Could not update business planner item.",
    });
  }
};

const deleteBusinessPlannerItem = async (req, res) => {
  try {
    const item = await BusinessPlanner.findByIdAndDelete(req.params.id);

    if (!item) {
      return res.status(404).json({
        success: false,
        message: "Business planner item not found.",
      });
    }

    res.json({
      success: true,
      message: "Business planner item deleted.",
    });
  } catch (error) {
    console.error("Business planner delete error:", error);
    res.status(500).json({
      success: false,
      message: "Could not delete business planner item.",
    });
  }
};

module.exports = {
  getBusinessPlannerItems,
  createBusinessPlannerItem,
  updateBusinessPlannerItem,
  deleteBusinessPlannerItem,
  getBusinessPlannerIntelligence,
};