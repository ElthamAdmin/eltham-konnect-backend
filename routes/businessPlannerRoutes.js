const express = require("express");
const {
  getBusinessPlannerItems,
  createBusinessPlannerItem,
  updateBusinessPlannerItem,
  deleteBusinessPlannerItem,
} = require("../controllers/businessPlannerController");

const router = express.Router();

router.get("/", getBusinessPlannerItems);
router.post("/", createBusinessPlannerItem);
router.put("/:id", updateBusinessPlannerItem);
router.delete("/:id", deleteBusinessPlannerItem);

module.exports = router;