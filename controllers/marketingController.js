const MarketingCampaign = require("../models/MarketingCampaign");
const Customer = require("../models/Customer");
const CommunicationLog = require("../models/CommunicationLog");

const getJamaicaDateString = (date = new Date()) => {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Jamaica",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  return formatter.format(date);
};

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
      error: error.message,
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
      recipientMode,
      customerEkonId,
      customerEkonIds,
    } = req.body;

    if (!campaignName || !channel) {
      return res.status(400).json({
        success: false,
        message: "Campaign name and channel are required",
      });
    }

    const mode = recipientMode || "all";
    let recipients = [];

    if (mode === "single") {
      if (!customerEkonId) {
        return res.status(400).json({
          success: false,
          message: "Please select one customer",
        });
      }

      const customer = await Customer.findOne({ ekonId: customerEkonId });

      if (!customer) {
        return res.status(404).json({
          success: false,
          message: "Customer not found",
        });
      }

      recipients = [customer];
    } else if (mode === "selected") {
      if (!Array.isArray(customerEkonIds) || customerEkonIds.length === 0) {
        return res.status(400).json({
          success: false,
          message: "Please select at least one customer",
        });
      }

      recipients = await Customer.find({
        ekonId: { $in: customerEkonIds },
      });

      if (recipients.length === 0) {
        return res.status(404).json({
          success: false,
          message: "No selected customers were found",
        });
      }
    } else if (mode === "all") {
      recipients = await Customer.find();

      if (recipients.length === 0) {
        return res.status(404).json({
          success: false,
          message: "No customers found to receive this campaign",
        });
      }
    } else {
      return res.status(400).json({
        success: false,
        message: "Invalid recipient mode",
      });
    }

    const campaign = await MarketingCampaign.create({
      campaignNumber: `MKT-${Date.now()}`,
      campaignName,
      channel,
      audience:
        audience ||
        (mode === "single"
          ? "Single Customer"
          : mode === "selected"
          ? "Selected Customers"
          : "All Customers"),
      budget: Number(budget || 0),
      status: status || "Draft",
      startDate: startDate || "",
      endDate: endDate || "",
      notes: notes || "",
    });

    const today = getJamaicaDateString();
    const createdLogs = [];

    for (const customer of recipients) {
      const log = await CommunicationLog.create({
        logNumber: `COM-${Date.now()}-${customer.ekonId}-${Math.floor(Math.random() * 1000)}`,
        customerEkonId: customer.ekonId,
        customerName: customer.name,
        recipientMode: mode,
        channel,
        subject: campaignName,
        message: notes || `${campaignName} promotion from Eltham Konnect`,
        status: "Sent",
        date: today,
      });

      createdLogs.push(log);
    }

    res.status(201).json({
      success: true,
      message:
        mode === "all"
          ? `Marketing campaign created and sent to all customers (${createdLogs.length} recipients)`
          : mode === "selected"
          ? `Marketing campaign created and sent to selected customers (${createdLogs.length} recipients)`
          : "Marketing campaign created and sent successfully",
      totalRecipients: createdLogs.length,
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
    campaign.budget =
      req.body.budget !== undefined
        ? Number(req.body.budget)
        : campaign.budget;
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