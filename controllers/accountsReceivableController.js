const {
  buildAgingReport,
  buildCustomerStatement,
  reconcileARSubledgerToGL,
  buildARDiagnosticAudit,
  buildCollectionsDashboard,
  buildCustomerCollectionsProfile,
  buildCollectionsWorkQueue,
  addInvoiceCollectionNote,
  updateInvoiceCollectionWorkflow,
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

const getARDiagnosticAudit = async (req, res) => {
  try {
    const audit = await buildARDiagnosticAudit();
    res.json({ success: true, data: audit });
  } catch (error) {
    console.error("AR diagnostic audit error:", error);
    res.status(500).json({
      success: false,
      message: "Could not run AR diagnostic audit",
      error: error.message,
    });
  }
};

const getCollectionsDashboard = async (req, res) => {
  try {
    const dashboard = await buildCollectionsDashboard();
    res.json({ success: true, data: dashboard });
  } catch (error) {
    console.error("Collections dashboard error:", error);
    res.status(500).json({
      success: false,
      message: "Could not load collections dashboard",
      error: error.message,
    });
  }
};

const getCollectionsWorkQueue = async (req, res) => {
  try {
    const queue = await buildCollectionsWorkQueue();
    res.json({ success: true, data: queue });
  } catch (error) {
    console.error("Collections work queue error:", error);
    res.status(500).json({
      success: false,
      message: "Could not load collections work queue",
      error: error.message,
    });
  }
};

const getCustomerCollectionsProfile = async (req, res) => {
  try {
    const { customerEkonId } = req.params;
    const profile = await buildCustomerCollectionsProfile(customerEkonId);

    res.json({ success: true, data: profile });
  } catch (error) {
    console.error("Customer collections profile error:", error);
    res.status(500).json({
      success: false,
      message: "Could not load customer collections profile",
      error: error.message,
    });
  }
};

const addCollectionNote = async (req, res) => {
  try {
    const { invoiceNumber } = req.params;
    const { note } = req.body;

    if (!note || !String(note).trim()) {
      return res.status(400).json({
        success: false,
        message: "Collection note is required.",
      });
    }

    const invoice = await addInvoiceCollectionNote({
      invoiceNumber,
      note: String(note).trim(),
      user: req.user,
    });

    res.json({
      success: true,
      message: "Collection note added successfully",
      data: invoice,
    });
  } catch (error) {
    console.error("Add collection note error:", error);
    res.status(500).json({
      success: false,
      message: "Could not add collection note",
      error: error.message,
    });
  }
};

const updateCollectionWorkflow = async (req, res) => {
  try {
    const { invoiceNumber } = req.params;

    const invoice = await updateInvoiceCollectionWorkflow({
      invoiceNumber,
      collectionsStatus: req.body.collectionsStatus,
      assignedCollector: req.body.assignedCollector,
      nextFollowUpDate: req.body.nextFollowUpDate,
      promiseToPayDate: req.body.promiseToPayDate,
      promiseToPayAmount: req.body.promiseToPayAmount,
      promiseToPayStatus: req.body.promiseToPayStatus,
    });

    res.json({
      success: true,
      message: "Collection workflow updated successfully",
      data: invoice,
    });
  } catch (error) {
    console.error("Update collection workflow error:", error);
    res.status(500).json({
      success: false,
      message: "Could not update collection workflow",
      error: error.message,
    });
  }
};

module.exports = {
  getARAging,
  getCustomerStatement,
  getARReconciliation,
  getCollectionsDashboard,
  getARDiagnosticAudit,
  getCustomerCollectionsProfile,
  getCollectionsWorkQueue,
  addCollectionNote,
  updateCollectionWorkflow,
};