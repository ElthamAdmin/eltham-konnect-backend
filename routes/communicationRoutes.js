const express = require("express");
const router = express.Router();

const {
  getCommunicationLogs,
  getMyCommunicationLogs,
  createCommunicationLog,
} = require("../controllers/communicationController");

const { protect } = require("../middleware/authMiddleware");

const {
  protectCustomer,
} = require("../middleware/customerAuthMiddleware");

// Customer portal: authenticated customer's communications only
router.get(
  "/my",
  protectCustomer,
  getMyCommunicationLogs
);

// EKOS staff routes
router.get(
  "/",
  protect,
  getCommunicationLogs
);

router.post(
  "/",
  protect,
  createCommunicationLog
);

module.exports = router;