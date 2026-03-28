const express = require("express");
const router = express.Router();

const {
  getCustomers,
  createCustomer,
  updateCustomer,
  resetCustomerPassword,
  getPointsHistory,
  expireInactivePoints,
} = require("../controllers/customerController");

router.get("/", getCustomers);
router.post("/", createCustomer);
router.put("/:ekonId", updateCustomer);
router.put("/:ekonId/reset-password", resetCustomerPassword);
router.get("/points-history", getPointsHistory);
router.post("/expire-inactive-points", expireInactivePoints);

module.exports = router;