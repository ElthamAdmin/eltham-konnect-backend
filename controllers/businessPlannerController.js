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

    res.json({
      success: true,
      data: {
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