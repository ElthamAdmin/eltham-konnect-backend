const Customer = require("../models/Customer");
const CustomerInvoiceUpload = require("../models/CustomerInvoiceUpload");
const Package = require("../models/Package");
const { writeAuditLog } = require("../utils/auditLogger");

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

    if (!trackingNumber) {
      return res.status(400).json({
        success: false,
        message: "Tracking number is required",
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

    const pkg = await Package.findOne({
      trackingNumber,
      customerEkonId: customer.ekonId,
    });

    if (!pkg) {
      return res.status(404).json({
        success: false,
        message: "Package not found for this customer",
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

    pkg.customerInvoiceUploaded = true;
    pkg.customerInvoiceUploadNumber = upload.uploadNumber;
    pkg.customerInvoiceNumber = invoiceNumber || "";
    pkg.customerInvoiceFileName = req.file.filename;
    pkg.customerInvoiceFilePath = `/uploads/customer-invoices/${req.file.filename}`;
    pkg.customerInvoiceNotes = notes || "";
    pkg.customerInvoiceUploadedAt = new Date();

    await pkg.save();

    try {
      if (req.user) {
        await writeAuditLog({
          req,
          action: "CUSTOMER_INVOICE_UPLOADED",
          module: "Customer Invoices",
          description: `Customer invoice uploaded for package ${pkg.trackingNumber}`,
          targetType: "Package",
          targetId: pkg.trackingNumber,
          metadata: {
            customerEkonId: customer.ekonId,
            customerName: customer.name,
            uploadNumber: upload.uploadNumber,
            invoiceNumber: upload.invoiceNumber,
            filePath: upload.filePath,
          },
        });
      }
    } catch (auditError) {
      console.error("Audit log error while uploading customer invoice:", auditError);
    }

    res.status(201).json({
      success: true,
      message: `Invoice uploaded and connected to package ${pkg.trackingNumber} successfully`,
      data: {
        upload,
        package: pkg,
      },
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