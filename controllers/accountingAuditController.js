const { integrityAuditService } = require("../services/accountingEngine");

const auditTrialBalance = async (req, res) => {
  try {
    const { from = "", to = "" } = req.query;

    const audit = await integrityAuditService.auditTrialBalanceIntegrity({
      from,
      to,
    });

    res.json({
      success: true,
      message: "Trial balance integrity audit completed.",
      data: audit,
    });
  } catch (error) {
    console.error("Trial balance audit failed:", error);
    res.status(500).json({
      success: false,
      message: "Trial balance audit failed",
      error: error.message,
    });
  }
};

module.exports = {
  auditTrialBalance,
};