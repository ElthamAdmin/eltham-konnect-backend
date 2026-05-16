const CorporateProfile = require("../models/CorporateProfile");

const getCorporateProfile = async (req, res) => {
  try {
    let profile = await CorporateProfile.findOne();

    if (!profile) {
      profile = await CorporateProfile.create({
        createdBy: req.user?.name || "System User",
      });
    }

    res.json({
      success: true,
      data: profile,
    });
  } catch (error) {
    console.error("Get corporate profile error:", error);

    res.status(500).json({
      success: false,
      message: "Could not load corporate profile",
      error: error.message,
    });
  }
};

const updateCorporateProfile = async (req, res) => {
  try {
    let profile = await CorporateProfile.findOne();

    if (!profile) {
      profile = await CorporateProfile.create({
        createdBy: req.user?.name || "System User",
      });
    }

    Object.assign(profile, req.body);

    await profile.save();

    res.json({
      success: true,
      message: "Corporate profile updated successfully",
      data: profile,
    });
  } catch (error) {
    console.error("Update corporate profile error:", error);

    res.status(500).json({
      success: false,
      message: "Could not update corporate profile",
      error: error.message,
    });
  }
};

module.exports = {
  getCorporateProfile,
  updateCorporateProfile,
};