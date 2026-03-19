const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const SystemUser = require("../models/SystemUser");
const AttendanceLog = require("../models/AttendanceLog");

const getTodayDateString = () => {
  return new Date().toISOString().split("T")[0];
};

const calculateWorkedMinutes = (clockInTime, clockOutTime, lunchMinutes = 0) => {
  if (!clockInTime || !clockOutTime) return 0;

  const totalMinutes = Math.floor(
    (new Date(clockOutTime).getTime() - new Date(clockInTime).getTime()) / 60000
  );

  return Math.max(totalMinutes - Number(lunchMinutes || 0), 0);
};

const loginUser = async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await SystemUser.findOne({ email });

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password",
      });
    }

    if (user.status !== "Active") {
      return res.status(403).json({
        success: false,
        message: "This user account is inactive",
      });
    }

    const passwordMatches = await bcrypt.compare(password, user.passwordHash);

    if (!passwordMatches) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password",
      });
    }

    user.lastLoginAt = new Date();
    await user.save();

    const token = jwt.sign(
      {
        userId: user.userId,
        email: user.email,
        role: user.role,
        fullName: user.fullName,
      },
      process.env.JWT_SECRET || "eltham-konnect-secret",
      { expiresIn: "12h" }
    );

    res.json({
      success: true,
      message: "Login successful",
      token,
      data: {
        userId: user.userId,
        fullName: user.fullName,
        email: user.email,
        role: user.role,
        branch: user.branch,
        status: user.status,
        dutyStatus: user.dutyStatus,
        permissions: user.permissions,
      },
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({
      success: false,
      message: "Login failed",
      error: error.message,
    });
  }
};

const clockIn = async (req, res) => {
  try {
    const { userId } = req.user;

    const user = await SystemUser.findOne({ userId });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "System user not found",
      });
    }

    const workDate = getTodayDateString();

    let attendance = await AttendanceLog.findOne({
      userId: user.userId,
      workDate,
    });

    if (attendance && attendance.sessionStatus !== "Completed") {
      return res.status(400).json({
        success: false,
        message: "User is already clocked in for today",
      });
    }

    attendance = await AttendanceLog.create({
      attendanceNumber: `ATT-${Date.now()}`,
      userId: user.userId,
      fullName: user.fullName,
      role: user.role,
      workDate,
      clockInTime: new Date(),
      sessionStatus: "On Duty",
      lunchMinutes: 0,
      workedMinutes: 0,
    });

    user.dutyStatus = "On Duty";
    await user.save();

    res.json({
      success: true,
      message: "Clock in recorded successfully",
      data: attendance,
    });
  } catch (error) {
    console.error("Clock in error:", error);
    res.status(500).json({
      success: false,
      message: "Clock in failed",
      error: error.message,
    });
  }
};

const lunchOut = async (req, res) => {
  try {
    const { userId } = req.user;
    const workDate = getTodayDateString();

    const user = await SystemUser.findOne({ userId });
    const attendance = await AttendanceLog.findOne({ userId, workDate });

    if (!user || !attendance) {
      return res.status(404).json({
        success: false,
        message: "Attendance record not found for today",
      });
    }

    if (attendance.sessionStatus !== "On Duty") {
      return res.status(400).json({
        success: false,
        message: "User must be on duty before going to lunch",
      });
    }

    attendance.lunchOutTime = new Date();
    attendance.sessionStatus = "At Lunch";
    await attendance.save();

    user.dutyStatus = "At Lunch";
    await user.save();

    res.json({
      success: true,
      message: "Lunch out recorded successfully",
      data: attendance,
    });
  } catch (error) {
    console.error("Lunch out error:", error);
    res.status(500).json({
      success: false,
      message: "Lunch out failed",
      error: error.message,
    });
  }
};

const lunchIn = async (req, res) => {
  try {
    const { userId } = req.user;
    const workDate = getTodayDateString();

    const user = await SystemUser.findOne({ userId });
    const attendance = await AttendanceLog.findOne({ userId, workDate });

    if (!user || !attendance) {
      return res.status(404).json({
        success: false,
        message: "Attendance record not found for today",
      });
    }

    if (attendance.sessionStatus !== "At Lunch" || !attendance.lunchOutTime) {
      return res.status(400).json({
        success: false,
        message: "User is not currently out at lunch",
      });
    }

    attendance.lunchInTime = new Date();

    const lunchMinutes = Math.floor(
      (new Date(attendance.lunchInTime).getTime() -
        new Date(attendance.lunchOutTime).getTime()) /
        60000
    );

    attendance.lunchMinutes =
      Number(attendance.lunchMinutes || 0) + Math.max(lunchMinutes, 0);
    attendance.sessionStatus = "On Duty";
    await attendance.save();

    user.dutyStatus = "On Duty";
    await user.save();

    res.json({
      success: true,
      message: "Lunch return recorded successfully",
      data: attendance,
    });
  } catch (error) {
    console.error("Lunch in error:", error);
    res.status(500).json({
      success: false,
      message: "Lunch return failed",
      error: error.message,
    });
  }
};

