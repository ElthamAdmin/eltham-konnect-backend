const PreAlert = require("../models/PreAlert");

const getPreAlerts = async (req, res) => {
  try {
    const user = req.user || {};
    let query = {};

    if (user.userType === "customer") {
      query.customerEkonId = user.ekonId;
    }

    const preAlerts = await PreAlert.find(query).sort({ createdAt: -1 });

    res.json({
      success: true,
      message: "Pre-alerts retrieved successfully",
      totalPreAlerts: preAlerts.length,
      data: preAlerts,
    });
  } catch (error) {
    console.error("Error getting pre-alerts:", error);
    res.status(500).json({
      success: false,
      message: "Failed to retrieve pre-alerts",
      error: error.message,
    });
  }
};

const createPreAlert = async (req, res) => {
  try {
    const user = req.user || {};

    if (user.userType !== "customer") {
      return res.status(403).json({
        success: false,
        message: "Customer access only",
      });
    }

    const {
      trackingNumber,
      courier,
      storeName,
      itemDescription,
      estimatedWeight,
      notes,
    } = req.body;

    if (!trackingNumber) {
      return res.status(400).json({
        success: false,
        message: "Tracking number is required",
      });
    }

    const existingPreAlert = await PreAlert.findOne({
      customerEkonId: user.ekonId,
      trackingNumber,
    });

    if (existingPreAlert) {
      return res.status(400).json({
        success: false,
        message: "A pre-alert already exists for that tracking number",
      });
    }

    const newPreAlert = await PreAlert.create({
      preAlertNumber: `PAL-${Date.now()}`,
      customerEkonId: user.ekonId,
      customerName: user.name,
      trackingNumber,
      courier: courier || "",
      storeName: storeName || "",
      itemDescription: itemDescription || "",
      estimatedWeight: Number(estimatedWeight || 0),
      notes: notes || "",
      invoiceFileName: req.file ? req.file.filename : "",
      invoiceFilePath: req.file ? `/uploads/prealerts/${req.file.filename}` : "",
      status: "Submitted",
      date: new Date().toISOString().split("T")[0],
    });

    res.status(201).json({
      success: true,
      message: "Pre-alert submitted successfully",
      data: newPreAlert,
    });
  } catch (error) {
    console.error("Error creating pre-alert:", error);
    res.status(500).json({
      success: false,
      message: "Failed to create pre-alert",
      error: error.message,
    });
  }
};

module.exports = {
  getPreAlerts,
  createPreAlert,
};