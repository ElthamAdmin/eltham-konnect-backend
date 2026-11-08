const mongoose = require("mongoose");

const Invoice = require("../models/Invoice");
const JournalEntry = require("../models/JournalEntry");
const GeneralLedgerTransaction = require("../models/GeneralLedgerTransaction");
const FinancialAccount = require("../models/FinancialAccount");
const ARRecoveryLink = require("../models/ARRecoveryLink");

const {
  postJournalEntry,
} = require("./accountingEngine/journalService");

const {
  SYSTEM_ACCOUNTS,
} = require("./accountingEngine/accountingConstants");

const {
  assertCollectibleBalance,
  getPostedWriteOffAmount,
  jamaicaToday,
  dateOnly,
} = require("./arBalanceService");

const round = (value) =>
  Math.round((Number(value) + Number.EPSILON) * 100) / 100;

const fail = (message, statusCode = 400) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  throw error;
};

const nameOf = (user) =>
  user?.fullName || user?.name || user?.email || "System User";

const text = (value, label, max = 2000, required = false) => {
  if (value !== undefined && typeof value !== "string") {
    fail(`${label} must be text.`);
  }

  const result = String(value || "").trim();

  if ((required && !result) || result.length > max) {
    fail(`${label} must contain ${required ? "1" : "0"}–${max} characters.`);
  }

  return result;
};

const positiveAmount = (value) => {
  if (
    value === "" ||
    value === null ||
    value === undefined ||
    !["string", "number"].includes(typeof value)
  ) {
    fail("Enter an explicit amount.");
  }

  const number = Number(value);
  const rounded = round(number);

  if (
    !Number.isFinite(number) ||
    rounded <= 0 ||
    !Number.isSafeInteger(Math.round(rounded * 100)) ||
    Math.abs(number - rounded) > 0.0000001
  ) {
    fail("Amount must be positive and have no more than two decimal places.");
  }

  return rounded;
};

const loadInvoice = async (invoiceNumber, session) => {
  const invoice = await Invoice.findOne({
    invoiceNumber: text(invoiceNumber, "Invoice number", 200, true),
  }).session(session);

  if (!invoice) fail("Invoice not found.", 404);
  return invoice;
};

const addNote = (invoice, note, user) => {
  invoice.collectionNotes.push({
    note,
    createdBy: nameOf(user),
    createdAt: new Date(),
  });
};

const requestInvoiceWriteOff = async ({
  invoiceNumber,
  reason,
  notes,
  amount,
  user,
}) => mongoose.connection.transaction(async (session) => {
  const invoice = await loadInvoice(invoiceNumber, session);
  const balance = assertCollectibleBalance(invoice);
  const requestedAmount = positiveAmount(amount);

  const allowedReasons = [
    "Customer Unable To Pay",
    "Unable To Locate Customer",
    "Small Balance",
    "Dispute Resolved As Write-Off",
    "Management Approval",
    "Other",
  ];

  if (!allowedReasons.includes(reason)) fail("Select a valid write-off reason.");

  const safeNotes = text(notes, "Write-off notes", 2000, true);

  if (requestedAmount > balance) {
    fail("Write-off amount cannot exceed the collectible balance.");
  }

  if (getPostedWriteOffAmount(invoice) > 0) {
    fail("This invoice already has a posted write-off. A further adjustment needs separate review.", 409);
  }

  if (invoice.customerPurchases?.length) {
    fail(
      "Customer-purchase invoices require a coordinated purchase-allocation adjustment before write-off.",
      409
    );
  }

  if (invoice.writeOffStatus === "Pending Approval") {
    if (
      round(invoice.writeOffAmount) === requestedAmount &&
      invoice.writeOffReason === reason &&
      invoice.writeOffNotes === safeNotes
    ) {
      return invoice;
    }

    fail("A different write-off request is already pending for this invoice.", 409);
  }

  invoice.writeOffStatus = "Pending Approval";
  invoice.writeOffReason = reason;
  invoice.writeOffNotes = safeNotes;
  invoice.writeOffAmount = requestedAmount;
  invoice.writeOffRequestedBy = nameOf(user);
  invoice.writeOffRequestedAt = new Date();
  invoice.collectionsStatus = "Legal Review";

  addNote(
    invoice,
    `Write-off requested: JMD ${requestedAmount.toFixed(2)}. ` +
      `Reason: ${reason}. ${safeNotes}`,
    user
  );

  await invoice.save({ session });
  return invoice;
});

