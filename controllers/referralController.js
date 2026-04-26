const Referral = require("../models/Referral");
const Customer = require("../models/Customer");
const PointsHistory = require("../models/PointsHistory");

const getJamaicaDateString = (date = new Date()) => {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Jamaica",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  return formatter.format(date);
};

const generateReferralCode = () => {
  return "EKR" + Math.random().toString(36).substring(2, 8).toUpperCase();
};

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

    const existingReferralCode = await Referral.findOne({
      referrerEkonId: customer.ekonId,
      status: "Active",
      refereeEkonId: "",
    });

    if (existingReferralCode) {
      return res.json({
        success: true,
        message: "Customer already has an active referral code",
        data: existingReferralCode,
      });
    }

    let code = generateReferralCode();
    let codeExists = await Referral.findOne({ referralCode: code });

    while (codeExists) {
      code = generateReferralCode();
      codeExists = await Referral.findOne({ referralCode: code });
    }

    const referral = await Referral.create({
      referrerEkonId: customer.ekonId,
      referrerName: customer.name,
      referralCode: code,
      status: "Active",
    });

    res.json({
      success: true,
      message: "Referral code created successfully",
      data: referral,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

const applyReferralCode = async (req, res) => {
  try {
    const { referralCode, newCustomerEkonId } = req.body;

    if (!referralCode || !newCustomerEkonId) {
      return res.status(400).json({
        success: false,
        message: "Referral code and new customer EKON ID are required",
      });
    }

    const referralOwner = await Referral.findOne({
      referralCode,
      status: "Active",
    });

    if (!referralOwner) {
      return res.status(404).json({
        success: false,
        message: "Invalid referral code",
      });
    }

    if (referralOwner.referrerEkonId === newCustomerEkonId) {
      return res.status(400).json({
        success: false,
        message: "Customer cannot refer themself",
      });
    }

    const referee = await Customer.findOne({ ekonId: newCustomerEkonId });

    if (!referee) {
      return res.status(404).json({
        success: false,
        message: "New customer not found",
      });
    }

    const existingReferral = await Referral.findOne({
      refereeEkonId: newCustomerEkonId,
      status: { $in: ["Pending", "Completed"] },
    });

    if (existingReferral) {
      return res.status(400).json({
        success: false,
        message: "This customer already has a referral linked",
      });
    }

    const referral = await Referral.create({
      referralCode,
      referrerEkonId: referralOwner.referrerEkonId,
      referrerName: referralOwner.referrerName,
      refereeEkonId: referee.ekonId,
      refereeName: referee.name,
      status: "Pending",
      rewardGiven: false,
    });

    res.json({
      success: true,
      message: "Referral linked successfully",
      data: referral,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

const completeReferral = async (refereeEkonId, trackingNumber = "") => {
  const referral = await Referral.findOne({
    refereeEkonId,
    status: "Pending",
    rewardGiven: false,
  });

  if (!referral) return null;

  const referrer = await Customer.findOne({
    ekonId: referral.referrerEkonId,
  });

  const referee = await Customer.findOne({
    ekonId: refereeEkonId,
  });

  if (!referrer || !referee) return null;

  const referrerOldPoints = Number(referrer.pointsBalance || 0);
  const refereeOldPoints = Number(referee.pointsBalance || 0);

  const referrerNewPoints = Math.min(referrerOldPoints + 100, 1500);
  const refereeNewPoints = Math.min(refereeOldPoints + 150, 1500);

  const referrerPointsAwarded = referrerNewPoints - referrerOldPoints;
  const refereePointsAwarded = refereeNewPoints - refereeOldPoints;

  referrer.pointsBalance = referrerNewPoints;
  referee.pointsBalance = refereeNewPoints;

  referrer.lastActivityDate = getJamaicaDateString();
  referee.lastActivityDate = getJamaicaDateString();

  await referrer.save();
  await referee.save();

  if (referrerPointsAwarded > 0) {
    await PointsHistory.create({
      customerEkonId: referrer.ekonId,
      customerName: referrer.name,
      action: `Referral Bonus - Referred ${referee.name}`,
      points: referrerPointsAwarded,
      date: getJamaicaDateString(),
    });
  }

  if (refereePointsAwarded > 0) {
    await PointsHistory.create({
      customerEkonId: referee.ekonId,
      customerName: referee.name,
      action: `Referral Bonus - Used referral code ${referral.referralCode}`,
      points: refereePointsAwarded,
      date: getJamaicaDateString(),
    });
  }

  referral.status = "Completed";
  referral.rewardGiven = true;
  referral.completedAt = new Date();
  referral.firstPackageTrackingNumber = trackingNumber;

  await referral.save();

  return referral;
};

const getReferrals = async (req, res) => {
  try {
    const referrals = await Referral.find().sort({ createdAt: -1 });

    res.json({
      success: true,
      message: "Referrals retrieved successfully",
      totalReferrals: referrals.length,
      data: referrals,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

const getCustomerReferral = async (req, res) => {
  try {
    const { ekonId } = req.params;

    const referrals = await Referral.find({
      $or: [{ referrerEkonId: ekonId }, { refereeEkonId: ekonId }],
    }).sort({ createdAt: -1 });

    res.json({
      success: true,
      message: "Customer referral records retrieved successfully",
      data: referrals,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

module.exports = {
  createReferralCode,
  applyReferralCode,
  completeReferral,
  getReferrals,
  getCustomerReferral,
};