const MarketplaceCart = require("../models/MarketplaceCart");
const AmazonAssociateItem = require("../models/AmazonAssociateItem");

const getCustomerKey = (req) =>
  req.user?.ekonId ||
  req.user?.customerEkonId ||
  req.user?.id ||
  req.user?._id ||
  req.user?.email;

const recalcCart = (cart) => {
  cart.items = cart.items.map((item) => {
    item.lineTotal = Number(item.sellingPrice || 0) * Number(item.quantity || 0);
    return item;
  });

  cart.subtotal = cart.items.reduce(
    (sum, item) => sum + Number(item.lineTotal || 0),
    0
  );

  return cart;
};

const getMyCart = async (req, res) => {
  try {
    const customerKey = getCustomerKey(req);

    if (!customerKey) {
      return res.status(401).json({ success: false, message: "Customer not identified" });
    }

    let cart = await MarketplaceCart.findOne({ customerKey });

    if (!cart) {
      cart = await MarketplaceCart.create({ customerKey, items: [], subtotal: 0 });
    }

    res.json({ success: true, data: cart });
  } catch (error) {
    console.error("Get cart error:", error);
    res.status(500).json({ success: false, message: "Could not load cart" });
  }
};

const addToCart = async (req, res) => {
  try {
    const customerKey = getCustomerKey(req);
    const { itemNumber, quantity = 1 } = req.body;

    if (!customerKey) {
      return res.status(401).json({ success: false, message: "Customer not identified" });
    }

    const product = await AmazonAssociateItem.findOne({
      itemNumber,
      isActive: true,
      productType: "EK Inventory",
    });

    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not available for cart purchase",
      });
    }

    if (Number(product.quantityInStock || 0) <= 0) {
      return res.status(400).json({
        success: false,
        message: "This item is out of stock",
      });
    }

    let cart = await MarketplaceCart.findOne({ customerKey });

    if (!cart) {
      cart = await MarketplaceCart.create({ customerKey, items: [], subtotal: 0 });
    }

    const qtyToAdd = Math.max(1, Number(quantity || 1));
    const existingItem = cart.items.find((item) => item.itemNumber === itemNumber);

    const currentQty = existingItem ? Number(existingItem.quantity || 0) : 0;
    const newQty = currentQty + qtyToAdd;

    if (newQty > Number(product.quantityInStock || 0)) {
      return res.status(400).json({
        success: false,
        message: `Only ${product.quantityInStock} in stock`,
      });
    }

    if (existingItem) {
      existingItem.quantity = newQty;
    } else {
      cart.items.push({
        itemNumber: product.itemNumber,
        title: product.title,
        imageUrl: product.imageUrl,
        category: product.category,
        sellingPrice: Number(product.sellingPrice || 0),
        quantity: qtyToAdd,
        lineTotal: Number(product.sellingPrice || 0) * qtyToAdd,
      });
    }

    recalcCart(cart);
    await cart.save();

    res.json({ success: true, message: "Item added to cart", data: cart });
  } catch (error) {
    console.error("Add cart error:", error);
    res.status(500).json({ success: false, message: "Could not add item to cart" });
  }
};

const updateCartItem = async (req, res) => {
  try {
    const customerKey = getCustomerKey(req);
    const { itemNumber } = req.params;
    const { quantity } = req.body;

    const cart = await MarketplaceCart.findOne({ customerKey });

    if (!cart) {
      return res.status(404).json({ success: false, message: "Cart not found" });
    }

    const item = cart.items.find((cartItem) => cartItem.itemNumber === itemNumber);

    if (!item) {
      return res.status(404).json({ success: false, message: "Item not found in cart" });
    }

    const product = await AmazonAssociateItem.findOne({ itemNumber });

    if (!product) {
      return res.status(404).json({ success: false, message: "Product not found" });
    }

    const newQty = Math.max(1, Number(quantity || 1));

    if (newQty > Number(product.quantityInStock || 0)) {
      return res.status(400).json({
        success: false,
        message: `Only ${product.quantityInStock} in stock`,
      });
    }

    item.quantity = newQty;
    recalcCart(cart);
    await cart.save();

    res.json({ success: true, message: "Cart updated", data: cart });
  } catch (error) {
    console.error("Update cart error:", error);
    res.status(500).json({ success: false, message: "Could not update cart" });
  }
};

const removeCartItem = async (req, res) => {
  try {
    const customerKey = getCustomerKey(req);
    const { itemNumber } = req.params;

    const cart = await MarketplaceCart.findOne({ customerKey });

    if (!cart) {
      return res.status(404).json({ success: false, message: "Cart not found" });
    }

    cart.items = cart.items.filter((item) => item.itemNumber !== itemNumber);
    recalcCart(cart);
    await cart.save();

    res.json({ success: true, message: "Item removed", data: cart });
  } catch (error) {
    console.error("Remove cart item error:", error);
    res.status(500).json({ success: false, message: "Could not remove item" });
  }
};

const clearCart = async (req, res) => {
  try {
    const customerKey = getCustomerKey(req);

    const cart = await MarketplaceCart.findOneAndUpdate(
      { customerKey },
      { items: [], subtotal: 0 },
      { new: true, upsert: true }
    );

    res.json({ success: true, message: "Cart cleared", data: cart });
  } catch (error) {
    console.error("Clear cart error:", error);
    res.status(500).json({ success: false, message: "Could not clear cart" });
  }
};

module.exports = {
  getMyCart,
  addToCart,
  updateCartItem,
  removeCartItem,
  clearCart,
};