const approveInvoiceWriteOff = async ({ invoiceNumber, user }) =>
  mongoose.connection.transaction(async (session) => {
    const invoice = await loadInvoice(invoiceNumber, session);

    if (
      ["Written Off", "Recovered"].includes(invoice.writeOffStatus) &&
      invoice.writeOffJournalEntryNumber
    ) {
      return invoice;
    }

    if (invoice.writeOffStatus !== "Pending Approval") {
      fail("Only a pending write-off can be approved.", 409);
    }

    if (invoice.writeOffJournalEntryNumber) {
      fail("This invoice already references a write-off journal. Review it before proceeding.", 409);
    }

    const balance = assertCollectibleBalance(invoice);
    const amount = positiveAmount(invoice.writeOffAmount);

    if (amount > balance) {
      fail("The balance changed after the request. Review the write-off amount.", 409);
    }

    if (invoice.customerPurchases?.length) {
      fail("Customer-purchase allocation must be reviewed before write-off.", 409);
    }

    // Do not reuse an unrelated or uncertain historical posting.
    const existing = await GeneralLedgerTransaction.exists({
      accountCode: SYSTEM_ACCOUNTS.ACCOUNTS_RECEIVABLE,
      sourceModule: "Accounts Receivable",
      reference: invoice.invoiceNumber,
      credit: { $gt: 0 },
    }).session(session);

    if (existing) {
      fail("An existing AR adjustment references this invoice. Review it before approving.", 409);
    }

    const journal = await postJournalEntry({
      session,
      entryDate: jamaicaToday(),
      memo: `Approved write-off for ${invoice.invoiceNumber}`,
      reference: invoice.invoiceNumber,
      sourceModule: "Accounts Receivable",
      entityId: invoice.entityId || null,
      entityCode: invoice.entityCode || "",
      entitySnapshot: invoice.entitySnapshot || null,
      createdBy: nameOf(user),
      lines: [
        {
          accountCode: SYSTEM_ACCOUNTS.BAD_DEBT_EXPENSE,
          debit: amount,
          credit: 0,
          description: `Bad debt write-off ${invoice.invoiceNumber}`,
        },
        {
          accountCode: SYSTEM_ACCOUNTS.ACCOUNTS_RECEIVABLE,
          debit: 0,
          credit: amount,
          description: `Receivable written off ${invoice.invoiceNumber}`,
        },
      ],
    });

    invoice.balanceDue = round(balance - amount);
    invoice.writeOffStatus = "Written Off";
    invoice.writeOffApprovedBy = nameOf(user);
    invoice.writeOffApprovedAt = new Date();
    invoice.writeOffJournalEntryNumber = journal.entryNumber;

    invoice.status = invoice.balanceDue === 0
      ? "Written Off"
      : Number(invoice.amountPaid || 0) > 0
        ? "Partially Paid"
        : "Unpaid";

    invoice.collectionsStatus = invoice.balanceDue === 0
      ? "Written Off"
      : "Collections";

    addNote(
      invoice,
      `Write-off posted: JMD ${amount.toFixed(2)}. ` +
        `Journal: ${journal.entryNumber}. No cash receipt recorded.`,
      user
    );

    await invoice.save({ session });
    return invoice;
  });

const rejectInvoiceWriteOff = async ({ invoiceNumber, notes, user }) =>
  mongoose.connection.transaction(async (session) => {
    const invoice = await loadInvoice(invoiceNumber, session);

    if (invoice.writeOffStatus !== "Pending Approval") {
      fail("Only a pending write-off can be rejected.", 409);
    }

    const rejection = text(notes, "Rejection reason", 2000, true);

    invoice.writeOffStatus = "Rejected";
    invoice.writeOffNotes = rejection;
    invoice.collectionsStatus = "Collections";

    addNote(invoice, `Write-off rejected: ${rejection}`, user);

    await invoice.save({ session });
    return invoice;
  });

