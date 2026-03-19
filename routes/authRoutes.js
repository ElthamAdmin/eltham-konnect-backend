const express = require("express");
const router = express.Router();

const {
  loginUser,
  clockIn,
  lunchOut,
  lunchIn,
  clockOut,
  forceClockOutStaff,
  getMyAttendanceToday,
  getTodayAttendanceAdmin,
} = require("../controllers/authController");

const { protect } = require("../middleware/authMiddleware");

router.post("/login", loginUser);
router.post("/clock-in", protect, clockIn);
router.post("/lunch-out", protect, lunchOut);
router.post("/lunch-in", protect, lunchIn);
router.post("/clock-out", protect, clockOut);
router.post("/force-clock-out/:userId", protect, forceClockOutStaff);
router.get("/me/attendance-today", protect, getMyAttendanceToday);
router.get("/attendance-today", protect, getTodayAttendanceAdmin);

module.exports = router;