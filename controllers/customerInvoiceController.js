const Customer = require("../models/Customer");
const CustomerInvoiceUpload = require("../models/CustomerInvoiceUpload");

const getMyInvoiceUploads = async (req, res) => {
  try {
    const { ekonId, userType } = req.user || {};

    if (userType !== "customer") {
      return res.status(403).json({
        success: false,
        message: "Customer access only",
      });
    }

    const uploads = await CustomerInvoiceUpload.find({ customerEkonId: ekonId })
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      message: "Invoice uploads retrieved successfully",
      data: uploads,
    });
  } catch (error) {
    console.error("Error retrieving customer invoice uploads:", error);
    res.status(500).json({
      success: false,
      message: "Could not retrieve invoice uploads",
      error: error.message,
    });
  }
};

const uploadCustomerInvoice = async (req, res) => {
  try {
    const { ekonId, userType } = req.user || {};
    const { trackingNumber, invoiceNumber, notes } = req.body;

    if (userType !== "customer") {
      return res.status(403).json({
        success: false,
        message: "Customer access only",
      });
    }

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "Invoice file is required",
      });
    }

    const customer = await Customer.findOne({ ekonId });

    if (!customer) {
      return res.status(404).json({
        success: false,
        message: "Customer not found",
      });
    }

    const upload = await CustomerInvoiceUpload.create({
      uploadNumber: `CIU-${Date.now()}`,
      customerEkonId: customer.ekonId,
      customerName: customer.name,
      trackingNumber: trackingNumber || "",
      invoiceNumber: invoiceNumber || "",
      fileName: req.file.filename,
      filePath: `/uploads/customer-invoices/${req.file.filename}`,
      notes: notes || "",
      status: "Uploaded",
    });

    res.status(201).json({
      success: true,
      message: "Invoice uploaded successfully",
      data: upload,
    });
  } catch (error) {
    console.error("Error uploading customer invoice:", error);
    res.status(500).json({
      success: false,
      message: "Could not upload invoice",
      error: error.message,
    });
  }
};

module.exports = {
  getMyInvoiceUploads,
  uploadCustomerInvoice,
};