const recordWriteOffRecovery = async ({
  invoiceNumber,
  amount,
  recoveryJournalEntryNumber,
  user,
}) => mongoose.connection.transaction(async (session) => {
  const invoice = await loadInvoice(invoiceNumber, session);
  const recoveredAmount = positiveAmount(amount);
  const entryNumber = text(
    recoveryJournalEntryNumber,
    "Posted recovery journal number",
    200,
    true
  );

  const existing = await ARRecoveryLink.findOne({
    journalEntryNumber: entryNumber,
  }).session(session);

  if (existing) {
    if (
      existing.invoiceNumber === invoice.invoiceNumber &&
      round(existing.amount) === recoveredAmount
    ) {
      return invoice;
    }

    fail("This recovery journal has already been linked.", 409);
  }

  if (
    !["Written Off", "Recovered"].includes(invoice.writeOffStatus) ||
    !invoice.writeOffJournalEntryNumber
  ) {
    fail("The invoice has no posted write-off available for recovery.", 409);
  }

  const remaining = round(
    getPostedWriteOffAmount(invoice) -
    Number(invoice.writeOffRecoveredAmount || 0)
  );

  if (remaining <= 0 || recoveredAmount > remaining) {
    fail("Recovery cannot exceed the remaining unrecovered write-off.", 409);
  }

  const journal = await JournalEntry.findOne({
    entryNumber,
    status: "Posted",
  }).session(session);

  if (
    !journal ||
    journal.reversalEntryNumber ||
    journal.reversedAt ||
    (
      journal.reference !== invoice.invoiceNumber &&
      journal.sourceDocumentNumber !== invoice.invoiceNumber
    )
  ) {
    fail("Use an unreversed Posted recovery journal explicitly referencing this invoice.", 409);
  }

  const lines = journal.lines || [];
  const receipt = lines.find(
    (line) =>
      round(line.debit) === recoveredAmount &&
      round(line.credit) === 0
  );

  const recovery = lines.find(
    (line) =>
      line.accountCode === SYSTEM_ACCOUNTS.BAD_DEBT_EXPENSE &&
      round(line.credit) === recoveredAmount &&
      round(line.debit) === 0
  );

  if (
    lines.length !== 2 ||
    !receipt ||
    !recovery ||
    round(journal.totalDebit) !== recoveredAmount ||
    round(journal.totalCredit) !== recoveredAmount
  ) {
    fail(
      "Recovery journal must debit the JMD receiving account and credit Bad Debt Expense for exactly this amount.",
      409
    );
  }

  const account = await FinancialAccount.findOne({
    linkedChartAccountCode: receipt.accountCode,
    currency: "JMD",
  }).session(session);

  if (!account || !["Bank", "Cash"].includes(account.accountType)) {
    fail("The recovery journal must identify a JMD bank or cash receiving account.", 409);
  }

  const ledger = await GeneralLedgerTransaction.find({
    entryNumber,
  }).session(session);

  if (
    ledger.length !== 2 ||
    !ledger.some(
      (line) =>
        line.accountCode === receipt.accountCode &&
        round(line.debit) === recoveredAmount &&
        round(line.credit) === 0
    ) ||
    !ledger.some(
      (line) =>
        line.accountCode === recovery.accountCode &&
        round(line.credit) === recoveredAmount &&
        round(line.debit) === 0
    )
  ) {
    fail("The posted recovery ledger does not agree with the journal.", 409);
  }

  await ARRecoveryLink.create(
    [{
      invoiceNumber: invoice.invoiceNumber,
      journalEntryNumber: entryNumber,
      amount: recoveredAmount,
      recordedBy: nameOf(user),
    }],
    { session }
  );

  invoice.writeOffRecoveredAmount = round(
    Number(invoice.writeOffRecoveredAmount || 0) + recoveredAmount
  );
  invoice.writeOffRecoveredAt = new Date();
  invoice.recoveryJournalEntryNumber = entryNumber;
  invoice.writeOffStatus =
    invoice.writeOffRecoveredAmount === getPostedWriteOffAmount(invoice)
      ? "Recovered"
      : "Written Off";

  addNote(
    invoice,
    `Posted recovery linked: JMD ${recoveredAmount.toFixed(2)}. ` +
      `Journal: ${entryNumber}. No additional receipt was posted.`,
    user
  );

  await invoice.save({ session });
  return invoice;
});

