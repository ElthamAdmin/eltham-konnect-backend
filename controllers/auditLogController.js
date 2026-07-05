const AuditLog = require("../models/AuditLog");

const getAuditLogs = async (req, res) => {
  try {
    const {
      module,
      action,
      user,
      status,
      fiscalYear,
      accountingPeriod,
      journalEntryNumber,
      from,
      to,
      search,
    } = req.query;

    const query = {};

    if (module && module !== "All") query.module = module;
    if (action && action !== "All") query.action = action;
    if (user && user !== "All") query.performedByName = user;
    if (status && status !== "All") query.status = status;
    if (accountingPeriod) query.accountingPeriod = accountingPeriod;
    if (journalEntryNumber) query.journalEntryNumber = journalEntryNumber;
    if (fiscalYear) query.fiscalYear = Number(fiscalYear);

    if (from || to) {
      query.createdAt = {};
      if (from) query.createdAt.$gte = new Date(from);
      if (to) {
        const endDate = new Date(to);
        endDate.setHours(23, 59, 59, 999);
        query.createdAt.$lte = endDate;
      }
    }

    if (search) {
      query.$or = [
        { auditNumber: { $regex: search, $options: "i" } },
        { description: { $regex: search, $options: "i" } },
        { targetId: { $regex: search, $options: "i" } },
        { financeReference: { $regex: search, $options: "i" } },
        { journalEntryNumber: { $regex: search, $options: "i" } },
      ];
    }

    const logs = await AuditLog.find(query).sort({ createdAt: -1 }).limit(1000);

    res.json({
      success: true,
      message: "Audit logs retrieved successfully",
      totalLogs: logs.length,
      data: logs,
    });
  } catch (error) {
    console.error("Error retrieving audit logs:", error);
    res.status(500).json({
      success: false,
      message: "Failed to retrieve audit logs",
      error: error.message,
    });
  }
};

module.exports = {
  getAuditLogs,
};