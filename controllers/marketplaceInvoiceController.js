const MarketplaceInvoice = require("../models/MarketplaceInvoice");
const MarketplaceOrder = require("../models/MarketplaceOrder");

const createInvoiceNumber = () => `MKI-${Date.now()}`;

const generateMarketplaceInvoice = async (req, res) => {
  try {
    const { orderNumber } = req.params;
    const { deliveryFee = 0, discount = 0 } = req.body;

    const order = await MarketplaceOrder.findOne({ orderNumber });

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Marketplace order not found",
      });
    }

    const existingInvoice = await MarketplaceInvoice.findOne({ orderNumber });

    if (existingInvoice) {
      return res.status(400).json({
        success: false,
        message: "A marketplace invoice already exists for this order",
      });
    }

    const subtotal = Number(order.subtotal || 0);
    const finalTotal = Math.max(
      0,
      subtotal + Number(deliveryFee || 0) - Number(discount || 0)
    );

    const invoice = await MarketplaceInvoice.create({
      invoiceNumber: createInvoiceNumber(),
      orderNumber: order.orderNumber,
      customerKey: order.customerKey,
      customerName: order.customerName,
      customerEkonId: order.customerEkonId,
      items: order.items,
      subtotal,
      deliveryFee: Number(deliveryFee || 0),
      discount: Number(discount || 0),
      finalTotal,
      status: "Unpaid",
    });

    order.status = "Awaiting Payment";
    order.statusHistory.push({
      status: "Awaiting Payment",
      note: `Marketplace invoice ${invoice.invoiceNumber} generated`,
      updatedBy: req.user?.fullName || req.user?.name || req.user?.email || "System User",
      updatedAt: new Date(),
    });

    await order.save();

    res.status(201).json({
      success: true,
      message: "Marketplace invoice generated successfully",
      data: invoice,
    });
  } catch (error) {
    console.error("Generate marketplace invoice error:", error);
    res.status(500).json({
      success: false,
      message: "Could not generate marketplace invoice",
      error: error.message,
    });
  }
};

const getAllMarketplaceInvoices = async (req, res) => {
  try {
    const invoices = await MarketplaceInvoice.find().sort({ createdAt: -1 });

    res.json({
      success: true,
      data: invoices,
    });
  } catch (error) {
    console.error("Get marketplace invoices error:", error);
    res.status(500).json({
      success: false,
      message: "Could not load marketplace invoices",
    });
  }
};

const getMyMarketplaceInvoices = async (req, res) => {
  try {
    const customerKey =
      req.user?.ekonId ||
      req.user?.customerEkonId ||
      req.user?.id ||
      req.user?._id ||
      req.user?.email;

    const invoices = await MarketplaceInvoice.find({ customerKey }).sort({
      createdAt: -1,
    });

    res.json({
      success: true,
      data: invoices,
    });
  } catch (error) {
    console.error("Get my marketplace invoices error:", error);
    res.status(500).json({
      success: false,
      message: "Could not load your marketplace invoices",
    });
  }
};

const updateMarketplaceInvoicePaymentLink = async (req, res) => {
  try {
    const { invoiceNumber } = req.params;
    const { paymentLink } = req.body;

    const invoice = await MarketplaceInvoice.findOne({ invoiceNumber });

    if (!invoice) {
      return res.status(404).json({
        success: false,
        message: "Marketplace invoice not found",
      });
    }

    invoice.paymentLink = paymentLink || "";
    await invoice.save();

    res.json({
      success: true,
      message: "Marketplace invoice payment link updated",
      data: invoice,
    });
  } catch (error) {
    console.error("Update marketplace invoice payment link error:", error);
    res.status(500).json({
      success: false,
      message: "Could not update payment link",
    });
  }
};

const markMarketplaceInvoicePaid = async (req, res) => {
  try {
    const { invoiceNumber } = req.params;

    const invoice = await MarketplaceInvoice.findOne({ invoiceNumber });

    if (!invoice) {
      return res.status(404).json({
        success: false,
        message: "Marketplace invoice not found",
      });
    }

    invoice.status = "Paid";
    invoice.paidAt = new Date();
    await invoice.save();

    const order = await MarketplaceOrder.findOne({
      orderNumber: invoice.orderNumber,
    });

    if (order) {
      order.status = "Paid";
      order.statusHistory.push({
        status: "Paid",
        note: `Marketplace invoice ${invoice.invoiceNumber} marked as paid`,
        updatedBy: req.user?.fullName || req.user?.name || req.user?.email || "System User",
        updatedAt: new Date(),
      });

      await order.save();
    }

    res.json({
      success: true,
      message: "Marketplace invoice marked as paid",
      data: invoice,
    });
  } catch (error) {
    console.error("Mark marketplace invoice paid error:", error);
    res.status(500).json({
      success: false,
      message: "Could not mark marketplace invoice as paid",
    });
  }
};

const updateMarketplaceInvoiceCharges = async (req, res) => {
  try {
    const { invoiceNumber } = req.params;
    const { deliveryFee = 0, discount = 0 } = req.body;

    const invoice = await MarketplaceInvoice.findOne({ invoiceNumber });

    if (!invoice) {
      return res.status(404).json({
        success: false,
        message: "Marketplace invoice not found",
      });
    }

    if (invoice.status === "Paid") {
      return res.status(400).json({
        success: false,
        message: "Cannot adjust charges after invoice is paid",
      });
    }

    invoice.deliveryFee = Number(deliveryFee || 0);
    invoice.discount = Number(discount || 0);
    invoice.finalTotal = Math.max(
      0,
      Number(invoice.subtotal || 0) +
        Number(invoice.deliveryFee || 0) -
        Number(invoice.discount || 0)
    );

    await invoice.save();

    res.json({
      success: true,
      message: "Marketplace invoice charges updated",
      data: invoice,
    });
  } catch (error) {
    console.error("Update marketplace invoice charges error:", error);
    res.status(500).json({
      success: false,
      message: "Could not update marketplace invoice charges",
    });
  }
};

module.exports = {
  generateMarketplaceInvoice,
  getAllMarketplaceInvoices,
  getMyMarketplaceInvoices,
  updateMarketplaceInvoicePaymentLink,
  markMarketplaceInvoicePaid,
  updateMarketplaceInvoiceCharges,
};