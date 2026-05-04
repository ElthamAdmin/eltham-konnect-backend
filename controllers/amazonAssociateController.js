const AmazonAssociateItem = require("../models/AmazonAssociateItem");
const cloudinary = require("cloudinary").v2;

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const createItemNumber = () => `ASI-${Date.now()}`;

const normalizeString = (value) => String(value || "").trim();

const uploadToCloudinary = (fileBuffer) => {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: "eltham-konnect/amazon-associate",
        resource_type: "image",
      },
      (error, result) => {
        if (error) return reject(error);
        resolve(result);
      }
    );

    stream.end(fileBuffer);
  });
};

const deleteFromCloudinary = async (publicId) => {
  if (!publicId) return;
  try {
    await cloudinary.uploader.destroy(publicId);
  } catch (error) {
    console.error("Cloudinary delete failed:", error.message);
  }
};

const getAllAssociateItems = async (req, res) => {
  try {
    const items = await AmazonAssociateItem.find().sort({
      sortOrder: 1,
      createdAt: -1,
    });

    res.json({
      success: true,
      message: "Amazon associate items retrieved successfully",
      data: items,
    });
  } catch (error) {
    console.error("Error getting Amazon associate items:", error);
    res.status(500).json({
      success: false,
      message: "Failed to retrieve Amazon associate items",
      error: error.message,
    });
  }
};

const getActiveAssociateItems = async (req, res) => {
  try {
    const items = await AmazonAssociateItem.find({ isActive: true }).sort({
      sortOrder: 1,
      createdAt: -1,
    });

    res.json({
      success: true,
      message: "Active Amazon associate items retrieved successfully",
      data: items,
    });
  } catch (error) {
    console.error("Error getting active Amazon associate items:", error);
    res.status(500).json({
      success: false,
      message: "Failed to retrieve active Amazon associate items",
      error: error.message,
    });
  }
};

const createAssociateItem = async (req, res) => {
  try {
    const { title, description, affiliateLink, buttonText, sortOrder, isActive } =
      req.body;

    if (!title || !affiliateLink) {
      return res.status(400).json({
        success: false,
        message: "Title and affiliate link are required",
      });
    }

    let imageUrl = "";
    let imagePublicId = "";

    if (req.file) {
      const uploadResult = await uploadToCloudinary(req.file.buffer);
      imageUrl = uploadResult.secure_url;
      imagePublicId = uploadResult.public_id;
    }

    const item = await AmazonAssociateItem.create({
      itemNumber: createItemNumber(),
      title: normalizeString(title),
      description: normalizeString(description),
      imageUrl,
      imagePublicId,
      affiliateLink: normalizeString(affiliateLink),
      buttonText: normalizeString(buttonText) || "Shop on Amazon",
      sortOrder: Number(sortOrder || 0),
      isActive: isActive === false || isActive === "false" ? false : true,
    });

    res.status(201).json({
      success: true,
      message: "Amazon associate item created successfully",
      data: item,
    });
  } catch (error) {
    console.error("Error creating Amazon associate item:", error);
    res.status(500).json({
      success: false,
      message: "Failed to create Amazon associate item",
      error: error.message,
    });
  }
};

const updateAssociateItem = async (req, res) => {
  try {
    const { itemNumber } = req.params;
    const { title, description, affiliateLink, buttonText, sortOrder, isActive } =
      req.body;

    const item = await AmazonAssociateItem.findOne({ itemNumber });

    if (!item) {
      return res.status(404).json({
        success: false,
        message: "Amazon associate item not found",
      });
    }

    if (title !== undefined) item.title = normalizeString(title);
    if (description !== undefined) item.description = normalizeString(description);
    if (affiliateLink !== undefined)
      item.affiliateLink = normalizeString(affiliateLink);
    if (buttonText !== undefined)
      item.buttonText = normalizeString(buttonText) || "Shop on Amazon";
    if (sortOrder !== undefined) item.sortOrder = Number(sortOrder || 0);
    if (isActive !== undefined) {
      item.isActive = isActive === true || isActive === "true";
    }

    if (req.file) {
      await deleteFromCloudinary(item.imagePublicId);

      const uploadResult = await uploadToCloudinary(req.file.buffer);
      item.imageUrl = uploadResult.secure_url;
      item.imagePublicId = uploadResult.public_id;
    }

    await item.save();

    res.json({
      success: true,
      message: "Amazon associate item updated successfully",
      data: item,
    });
  } catch (error) {
    console.error("Error updating Amazon associate item:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update Amazon associate item",
      error: error.message,
    });
  }
};

const deleteAssociateItem = async (req, res) => {
  try {
    const { itemNumber } = req.params;

    const item = await AmazonAssociateItem.findOne({ itemNumber });

    if (!item) {
      return res.status(404).json({
        success: false,
        message: "Amazon associate item not found",
      });
    }

    await deleteFromCloudinary(item.imagePublicId);
    await AmazonAssociateItem.deleteOne({ itemNumber });

    res.json({
      success: true,
      message: "Amazon associate item deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting Amazon associate item:", error);
    res.status(500).json({
      success: false,
      message: "Failed to delete Amazon associate item",
      error: error.message,
    });
  }
};

module.exports = {
  getAllAssociateItems,
  getActiveAssociateItems,
  createAssociateItem,
  updateAssociateItem,
  deleteAssociateItem,
};