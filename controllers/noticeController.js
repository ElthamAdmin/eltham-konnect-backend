const Notice = require("../models/Notice");

const getUserDetails = (req) => {
  const user = req.user || req.admin || req.systemUser || {};

  return {
    postedByName:
      user.fullName ||
      user.name ||
      user.username ||
      user.email ||
      req.body.postedByName ||
      "System User",
    postedByRole: user.role || req.body.postedByRole || "",
  };
};

const getNotices = async (req, res) => {
  try {
    const notices = await Notice.find({ isActive: true }).sort({
      createdAt: -1,
    });

    res.json({
      success: true,
      message: "Notices retrieved successfully",
      data: notices,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to retrieve notices",
      error: error.message,
    });
  }
};

const createNotice = async (req, res) => {
  try {
   const {
  title,
  message,
  category,
  priority,
  dueDate,
  noticeType,
  signatureName,
  signatureTitle,
  stampText,
} = req.body;

    if (!title || !message) {
      return res.status(400).json({
        success: false,
        message: "Title and message are required",
      });
    }

    const userDetails = getUserDetails(req);

    const notice = await Notice.create({
  title,
  message,
  category,
  priority,
  dueDate: dueDate || null,

  noticeType: noticeType || "Notice",
  signatureName: signatureName || userDetails.postedByName,
  signatureTitle: signatureTitle || userDetails.postedByRole,
  stampText: stampText || "Eltham Konnect",

  imageFileName: req.file ? req.file.filename : "",
  imageFilePath: req.file ? `/uploads/notice-board/${req.file.filename}` : "",

  ...userDetails,
});

    res.status(201).json({
      success: true,
      message: "Notice created successfully",
      data: notice,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to create notice",
      error: error.message,
    });
  }
};

const deleteNotice = async (req, res) => {
  try {
    const { id } = req.params;

    const notice = await Notice.findById(id);

    if (!notice) {
      return res.status(404).json({
        success: false,
        message: "Notice not found",
      });
    }

    notice.isActive = false;
    await notice.save();

    res.json({
      success: true,
      message: "Notice removed successfully",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to remove notice",
      error: error.message,
    });
  }
};

module.exports = {
  getNotices,
  createNotice,
  deleteNotice,
};