const MarketplaceOrder = require("../models/MarketplaceOrder");
const MarketplaceCart = require("../models/MarketplaceCart");
const MarketplaceProduct = require("../models/MarketplaceProduct");

const getCustomerKey = (req) =>
  req.user?.ekonId ||
  req.user?.customerEkonId ||
  req.user?.id ||
  req.user?._id ||
  req.user?.email;

const createOrderNumber = () => `MKT-${Date.now()}`;

const deductInventoryForOrder = async (order) => {
  if (order.inventoryDeducted) {
    return order;
  }

  let totalCOGS = 0;

  for (const item of order.items) {
    const product = await MarketplaceProduct.findOne({
      itemNumber: item.itemNumber,
    });

    if (!product) {
      throw new Error(`Product not found: ${item.itemNumber}`);
    }

    const quantityOrdered = Number(item.quantity || 0);

    if (Number(product.quantityInStock || 0) < quantityOrdered) {
      throw new Error(
        `Insufficient stock for ${product.title}. Available: ${product.quantityInStock}, Ordered: ${quantityOrdered}`
      );
    }

    product.quantityInStock =
      Number(product.quantityInStock || 0) - quantityOrdered;

    if (product.quantityInStock <= 0) {
      product.status = "Out of Stock";
    }

    await product.save();

    totalCOGS += Number(product.costPrice || 0) * quantityOrdered;
  }

  order.inventoryDeducted = true;
  order.inventoryDeductedAt = new Date();
  order.costOfGoodsSold = totalCOGS;
  order.grossProfit = Number(order.subtotal || 0) - totalCOGS;

  return order;
};

const submitMarketplaceOrder = async (req, res) => {
  try {
    const customerKey = getCustomerKey(req);

    if (!customerKey) {
      return res.status(401).json({
        success: false,
        message: "Customer not identified",
      });
    }

    const cart = await MarketplaceCart.findOne({ customerKey });

    if (!cart || !cart.items || cart.items.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Your cart is empty",
      });
    }

    const order = await MarketplaceOrder.create({
      orderNumber: createOrderNumber(),
      customerKey,
      customerName: req.user?.name || req.user?.fullName || "",
      customerEkonId: req.user?.ekonId || req.user?.customerEkonId || "",
      items: cart.items,
      subtotal: cart.subtotal,
      customerNote: req.body?.customerNote || "",
      status: "Pending Review",
    });

    cart.items = [];
    cart.subtotal = 0;
    await cart.save();

    res.status(201).json({
      success: true,
      message: "Marketplace order request submitted successfully",
      data: order,
    });
  } catch (error) {
    console.error("Submit marketplace order error:", error);
    res.status(500).json({
      success: false,
      message: "Could not submit marketplace order",
      error: error.message,
    });
  }
};

const getMyMarketplaceOrders = async (req, res) => {
  try {
    const customerKey = getCustomerKey(req);

    const orders = await MarketplaceOrder.find({ customerKey }).sort({
      createdAt: -1,
    });

    res.json({
      success: true,
      data: orders,
    });
  } catch (error) {
    console.error("Get my marketplace orders error:", error);
    res.status(500).json({
      success: false,
      message: "Could not load marketplace orders",
    });
  }
};

const getAllMarketplaceOrders = async (req, res) => {
  try {
    const orders = await MarketplaceOrder.find().sort({ createdAt: -1 });

    res.json({
      success: true,
      data: orders,
    });
  } catch (error) {
    console.error("Get all marketplace orders error:", error);
    res.status(500).json({
      success: false,
      message: "Could not load marketplace orders",
    });
  }
};

const updateMarketplaceOrderStatus = async (req, res) => {
  try {
    const { orderNumber } = req.params;
    const { status, note } = req.body;

    const allowedStatuses = [
      "Pending Review",
      "Approved",
      "Awaiting Payment",
      "Paid",
      "Preparing",
      "Ready For Pickup",
      "Out For Delivery",
      "Completed",
      "Cancelled",
    ];

    if (!allowedStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Invalid marketplace order status",
      });
    }

    const order = await MarketplaceOrder.findOne({ orderNumber });

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Marketplace order not found",
      });
    }

    if (status === "Paid" && !order.inventoryDeducted) {
  await deductInventoryForOrder(order);
}

order.status = status;

    order.statusHistory.push({
      status,
      note: note || "",
      updatedBy: req.user?.fullName || req.user?.name || req.user?.email || "System User",
      updatedAt: new Date(),
    });

    await order.save();

    res.json({
      success: true,
      message: "Marketplace order status updated",
      data: order,
    });
  } catch (error) {
    console.error("Update marketplace order error:", error);
    res.status(500).json({
      success: false,
      message: "Could not update marketplace order",
    });
  }
};

module.exports = {
  submitMarketplaceOrder,
  getMyMarketplaceOrders,
  getAllMarketplaceOrders,
  updateMarketplaceOrderStatus,
};