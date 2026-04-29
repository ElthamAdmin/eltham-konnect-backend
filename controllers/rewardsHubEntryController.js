const RewardsHubEntry = require("../models/RewardsHubEntry");
const Customer = require("../models/Customer");

const enterRewardsHub = async (req, res) => {
  try {
    const { rewardsHubId, customerEkonId, customerName } = req.body;

    if (!rewardsHubId || !customerEkonId) {
      return res.status(400).json({
        success: false,
        message: "Rewards Hub ID and customer EKON ID are required",
      });
    }

    const customer = await Customer.findOne({ ekonId: customerEkonId });

    if (!customer) {
      return res.status(404).json({
        success: false,
        message: "Customer not found",
      });
    }

    const existing = await RewardsHubEntry.findOne({
      rewardsHubId,
      customerEkonId,
    });

    if (existing) {
      return res.status(400).json({
        success: false,
        message: "You already entered this.",
      });
    }

    const entry = await RewardsHubEntry.create({
      rewardsHubId,
      customerId: customer._id,
      customerName: customer.name || customerName,
      customerEkonId: customer.ekonId,
      actionType: "Entered",
    });

    res.json({
      success: true,
      message: "Entry successful",
      data: entry,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to enter",
      error: error.message,
    });
  }
};

const getEntriesByHub = async (req, res) => {
  try {
    const { hubId } = req.params;

    const entries = await RewardsHubEntry.find({
      rewardsHubId: hubId,
    }).sort({ createdAt: -1 });

    res.json({
      success: true,
      message: "Entries retrieved successfully",
      data: entries,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to load entries",
      error: error.message,
    });
  }
};

const getCustomerEntries = async (req, res) => {
  try {
    const { ekonId } = req.params;

    const entries = await RewardsHubEntry.find({
      customerEkonId: ekonId,
    }).sort({ createdAt: -1 });

    res.json({
      success: true,
      message: "Customer entries retrieved successfully",
      data: entries,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to load customer entries",
      error: error.message,
    });
  }
};

const pickWinner = async (req, res) => {
  try {
    const { hubId } = req.params;

    const entries = await RewardsHubEntry.find({
      rewardsHubId: hubId,
    });

    if (!entries.length) {
      return res.status(400).json({
        success: false,
        message: "No entries found for this post",
      });
    }

    // OPTIONAL: prevent multiple winners
    const existingWinner = await RewardsHubEntry.findOne({
      rewardsHubId: hubId,
      isWinner: true,
    });

    if (existingWinner) {
      return res.status(400).json({
        success: false,
        message: "Winner already selected for this post",
      });
    }

    // RANDOM SELECTION
    const randomIndex = Math.floor(Math.random() * entries.length);
    const winner = entries[randomIndex];

    winner.isWinner = true;
    winner.hasWon = true;
    winner.winDate = new Date();

    await winner.save();

    res.json({
      success: true,
      message: "Winner selected successfully",
      data: winner,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to pick winner",
      error: error.message,
    });
  }
};

const RewardsHub = require("../models/RewardsHub");
const PointsHistory = require("../models/PointsHistory");

const rewardWinner = async (req, res) => {
  try {
    const { hubId } = req.params;

    const winner = await RewardsHubEntry.findOne({
      rewardsHubId: hubId,
      isWinner: true,
    });

    if (!winner) {
      return res.status(400).json({
        success: false,
        message: "No winner selected yet",
      });
    }

    if (winner.rewardGiven) {
      return res.status(400).json({
        success: false,
        message: "Reward already given",
      });
    }

    const hub = await RewardsHub.findById(hubId);

    if (!hub || !hub.rewardPoints) {
      return res.status(400).json({
        success: false,
        message: "No reward points set for this post",
      });
    }

    const customer = await Customer.findById(winner.customerId);

    if (!customer) {
      return res.status(404).json({
        success: false,
        message: "Customer not found",
      });
    }

    // ✅ Apply points (respect cap 1500)
    const newBalance = Math.min(
      1500,
      Number(customer.pointsBalance || 0) + hub.rewardPoints
    );

    customer.pointsBalance = newBalance;
    await customer.save();

    // ✅ Log history
    await PointsHistory.create({
      customerId: customer._id,
      customerName: customer.name,
      customerEkonId: customer.ekonId,
      action: `Rewards Hub Winner (${hub.title})`,
      points: hub.rewardPoints,
    });

    // ✅ Mark rewarded
    winner.rewardGiven = true;
    winner.rewardDate = new Date();
    await winner.save();

    res.json({
      success: true,
      message: "Winner rewarded successfully",
      data: {
        customerName: customer.name,
        pointsAdded: hub.rewardPoints,
        newBalance,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to reward winner",
      error: error.message,
    });
  }
};

module.exports = {
  enterRewardsHub,
  getEntriesByHub,
  getCustomerEntries,
  pickWinner,
  rewardWinner, // ⭐ add
};