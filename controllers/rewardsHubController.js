const RewardsHub = require("../models/RewardsHub");

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

const getRewardsHubPosts = async (req, res) => {
  try {
    const posts = await RewardsHub.find({ isActive: true }).sort({
      createdAt: -1,
    });

    res.json({
      success: true,
      message: "Rewards Hub posts retrieved successfully",
      data: posts,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to retrieve Rewards Hub posts",
      error: error.message,
    });
  }
};

const createRewardsHubPost = async (req, res) => {
  try {
    const { title, description, type, rewardText, externalLink, startDate, endDate } =
      req.body;

    if (!title || !description) {
      return res.status(400).json({
        success: false,
        message: "Title and description are required",
      });
    }

    const userDetails = getUserDetails(req);

    const post = await RewardsHub.create({
      title,
      description,
      type,
      rewardText,
      externalLink,
      startDate: startDate || null,
      endDate: endDate || null,
      imageFileName: req.file ? req.file.filename : "",
      imageFilePath: req.file ? `/uploads/rewards-hub/${req.file.filename}` : "",
      ...userDetails,
    });

    res.status(201).json({
      success: true,
      message: "Rewards Hub post created successfully",
      data: post,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to create Rewards Hub post",
      error: error.message,
    });
  }
};

const deleteRewardsHubPost = async (req, res) => {
  try {
    const { id } = req.params;

    const post = await RewardsHub.findById(id);

    if (!post) {
      return res.status(404).json({
        success: false,
        message: "Rewards Hub post not found",
      });
    }

    post.isActive = false;
    await post.save();

    res.json({
      success: true,
      message: "Rewards Hub post removed successfully",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to remove Rewards Hub post",
      error: error.message,
    });
  }
};

module.exports = {
  getRewardsHubPosts,
  createRewardsHubPost,
  deleteRewardsHubPost,
};