const addInvoiceCollectionNote = async ({ invoiceNumber, note, user }) =>
  mongoose.connection.transaction(async (session) => {
    const invoice = await loadInvoice(invoiceNumber, session);
    const safeNote = text(note, "Collection note", 2000, true);

    addNote(invoice, safeNote, user);
    await invoice.save({ session });

    return invoice;
  });

const logInvoiceReminder = async ({
  invoiceNumber,
  reminderType,
  channel,
  user,
}) => mongoose.connection.transaction(async (session) => {
  const invoice = await loadInvoice(invoiceNumber, session);

  if (assertCollectibleBalance(invoice) <= 0) {
    fail("This invoice has no collectible balance.");
  }

  const type = text(reminderType || "Payment Reminder", "Reminder type", 100);
  const method = text(channel || "Manual", "Reminder channel", 100);

  addNote(
    invoice,
    `Reminder activity logged: ${type}; channel: ${method}. ` +
      "This log did not send a message.",
    user
  );

  await invoice.save({ session });
  return invoice;
});

const updateInvoiceCollectionWorkflow = async ({
  invoiceNumber,
  collectionsStatus,
  assignedCollector,
  nextFollowUpDate,
  promiseToPayDate,
  promiseToPayAmount,
  promiseToPayStatus,
  user,
}) => mongoose.connection.transaction(async (session) => {
  const invoice = await loadInvoice(invoiceNumber, session);
  const balance = assertCollectibleBalance(invoice);

  const allowedStatuses = [
    "Normal", "Reminder Sent", "Contacted", "No Answer", "Follow Up",
    "Promise To Pay", "Payment Arrangement", "Overdue", "Final Notice",
    "Collections", "Legal Review",
  ];

  if (!allowedStatuses.includes(collectionsStatus)) {
    fail("Select a valid collection status. Use write-off approval to write off a balance.");
  }

  if (!["None", "Pending", "Fulfilled", "Broken"].includes(promiseToPayStatus)) {
    fail("Invalid promise-to-pay status.");
  }

  const parseDate = (value, label) => {
    if (!value) return null;

    if (typeof value !== "string" || dateOnly(value) !== value) {
      fail(`${label} must be a valid date.`);
    }

    return new Date(`${value}T12:00:00-05:00`);
  };

  const promiseAmount =
    promiseToPayAmount === "" || promiseToPayAmount == null
      ? 0
      : positiveAmount(promiseToPayAmount);

  if (promiseToPayStatus !== "None" && (!promiseToPayDate || promiseAmount <= 0)) {
    fail("A promise date and positive amount are required.");
  }

  if (promiseToPayStatus === "Pending" && promiseAmount > balance) {
    fail("The promised amount cannot exceed the collectible balance.");
  }

  invoice.collectionsStatus = collectionsStatus;
  invoice.assignedCollector = text(assignedCollector, "Assigned collector", 200);
  invoice.nextFollowUpDate = parseDate(nextFollowUpDate, "Follow-up date");
  invoice.promiseToPayDate = parseDate(promiseToPayDate, "Promise date");
  invoice.promiseToPayAmount = promiseAmount;
  invoice.promiseToPayStatus = promiseToPayStatus;

  addNote(
    invoice,
    `Collection workflow updated: ${collectionsStatus}; ` +
      `collector: ${invoice.assignedCollector || "Unassigned"}; ` +
      `promise status: ${promiseToPayStatus}.`,
    user
  );

  await invoice.save({ session });
  return invoice;
});

module.exports = {
  requestInvoiceWriteOff,
  approveInvoiceWriteOff,
  rejectInvoiceWriteOff,
  recordWriteOffRecovery,
  addInvoiceCollectionNote,
  logInvoiceReminder,
  updateInvoiceCollectionWorkflow,
};