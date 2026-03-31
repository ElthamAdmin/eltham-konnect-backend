const express = require("express");
const router = express.Router();

const {
  getEmployees,
  getEmployeeByEmployeeId,
  createEmployee,
  updateEmployee,
  updateEmployeeStatus,
  getEmployeeSummary,
} = require("../controllers/hrController");

router.get("/summary", getEmployeeSummary);
router.get("/", getEmployees);
router.get("/:employeeId", getEmployeeByEmployeeId);
router.post("/", createEmployee);
router.put("/:employeeId", updateEmployee);
router.put("/:employeeId/status", updateEmployeeStatus);

module.exports = router;