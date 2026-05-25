const MarketplaceProduct = require("../models/MarketplaceProduct");
const AmazonAssociateItem = require("../models/AmazonAssociateItem");

const syncAssociateItemFromMarketplaceProduct = async (product) => {
  const associateItem = await AmazonAssociateItem.findOne({
    itemNumber: product.itemNumber,
  });

  if (!associateItem) return;

  associateItem.title = product.title;
  associateItem.description = product.description || "";
  associateItem.category = product.category || "General";
  associateItem.imageUrl = product.imageUrl || "";
  associateItem.costPrice = Number(product.costPrice || 0);
  associateItem.sellingPrice = Number(product.sellingPrice || 0);
  associateItem.quantityInStock = Number(product.quantityInStock || 0);
  associateItem.lowStockAlertLevel = Number(product.reorderLevel || 2);

  if (Number(product.quantityInStock || 0) > 0) {
    associateItem.isActive = true;
  }

  await associateItem.save();
};

const createMarketplaceProduct = async (req, res) => {
  try {
    const {
      itemNumber,
      title,
      description,
      category,
      imageUrl,
      costPrice,
      sellingPrice,
      quantityInStock,
      reorderLevel,
    } = req.body;

    const existingProduct = await MarketplaceProduct.findOne({
      itemNumber,
    });

    if (existingProduct) {
      return res.status(400).json({
        success: false,
        message: "Item number already exists",
      });
    }

    const product = await MarketplaceProduct.create({
      itemNumber,
      title,
      description,
      category,
      imageUrl,
      costPrice: Number(costPrice || 0),
      sellingPrice: Number(sellingPrice || 0),
      quantityInStock: Number(quantityInStock || 0),
      reorderLevel: Number(reorderLevel || 2),
      status:
        Number(quantityInStock || 0) <= 0
          ? "Out of Stock"
          : "Active",
    });

    res.status(201).json({
      success: true,
      message: "Marketplace product created successfully",
      data: product,
    });
  } catch (error) {
    console.error("Create marketplace product error:", error);

    res.status(500).json({
      success: false,
      message: "Could not create marketplace product",
      error: error.message,
    });
  }
};

const getMarketplaceProducts = async (req, res) => {
  try {
    const products = await MarketplaceProduct.find().sort({
      createdAt: -1,
    });

    res.json({
      success: true,
      data: products,
    });
  } catch (error) {
    console.error("Get marketplace products error:", error);

    res.status(500).json({
      success: false,
      message: "Could not load marketplace products",
    });
  }
};

const updateMarketplaceProduct = async (req, res) => {
  try {
    const { itemNumber } = req.params;

    const product = await MarketplaceProduct.findOne({
      itemNumber,
    });

    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Marketplace product not found",
      });
    }

    const allowedFields = [
      "title",
      "description",
      "category",
      "imageUrl",
      "costPrice",
      "sellingPrice",
      "quantityInStock",
      "reorderLevel",
      "status",
    ];

    allowedFields.forEach((field) => {
      if (req.body[field] !== undefined) {
        product[field] = req.body[field];
      }
    });

        if (Number(product.quantityInStock || 0) <= 0) {
      product.status = "Out of Stock";
    } else if (product.status === "Out of Stock") {
      product.status = "Active";
    }

    await product.save();

        await syncAssociateItemFromMarketplaceProduct(product);

    res.json({
      success: true,
      message: "Marketplace product updated successfully",
      data: product,
    });
  } catch (error) {
    console.error("Update marketplace product error:", error);

    res.status(500).json({
      success: false,
      message: "Could not update marketplace product",
      error: error.message,
    });
  }
};

const getLowStockProducts = async (req, res) => {
  try {
    const products = await MarketplaceProduct.find({
      $expr: {
        $lte: ["$quantityInStock", "$reorderLevel"],
      },
    }).sort({
      quantityInStock: 1,
    });

    res.json({
      success: true,
      data: products,
    });
  } catch (error) {
    console.error("Get low stock products error:", error);

    res.status(500).json({
      success: false,
      message: "Could not load low stock products",
    });
  }
};

module.exports = {
  createMarketplaceProduct,
  getMarketplaceProducts,
  updateMarketplaceProduct,
  getLowStockProducts,
};