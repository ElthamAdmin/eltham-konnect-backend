const express = require("express");
const router = express.Router();

const { protect, requirePermission } = require("../middleware/authMiddleware");

const {
  getIntegrationLogs,
} = require("../controllers/integrationLogController");

router.get("/", protect, requirePermission("users"), getIntegrationLogs);

module.exports = router;