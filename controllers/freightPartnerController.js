const crypto = require("crypto");
const FreightPartner = require("../models/FreightPartner");
const { writeAuditLog } = require("../utils/auditLogger");

const generateApiKey = () => {
  return `EKOS-${crypto.randomBytes(24).toString("hex").toUpperCase()}`;
};

const getFreightPartners = async (req, res) => {
  try {
    const partners = await FreightPartner.find().sort({ createdAt: -1 });

    res.json({
      success: true,
      message: "Freight partners retrieved successfully",
      data: partners,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Could not load freight partners",
      error: error.message,
    });
  }
};

const createFreightPartner = async (req, res) => {
  try {
    const {
      partnerName,
      contactPerson,
      contactEmail,
      contactPhone,
      notes,
    } = req.body;

    if (!partnerName) {
      return res.status(400).json({
        success: false,
        message: "Partner name is required.",
      });
    }

    const partner = await FreightPartner.create({
      partnerNumber: `FP-${Date.now()}`,
      partnerName,
      apiKey: generateApiKey(),
      contactPerson,
      contactEmail,
      contactPhone,
      notes,
      status: "Active",
    });

    await writeAuditLog({
      req,
      action: "CREATE_FREIGHT_PARTNER",
      module: "Integrations",
      description: `Freight partner ${partner.partnerName} was created`,
      targetType: "FreightPartner",
      targetId: partner.partnerNumber,
      metadata: {
        partnerName: partner.partnerName,
        contactEmail: partner.contactEmail,
      },
    });

    res.status(201).json({
      success: true,
      message: "Freight partner created successfully.",
      data: partner,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Could not create freight partner.",
      error: error.message,
    });
  }
};

const updateFreightPartner = async (req, res) => {
  try {
    const { partnerNumber } = req.params;

    const partner = await FreightPartner.findOneAndUpdate(
      { partnerNumber },
      { $set: req.body },
      { new: true }
    );

    if (!partner) {
      return res.status(404).json({
        success: false,
        message: "Freight partner not found.",
      });
    }

    await writeAuditLog({
      req,
      action: "UPDATE_FREIGHT_PARTNER",
      module: "Integrations",
      description: `Freight partner ${partner.partnerName} was updated`,
      targetType: "FreightPartner",
      targetId: partner.partnerNumber,
      metadata: req.body,
    });

    res.json({
      success: true,
      message: "Freight partner updated successfully.",
      data: partner,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Could not update freight partner.",
      error: error.message,
    });
  }
};

const rotateFreightPartnerApiKey = async (req, res) => {
  try {
    const { partnerNumber } = req.params;

    const partner = await FreightPartner.findOne({ partnerNumber });

    if (!partner) {
      return res.status(404).json({
        success: false,
        message: "Freight partner not found.",
      });
    }

    partner.apiKey = generateApiKey();
    await partner.save();

    await writeAuditLog({
      req,
      action: "ROTATE_FREIGHT_PARTNER_API_KEY",
      module: "Integrations",
      description: `API key rotated for ${partner.partnerName}`,
      targetType: "FreightPartner",
      targetId: partner.partnerNumber,
    });

    res.json({
      success: true,
      message: "API key rotated successfully.",
      data: partner,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Could not rotate API key.",
      error: error.message,
    });
  }
};

module.exports = {
  getFreightPartners,
  createFreightPartner,
  updateFreightPartner,
  rotateFreightPartnerApiKey,
};