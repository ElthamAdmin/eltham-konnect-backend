const MarketingCampaign = require("../models/MarketingCampaign");

const getCampaigns = async (req, res) => {
  try {
    const campaigns = await MarketingCampaign.find().sort({ createdAt: -1 });

    res.json({
      success: true,
      message: "Marketing campaigns retrieved successfully",
      totalCampaigns: campaigns.length,
      data: campaigns,
    });
  } catch (error) {
    console.error("Error retrieving marketing campaigns:", error);
    res.status(500).json({
      success: false,
      message: "Failed to retrieve marketing campaigns",
    });
  }
};

const createCampaign = async (req, res) => {
  try {
    const {
      campaignName,
      channel,
      audience,
      budget,
      status,
      startDate,
      endDate,
      notes,
    } = req.body;

    if (!campaignName || !channel) {
      return res.status(400).json({
        success: false,
        message: "Campaign name and channel are required",
      });
    }

    const campaign = await MarketingCampaign.create({
      campaignNumber: `MKT-${Date.now()}`,
      campaignName,
      channel,
      audience: audience || "All Customers",
      budget: Number(budget || 0),
      status: status || "Draft",
      startDate: startDate || "",
      endDate: endDate || "",
      notes: notes || "",
    });

    res.status(201).json({
      success: true,
      message: "Marketing campaign created successfully",
      data: campaign,
    });
  } catch (error) {
    console.error("Error creating marketing campaign:", error);
    res.status(500).json({
      success: false,
      message: "Failed to create marketing campaign",
      error: error.message,
    });
  }
};

const updateCampaign = async (req, res) => {
  try {
    const { campaignNumber } = req.params;

    const campaign = await MarketingCampaign.findOne({ campaignNumber });

    if (!campaign) {
      return res.status(404).json({
        success: false,
        message: "Marketing campaign not found",
      });
    }

    campaign.campaignName = req.body.campaignName ?? campaign.campaignName;
    campaign.channel = req.body.channel ?? campaign.channel;
    campaign.audience = req.body.audience ?? campaign.audience;
    campaign.budget = req.body.budget !== undefined ? Number(req.body.budget) : campaign.budget;
    campaign.status = req.body.status ?? campaign.status;
    campaign.startDate = req.body.startDate ?? campaign.startDate;
    campaign.endDate = req.body.endDate ?? campaign.endDate;
    campaign.notes = req.body.notes ?? campaign.notes;

    await campaign.save();

    res.json({
      success: true,
      message: "Marketing campaign updated successfully",
      data: campaign,
    });
  } catch (error) {
    console.error("Error updating marketing campaign:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update marketing campaign",
      error: error.message,
    });
  }
};

module.exports = {
  getCampaigns,
  createCampaign,
  updateCampaign,
};