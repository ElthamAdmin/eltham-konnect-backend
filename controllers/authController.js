const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const SystemUser = require("../models/SystemUser");
const AttendanceLog = require("../models/AttendanceLog");

const getJamaicaNow = () => {
  const now = new Date();
  const jamaicaString = now.toLocaleString("en-US", {
    timeZone: "America/Jamaica",
  });
  return new Date(jamaicaString);
};

const formatDateToYMD = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const formatMinutes = (minutes) => {
  const numericMinutes = Number(minutes || 0);
  const hours = Math.floor(numericMinutes / 60);
  const mins = numericMinutes % 60;
  return `${hours}h ${mins}m`;
};

const getTodayDateString = () => {
  return formatDateToYMD(getJamaicaNow());
};

const getDateRangeByFilter = (filter, customStartDate, customEndDate) => {
  const today = getJamaicaNow();
  today.setHours(0, 0, 0, 0);

  const endOfToday = new Date(today);
  endOfToday.setHours(23, 59, 59, 999);

  let startDate = new Date(today);
  let endDate = new Date(endOfToday);

  switch (filter) {
    case "today":
      break;

    case "yesterday":
      startDate.setDate(startDate.getDate() - 1);
      endDate = new Date(startDate);
      endDate.setHours(23, 59, 59, 999);
      break;

    case "thisWeek": {
      const day = startDate.getDay();
      const diff = day === 0 ? 6 : day - 1;
      startDate.setDate(startDate.getDate() - diff);
      break;
    }

    case "lastWeek": {
      const day = startDate.getDay();
      const diff = day === 0 ? 6 : day - 1;
      startDate.setDate(startDate.getDate() - diff - 7);

      endDate = new Date(startDate);
      endDate.setDate(endDate.getDate() + 6);
      endDate.setHours(23, 59, 59, 999);
      break;
    }

    case "thisMonth":
      startDate = new Date(today.getFullYear(), today.getMonth(), 1);
      break;

    case "lastMonth":
      startDate = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      endDate = new Date(today.getFullYear(), today.getMonth(), 0);
      endDate.setHours(23, 59, 59, 999);
      break;

    case "thisYear":
      startDate = new Date(today.getFullYear(), 0, 1);
      break;

    case "custom":
      if (!customStartDate || !customEndDate) {
        throw new Error("Custom start date and end date are required");
      }
      startDate = new Date(`${customStartDate}T00:00:00`);
      endDate = new Date(`${customEndDate}T23:59:59.999`);
      break;

    default:
      break;
  }

  return {
    startDate,
    endDate,
    startDateString: formatDateToYMD(startDate),
    endDateString: formatDateToYMD(endDate),
  };
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

    const normalizedEmail = String(email || "").trim().toLowerCase();

    const user = await SystemUser.findOne({ email: normalizedEmail });

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

    const tokenPayload = {
      userId: user.userId,
      email: user.email,
      role: user.role,
      fullName: user.fullName,
      branch: user.branch,
      status: user.status,
      dutyStatus: user.dutyStatus,
      permissions: Array.isArray(user.permissions) ? user.permissions : [],
      linkedEmployeeId: user.linkedEmployeeId || "",
    };

    const token = jwt.sign(
      tokenPayload,
      process.env.JWT_SECRET || "eltham-konnect-secret",
      { expiresIn: "12h" }
    );

    res.json({
      success: true,
      message: "Login successful",
      token,
      data: tokenPayload,
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

const getAttendanceHistoryAdmin = async (req, res) => {
  try {
    if (
  req.user?.role !== "Admin" &&
  !req.user?.permissions?.includes("users") &&
  !req.user?.permissions?.includes("finance") &&
  !req.user?.permissions?.includes("hr")
) {
  return res.status(403).json({
    success: false,
    message: "You do not have permission to view attendance history",
  });
}

    const {
      filter = "today",
      startDate: customStartDate,
      endDate: customEndDate,
      userId = "",
      branch = "",
    } = req.query;

    const { startDateString, endDateString } = getDateRangeByFilter(
      filter,
      customStartDate,
      customEndDate
    );

    const usersQuery = {};
    if (branch) usersQuery.branch = branch;
    if (userId) usersQuery.userId = userId;

    const users = await SystemUser.find(usersQuery)
      .select("-passwordHash")
      .sort({ fullName: 1 });

    const userIds = users.map((u) => u.userId);

    const attendanceQuery = {
      workDate: {
        $gte: startDateString,
        $lte: endDateString,
      },
    };

    if (userId) {
      attendanceQuery.userId = userId;
    } else if (branch) {
      attendanceQuery.userId = { $in: userIds };
    }

    const attendance = await AttendanceLog.find(attendanceQuery).sort({
      workDate: -1,
      createdAt: -1,
    });

    const summaryMap = {};

    users.forEach((user) => {
      summaryMap[user.userId] = {
        userId: user.userId,
        fullName: user.fullName,
        role: user.role,
        branch: user.branch,
        totalDays: 0,
        totalWorkedMinutes: 0,
        totalLunchMinutes: 0,
      };
    });

    attendance.forEach((row) => {
      if (!summaryMap[row.userId]) {
        summaryMap[row.userId] = {
          userId: row.userId,
          fullName: row.fullName,
          role: row.role,
          branch: "",
          totalDays: 0,
          totalWorkedMinutes: 0,
          totalLunchMinutes: 0,
        };
      }

      summaryMap[row.userId].totalDays += 1;
      summaryMap[row.userId].totalWorkedMinutes += Number(row.workedMinutes || 0);
      summaryMap[row.userId].totalLunchMinutes += Number(row.lunchMinutes || 0);
    });

    const summary = Object.values(summaryMap).map((item) => ({
      ...item,
      totalWorkedLabel: formatMinutes(item.totalWorkedMinutes),
      totalLunchLabel: formatMinutes(item.totalLunchMinutes),
    }));

    res.json({
      success: true,
      message: "Attendance history retrieved successfully",
      data: {
        filter,
        startDate: startDateString,
        endDate: endDateString,
        attendance,
        users,
        summary,
      },
    });
  } catch (error) {
    console.error("Attendance history error:", error);
    res.status(500).json({
      success: false,
      message: "Could not retrieve attendance history",
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
  getAttendanceHistoryAdmin,
};