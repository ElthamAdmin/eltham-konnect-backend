const BusinessPlanner = require("../models/BusinessPlanner");

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
};