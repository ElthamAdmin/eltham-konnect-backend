const Setting = require("../models/Setting");
const CompanyDocument = require("../models/CompanyDocument");

const getSettings = async (req, res) => {
  try {
    let settings = await Setting.findOne({ settingKey: "main" });

    if (!settings) {
      settings = await Setting.create({
        settingKey: "main",
        companyName: "Eltham Konnect",
        defaultCurrency: "JMD",
        branches: ["Eltham Park", "Browns Town Square"],
        rewards: {
          atWarehousePoints: 100,
          minimumRedeemPoints: 500,
          inactivityExpiryMonths: 4,
          pointsCap: 1500,
        },
        invoice: {
          defaultStatus: "Unpaid",
          defaultPaymentTerms: "Due on Receipt",
        },
        communication: {
          defaultChannel: "Email",
          supportEmail: "",
          notificationsEnabled: true,
        },
        branding: {
          primaryLogoName: "",
          primaryLogoPath: "",
          invoiceLogoName: "",
          invoiceLogoPath: "",
        },
      });
    }

    res.json({
      success: true,
      message: "Settings retrieved successfully",
      data: settings,
    });
  } catch (error) {
    console.error("Error getting settings:", error);
    res.status(500).json({
      success: false,
      message: "Failed to retrieve settings",
    });
  }
};

const updateSettings = async (req, res) => {
  try {
    const updateData = req.body;

    const settings = await Setting.findOneAndUpdate(
      { settingKey: "main" },
      updateData,
      {
        new: true,
        upsert: true,
        runValidators: true,
      }
    );

    res.json({
      success: true,
      message: "Settings updated successfully",
      data: settings,
    });
  } catch (error) {
    console.error("Error updating settings:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update settings",
      error: error.message,
    });
  }
};

const uploadPrimaryLogo = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "No logo file uploaded",
      });
    }

    const logoPath = `/uploads/logos/${req.file.filename}`;

    const settings = await Setting.findOneAndUpdate(
      { settingKey: "main" },
      {
        $set: {
          "branding.primaryLogoName": req.file.originalname,
          "branding.primaryLogoPath": logoPath,
        },
      },
      { new: true, upsert: true }
    );

    res.json({
      success: true,
      message: "Primary logo uploaded successfully",
      data: settings,
    });
  } catch (error) {
    console.error("Error uploading primary logo:", error);
    res.status(500).json({
      success: false,
      message: "Failed to upload primary logo",
    });
  }
};

const uploadInvoiceLogo = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "No invoice logo file uploaded",
      });
    }

    const logoPath = `/uploads/logos/${req.file.filename}`;

    const settings = await Setting.findOneAndUpdate(
      { settingKey: "main" },
      {
        $set: {
          "branding.invoiceLogoName": req.file.originalname,
          "branding.invoiceLogoPath": logoPath,
        },
      },
      { new: true, upsert: true }
    );

    res.json({
      success: true,
      message: "Invoice logo uploaded successfully",
      data: settings,
    });
  } catch (error) {
    console.error("Error uploading invoice logo:", error);
    res.status(500).json({
      success: false,
      message: "Failed to upload invoice logo",
    });
  }
};

const getCompanyDocuments = async (req, res) => {
  try {
    const documents = await CompanyDocument.find().sort({ createdAt: -1 });

    res.json({
      success: true,
      message: "Company documents retrieved successfully",
      totalDocuments: documents.length,
      data: documents,
    });
  } catch (error) {
    console.error("Error getting company documents:", error);
    res.status(500).json({
      success: false,
      message: "Failed to retrieve company documents",
    });
  }
};

const uploadCompanyDocument = async (req, res) => {
  try {
    const { title, category, status } = req.body;

    if (!title || !category) {
      return res.status(400).json({
        success: false,
        message: "Title and category are required",
      });
    }

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "No PDF document uploaded",
      });
    }

    const document = await CompanyDocument.create({
      documentNumber: `DOC-${Date.now()}`,
      title,
      category,
      fileName: req.file.originalname,
      filePath: `/uploads/documents/${req.file.filename}`,
      fileType: req.file.mimetype,
      status: status || "Active",
    });

    res.status(201).json({
      success: true,
      message: "Company document uploaded successfully",
      data: document,
    });
  } catch (error) {
    console.error("Error uploading company document:", error);
    res.status(500).json({
      success: false,
      message: "Failed to upload company document",
      error: error.message,
    });
  }
};

module.exports = {
  getSettings,
  updateSettings,
  uploadPrimaryLogo,
  uploadInvoiceLogo,
  getCompanyDocuments,
  uploadCompanyDocument,
};