const {
  buildAgingReport,
  buildCustomerStatement,
  reconcileARSubledgerToGL,
} = require("../services/accountsReceivableService");

const getARAging = async (req, res) => {
  try {
    const report = await buildAgingReport();
    res.json({ success: true, data: report });
  } catch (error) {
    console.error("AR aging error:", error);
    res.status(500).json({
      success: false,
      message: "Could not generate AR aging report",
      error: error.message,
    });
  }
};

const getCustomerStatement = async (req, res) => {
  try {
    const { customerEkonId } = req.params;
    const statement = await buildCustomerStatement(customerEkonId);

    res.json({ success: true, data: statement });
  } catch (error) {
    console.error("Customer statement error:", error);
    res.status(500).json({
      success: false,
      message: "Could not generate customer statement",
      error: error.message,
    });
  }
};

const getARReconciliation = async (req, res) => {
  try {
    const reconciliation = await reconcileARSubledgerToGL();
    res.json({ success: true, data: reconciliation });
  } catch (error) {
    console.error("AR reconciliation error:", error);
    res.status(500).json({
      success: false,
      message: "Could not reconcile AR",
      error: error.message,
    });
  }
};

module.exports = {
  getARAging,
  getCustomerStatement,
  getARReconciliation,
};