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
  getAttendanceHistoryAdmin,
  updatePresence,
presencePing,
logoutUser,
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
router.get("/attendance-history", protect, getAttendanceHistoryAdmin);
router.post("/presence", protect, updatePresence);
router.post("/presence-ping", protect, presencePing);
router.post("/logout", protect, logoutUser);

module.exports = router;