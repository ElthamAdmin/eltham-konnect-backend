const Referral = require("../models/Referral");
const Customer = require("../models/Customer");
const PointsHistory = require("../models/PointsHistory");

// GENERATE REFERRAL CODE
const generateReferralCode = () => {
  return "EKR" + Math.random().toString(36).substring(2, 8).toUpperCase();
};

// CREATE REFERRAL CODE FOR CUSTOMER
const createReferralCode = async (req, res) => {
  try {
    const { ekonId } = req.body;

    const customer = await Customer.findOne({ ekonId });

    if (!customer) {
      return res.status(404).json({
        success: false,
        message: "Customer not found",
      });
    }

    const code = generateReferralCode();

    const referral = await Referral.create({
      referrerEkonId: customer.ekonId,
      referrerName: customer.name,
      referralCode: code,
    });

    res.json({
      success: true,
      message: "Referral code created",
      data: referral,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// APPLY REFERRAL CODE (when new user signs up)
const applyReferralCode = async (req, res) => {
  try {
    const { referralCode, newCustomerEkonId } = req.body;

    const referral = await Referral.findOne({ referralCode });

    if (!referral) {
      return res.status(404).json({
        success: false,
        message: "Invalid referral code",
      });
    }

    referral.refereeEkonId = newCustomerEkonId;
    referral.status = "Pending";

    await referral.save();

    res.json({
      success: true,
      message: "Referral linked successfully",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// COMPLETE REFERRAL (trigger when first package arrives)
const completeReferral = async (refereeEkonId) => {
  const referral = await Referral.findOne({
    refereeEkonId,
    rewardGiven: false,
  });

  if (!referral) return;

  const referrer = await Customer.findOne({
    ekonId: referral.referrerEkonId,
  });

  const referee = await Customer.findOne({
    ekonId: refereeEkonId,
  });

  if (!referrer || !referee) return;

  referrer.pointsBalance = Math.min(referrer.pointsBalance + 100, 1500);
  referee.pointsBalance = Math.min(referee.pointsBalance + 150, 1500);

  await referrer.save();
  await referee.save();

  await PointsHistory.create({
    customerEkonId: referrer.ekonId,
    customerName: referrer.name,
    action: "Referral Bonus (Referrer)",
    points: 100,
  });

  await PointsHistory.create({
    customerEkonId: referee.ekonId,
    customerName: referee.name,
    action: "Referral Bonus (Referee)",
    points: 150,
  });

  referral.status = "Completed";
  referral.rewardGiven = true;
  referral.completedAt = new Date();

  await referral.save();
};

module.exports = {
  createReferralCode,
  applyReferralCode,
  completeReferral,
};