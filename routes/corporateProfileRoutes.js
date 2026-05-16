const express = require("express");
const router = express.Router();

const { protect } = require("../middleware/authMiddleware");

const {
  getCorporateProfile,
  updateCorporateProfile,
} = require("../controllers/corporateProfileController");

router.get("/", protect, getCorporateProfile);

router.put("/", protect, updateCorporateProfile);

module.exports = router;