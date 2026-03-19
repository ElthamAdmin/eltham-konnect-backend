const express = require("express");
const router = express.Router();

const {
  getPreAlerts,
  createPreAlert,
} = require("../controllers/preAlertController");

const { protect } = require("../middleware/authMiddleware");

router.get("/", protect, getPreAlerts);
router.post("/", protect, createPreAlert);

module.exports = router;