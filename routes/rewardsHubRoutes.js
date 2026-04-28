const express = require("express");
const multer = require("multer");
const path = require("path");
const router = express.Router();

const {
  getRewardsHubPosts,
  createRewardsHubPost,
  deleteRewardsHubPost,
} = require("../controllers/rewardsHubController");

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "uploads/rewards-hub");
  },
  filename: (req, file, cb) => {
    const uniqueName = `rewards-hub-${Date.now()}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  },
});

const upload = multer({ storage });

router.get("/", getRewardsHubPosts);
router.post("/", upload.single("hubImage"), createRewardsHubPost);
router.delete("/:id", deleteRewardsHubPost);

module.exports = router;