const clockOut = async (req, res) => {
  try {
    const { userId } = req.user;
    const workDate = getTodayDateString();

    const user = await SystemUser.findOne({ userId });
    const attendance = await AttendanceLog.findOne({ userId, workDate });

    if (!user || !attendance) {
      return res.status(404).json({
        success: false,
        message: "Attendance record not found for today",
      });
    }

    if (attendance.sessionStatus === "Completed") {
      return res.status(400).json({
        success: false,
        message: "User has already clocked out for today",
      });
    }

    if (
      attendance.sessionStatus === "At Lunch" &&
      attendance.lunchOutTime &&
      !attendance.lunchInTime
    ) {
      const lunchEnd = new Date();
      const extraLunchMinutes = Math.floor(
        (lunchEnd.getTime() - new Date(attendance.lunchOutTime).getTime()) / 60000
      );
      attendance.lunchMinutes =
        Number(attendance.lunchMinutes || 0) + Math.max(extraLunchMinutes, 0);
      attendance.lunchInTime = lunchEnd;
    }

    attendance.clockOutTime = new Date();
    attendance.workedMinutes = calculateWorkedMinutes(
      attendance.clockInTime,
      attendance.clockOutTime,
      attendance.lunchMinutes
    );
    attendance.sessionStatus = "Completed";
    await attendance.save();

    user.dutyStatus = "Off Duty";
    user.lastLogoutAt = new Date();
    await user.save();

    res.json({
      success: true,
      message: "Clock out recorded successfully",
      data: attendance,
    });
  } catch (error) {
    console.error("Clock out error:", error);
    res.status(500).json({
      success: false,
      message: "Clock out failed",
      error: error.message,
    });
  }
};

const forceClockOutStaff = async (req, res) => {
  try {
    if (req.user?.role !== "Admin") {
      return res.status(403).json({
        success: false,
        message: "Only admin can force clock out staff",
      });
    }

    const { userId } = req.params;
    const workDate = getTodayDateString();

    const user = await SystemUser.findOne({ userId });
    const attendance = await AttendanceLog.findOne({ userId, workDate });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "System user not found",
      });
    }

    if (!attendance) {
      user.dutyStatus = "Off Duty";
      user.lastLogoutAt = new Date();
      await user.save();

      return res.json({
        success: true,
        message: "No attendance record found today. User duty status was reset to Off Duty.",
        data: {
          user,
          attendance: null,
        },
      });
    }

    if (attendance.sessionStatus !== "Completed") {
      if (
        attendance.sessionStatus === "At Lunch" &&
        attendance.lunchOutTime &&
        !attendance.lunchInTime
      ) {
        const lunchEnd = new Date();
        const extraLunchMinutes = Math.floor(
          (lunchEnd.getTime() - new Date(attendance.lunchOutTime).getTime()) / 60000
        );

        attendance.lunchMinutes =
          Number(attendance.lunchMinutes || 0) + Math.max(extraLunchMinutes, 0);
        attendance.lunchInTime = lunchEnd;
      }

      if (!attendance.clockOutTime) {
        attendance.clockOutTime = new Date();
      }

      attendance.workedMinutes = calculateWorkedMinutes(
        attendance.clockInTime,
        attendance.clockOutTime,
        attendance.lunchMinutes
      );
      attendance.sessionStatus = "Completed";
      await attendance.save();
    }

    user.dutyStatus = "Off Duty";
    user.lastLogoutAt = new Date();
    await user.save();

    res.json({
      success: true,
      message: `${user.fullName} was clocked out successfully by admin.`,
      data: attendance,
    });
  } catch (error) {
    console.error("Force clock out error:", error);
    res.status(500).json({
      success: false,
      message: "Force clock out failed",
      error: error.message,
    });
  }
};

const getMyAttendanceToday = async (req, res) => {
  try {
    const { userId } = req.user;
    const workDate = getTodayDateString();

    const attendance = await AttendanceLog.findOne({ userId, workDate });
    const user = await SystemUser.findOne({ userId }).select("-passwordHash");

    res.json({
      success: true,
      message: "Attendance retrieved successfully",
      data: {
        user,
        attendance,
      },
    });
  } catch (error) {
    console.error("Get my attendance error:", error);
    res.status(500).json({
      success: false,
      message: "Could not retrieve attendance",
      error: error.message,
    });
  }
};

const getTodayAttendanceAdmin = async (req, res) => {
  try {
    const workDate = getTodayDateString();

    const attendance = await AttendanceLog.find({ workDate }).sort({ createdAt: -1 });
    const activeUsers = await SystemUser.find()
      .select("-passwordHash")
      .sort({ fullName: 1 });

    res.json({
      success: true,
      message: "Today's attendance retrieved successfully",
      data: {
        workDate,
        attendance,
        users: activeUsers,
      },
    });
  } catch (error) {
    console.error("Admin attendance error:", error);
    res.status(500).json({
      success: false,
      message: "Could not retrieve admin attendance view",
      error: error.message,
    });
  }
};

module.exports = {
  loginUser,
  clockIn,
  lunchOut,
  lunchIn,
  clockOut,
  forceClockOutStaff,
  getMyAttendanceToday,
  getTodayAttendanceAdmin,
};