const Invoice = require("../models/Invoice");

const {
  createStorageInvoice,
} = require("../services/storageBillingService");

const {
  writeAuditLog,
} = require("../utils/auditLogger");

const generateStorageInvoice = async (req, res) => {
  try {
    const result = await createStorageInvoice({
      packageId: req.params.packageId,
      user: req.user,
    });

    if (result.created) {
      await writeAuditLog({
        req,
        action: "CREATE_STORAGE_INVOICE",
        module: "Invoices",
        description:
          `Storage invoice ${result.invoice.invoiceNumber} created.`,
        targetType: "Invoice",
        targetId: result.invoice.invoiceNumber,
        metadata: {
          packageId: req.params.packageId,
          amount: result.invoice.storageFeeTotal,
          journalEntryNumber:
            result.invoice.journalEntryNumber,
          entityCode: result.invoice.entityCode,
        },
      });
    }

    return res.status(result.created ? 201 : 200).json({
      success: true,
      message: result.message,
      data: result.invoice || null,
    });
  } catch (error) {
    console.error("Storage billing error:", error.message);

    return res.status(409).json({
      success: false,
      message:
        error.code === 11000
          ? "Another request recorded these storage days. Refresh before retrying."
          : error.message ||
            "The storage invoice could not be created.",
    });
  }
};

const blockStorageInvoiceAdjustment = async (
  req,
  res,
  next
) => {
  try {
    const invoice = await Invoice.findOne({
      invoiceNumber: req.params.invoiceNumber,
    })
      .select("invoiceSource")
      .lean();

    if (invoice?.invoiceSource === "Storage") {
      return res.status(409).json({
        success: false,
        message:
          "Storage invoices cannot be changed through general charge or points adjustments.",
      });
    }

    return next();
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Could not check the invoice type.",
    });
  }
};

module.exports = {
  generateStorageInvoice,
  blockStorageInvoiceAdjustment,
};