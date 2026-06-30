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
  buildReminderQueue,
  logInvoiceReminder,
  buildCollectionPerformanceKPIs,
  buildWriteOffDashboard,
requestInvoiceWriteOff,
approveInvoiceWriteOff,
rejectInvoiceWriteOff,
recordWriteOffRecovery,
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

const getReminderQueue = async (req, res) => {
  try {
    const reminders = await buildReminderQueue();
    res.json({ success: true, data: reminders });
  } catch (error) {
    console.error("Reminder queue error:", error);
    res.status(500).json({
      success: false,
      message: "Could not load reminder queue",
      error: error.message,
    });
  }
};

const sendInvoiceReminder = async (req, res) => {
  try {
    const { invoiceNumber } = req.params;
    const { reminderType, channel } = req.body;

    const invoice = await logInvoiceReminder({
      invoiceNumber,
      reminderType,
      channel,
      user: req.user,
    });

    res.json({
      success: true,
      message: "Reminder logged successfully",
      data: invoice,
    });
  } catch (error) {
    console.error("Send reminder error:", error);
    res.status(500).json({
      success: false,
      message: "Could not log reminder",
      error: error.message,
    });
  }
};

const getCollectionPerformanceKPIs = async (req, res) => {
  try {
    const performance = await buildCollectionPerformanceKPIs();
    res.json({ success: true, data: performance });
  } catch (error) {
    console.error("Collection performance KPI error:", error);
    res.status(500).json({
      success: false,
      message: "Could not load collection performance KPIs",
      error: error.message,
    });
  }
};

const getWriteOffDashboard = async (req, res) => {
  try {
    const dashboard = await buildWriteOffDashboard();
    res.json({ success: true, data: dashboard });
  } catch (error) {
    console.error("Write-off dashboard error:", error);
    res.status(500).json({
      success: false,
      message: "Could not load write-off dashboard",
      error: error.message,
    });
  }
};

const requestWriteOff = async (req, res) => {
  try {
    const { invoiceNumber } = req.params;
    const invoice = await requestInvoiceWriteOff({
      invoiceNumber,
      reason: req.body.reason,
      notes: req.body.notes,
      amount: req.body.amount,
      user: req.user,
    });

    res.json({ success: true, message: "Write-off requested successfully", data: invoice });
  } catch (error) {
    console.error("Request write-off error:", error);
    res.status(500).json({
      success: false,
      message: "Could not request write-off",
      error: error.message,
    });
  }
};

const approveWriteOff = async (req, res) => {
  try {
    const { invoiceNumber } = req.params;
    const invoice = await approveInvoiceWriteOff({ invoiceNumber, user: req.user });

    res.json({ success: true, message: "Write-off approved successfully", data: invoice });
  } catch (error) {
    console.error("Approve write-off error:", error);
    res.status(500).json({
      success: false,
      message: "Could not approve write-off",
      error: error.message,
    });
  }
};

const rejectWriteOff = async (req, res) => {
  try {
    const { invoiceNumber } = req.params;
    const invoice = await rejectInvoiceWriteOff({
      invoiceNumber,
      notes: req.body.notes,
      user: req.user,
    });

    res.json({ success: true, message: "Write-off rejected successfully", data: invoice });
  } catch (error) {
    console.error("Reject write-off error:", error);
    res.status(500).json({
      success: false,
      message: "Could not reject write-off",
      error: error.message,
    });
  }
};

const recordRecovery = async (req, res) => {
  try {
    const { invoiceNumber } = req.params;
    const invoice = await recordWriteOffRecovery({
      invoiceNumber,
      amount: req.body.amount,
      recoveryJournalEntryNumber: req.body.recoveryJournalEntryNumber,
      user: req.user,
    });

    res.json({ success: true, message: "Recovery recorded successfully", data: invoice });
  } catch (error) {
    console.error("Record recovery error:", error);
    res.status(500).json({
      success: false,
      message: "Could not record recovery",
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
  getReminderQueue,
  sendInvoiceReminder,
  getCollectionPerformanceKPIs,
  getWriteOffDashboard,
requestWriteOff,
approveWriteOff,
rejectWriteOff,
recordRecovery,
};