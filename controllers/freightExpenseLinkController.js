const mongoose = require("mongoose");
const crypto = require("crypto");

const FreightInvoice = require("../models/FreightInvoice");
const Expense = require("../models/Expense");
const AccountsPayable = require("../models/AccountsPayable");
const Vendor = require("../models/Vendor");
const FinancialAccount = require("../models/FinancialAccount");
const AccountTransaction = require("../models/AccountTransaction");
const JournalEntry = require("../models/JournalEntry");
const GeneralLedgerTransaction = require("../models/GeneralLedgerTransaction");

const {
  postJournalEntry,
} = require("../services/accountingEngine/journalService");

const {
  SYSTEM_ACCOUNTS,
} = require("../services/accountingEngine/accountingConstants");

const round = (value) =>
  Math.round((Number(value) + Number.EPSILON) * 100) / 100;

const fail = (message, statusCode = 400) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  throw error;
};

const userName = (user) =>
  user?.fullName || user?.name || user?.email || "System User";

const validDate = (value) => {
  const result = String(value || "");
  const parsed = new Date(`${result}T00:00:00.000Z`);

  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(result) ||
    Number.isNaN(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== result
  ) {
    fail("Enter a valid correction posting date.");
  }

  return result;
};

const journalDate = (value) =>
  new Date(value).toISOString().slice(0, 10);

const verifyTwoLineJournal = async ({
  entryNumber,
  debitCode,
  creditCode,
  amount,
  session,
}) => {
  const journal = await JournalEntry.findOne({
    entryNumber,
    status: "Posted",
  }).session(session);

  if (!journal) {
    fail("A required original journal is missing or is not Posted.", 409);
  }

  const matches = (lines) => {
    if (!Array.isArray(lines) || lines.length !== 2) return false;

    return (
      lines.some(
        (line) =>
          line.accountCode === debitCode &&
          round(line.debit) === amount &&
          round(line.credit) === 0
      ) &&
      lines.some(
        (line) =>
          line.accountCode === creditCode &&
          round(line.credit) === amount &&
          round(line.debit) === 0
      )
    );
  };

  if (
    !matches(journal.lines) ||
    round(journal.totalDebit) !== amount ||
    round(journal.totalCredit) !== amount
  ) {
    fail("The original journal does not match the expected expense/payment.", 409);
  }

  const ledger = await GeneralLedgerTransaction.find({
    entryNumber,
  }).session(session);

  if (!matches(ledger)) {
    fail("The original ledger does not match the journal. No link was made.", 409);
  }

  return journal;
};

const inspectMatch = async ({
  freightInvoiceNumber,
  expenseNumber,
  session = null,
}) => {
  if (typeof expenseNumber !== "string" || !expenseNumber.trim()) {
    fail("Enter the existing expense number.");
  }

  const invoice = await FreightInvoice.findOne({
    freightInvoiceNumber,
  }).session(session);

  const expense = await Expense.findOne({
    expenseNumber: expenseNumber.trim(),
  }).session(session);

  if (!invoice || !expense) {
    fail("The freight invoice or expense was not found.", 404);
  }

  if (expense.freightInvoiceNumber) {
    fail("This expense is already linked to a freight invoice.", 409);
  }

  if (
    invoice.status !== "Unpaid" ||
    invoice.paymentHistory.length ||
    round(invoice.amountPaid) !== 0 ||
    round(invoice.balanceDue) !== round(invoice.total)
  ) {
    fail("Existing-expense linking requires a completely unpaid freight invoice.", 409);
  }

  if (expense.status !== "Paid") {
    fail("Only an existing Paid expense can be linked.", 409);
  }

  const actualJmdAmount = round(expense.amount);

  if (!Number.isFinite(actualJmdAmount) || actualJmdAmount <= 0) {
    fail("The expense has an invalid amount.", 409);
  }

  if (!expense.linkedChartAccountCode || !expense.paidFromAccountNumber) {
    fail("The expense lacks the account references needed for a safe match.", 409);
  }

  const account = await FinancialAccount.findOne({
    accountNumber: expense.paidFromAccountNumber,
  }).session(session);

  if (
    !account ||
    String(account.currency || "JMD").toUpperCase() !== "JMD" ||
    String(account.baseCurrency || "JMD").toUpperCase() !== "JMD" ||
    !account.linkedChartAccountCode
  ) {
    fail("The original payment must have a verifiable JMD financial account.", 409);
  }

  const expenseDate = validDate(expense.date);
  const start = new Date(`${expenseDate}T00:00:00.000Z`);
  const end = new Date(start.getTime() + 86400000);

  const transactions = await AccountTransaction.find({
    accountNumber: expense.paidFromAccountNumber,
    amount: expense.amount,
    reference: expense.category,
    notes: expense.description,
    transactionDate: { $gte: start, $lt: end },
    transactionType:
      account.accountType === "Credit Card"
        ? "Credit Card Charge"
        : "Expense Payment",
  })
    .limit(2)
    .session(session);

  if (transactions.length !== 1) {
    fail(
      "The original payment could not be identified uniquely. No records were changed.",
      409
    );
  }

  const transaction = transactions[0];

  if (
    transaction.freightInvoiceNumber ||
    !transaction.journalEntryNumber ||
    transaction.linkedChartAccountCode !== account.linkedChartAccountCode ||
    String(transaction.transactionCurrency || "JMD").toUpperCase() !== "JMD"
  ) {
    fail("The original payment is already linked or has inconsistent account details.", 409);
  }

  const payable = await AccountsPayable.findOne({
    payableNumber: invoice.payableNumber,
    freightInvoiceNumber: invoice.freightInvoiceNumber,
  }).session(session);

  if (
    !payable ||
    !["Unpaid", "Overdue"].includes(payable.status) ||
    !["Not Required", "Approved"].includes(payable.approvalStatus) ||
    round(payable.amountPaid) !== 0 ||
    payable.paymentHistory.length ||
    round(payable.balanceDue) !== round(invoice.baseCurrencyAmount) ||
    round(payable.amount) !== round(invoice.baseCurrencyAmount)
  ) {
    fail("The linked payable is not an unchanged unpaid bill.", 409);
  }

  const originalJournal = await verifyTwoLineJournal({
    entryNumber: transaction.journalEntryNumber,
    debitCode: expense.linkedChartAccountCode,
    creditCode: account.linkedChartAccountCode,
    amount: actualJmdAmount,
    session,
  });

  if (journalDate(originalJournal.entryDate) !== expenseDate) {
    fail("The original journal date does not match the expense.", 409);
  }

  if (originalJournal.sourceModule !== "Expenses") {
    fail("The original journal is not an expense payment.", 409);
  }

  await verifyTwoLineJournal({
    entryNumber: invoice.journalEntryNumber,
    debitCode: invoice.expenseAccountCode,
    creditCode: SYSTEM_ACCOUNTS.ACCOUNTS_PAYABLE,
    amount: round(invoice.baseCurrencyAmount),
    session,
  });

  const fingerprint = crypto.createHash("sha256").update(
    JSON.stringify({
      invoice: invoice.freightInvoiceNumber,
      total: invoice.total,
      base: invoice.baseCurrencyAmount,
      invoiceJournal: invoice.journalEntryNumber,
      payable: payable.payableNumber,
      expense: expense.expenseNumber,
      expenseAmount: expense.amount,
      expenseDate,
      expenseDescription: expense.description,
      expenseCategory: expense.category,
      expenseCode: expense.linkedChartAccountCode,
      transaction: transaction.transactionNumber,
      originalJournal: originalJournal.entryNumber,
      paymentAccount: account.accountNumber,
      paymentChart: account.linkedChartAccountCode,
    })
  ).digest("hex");

  return {
    invoice,
    expense,
    payable,
    account,
    transaction,
    originalJournal,
    fingerprint,
    preview: {
      fingerprint,
      supplierInvoiceNumber: invoice.supplierInvoiceNumber,
      vendorName: invoice.vendorName,
      invoiceCurrency: invoice.currency,
      invoiceAmount: invoice.total,
      liabilityJmdAmount: round(payable.balanceDue),
      expenseNumber: expense.expenseNumber,
      expenseDescription: expense.description,
      expenseCategory: expense.category,
      paymentDate: expense.date,
      actualJmdAmount,
      difference: round(actualJmdAmount - payable.balanceDue),
      paymentAccountName: account.accountName,
      originalJournalEntryNumber: originalJournal.entryNumber,
      originalTransactionNumber: transaction.transactionNumber,
    },
  };
};

const sendError = (res, error) => {
  console.error("Freight expense linking:", error.message);

  return res.status(error.statusCode || 500).json({
    success: false,
    message:
      error.statusCode
        ? error.message
        : "Could not confirm the link. Refresh the invoice before retrying.",
  });
};

const previewFreightExpenseLink = async (req, res) => {
  try {
    const match = await inspectMatch({
      freightInvoiceNumber: req.params.freightInvoiceNumber,
      expenseNumber: req.body.expenseNumber,
    });

    res.setHeader("Cache-Control", "private, no-store");

    return res.json({
      success: true,
      data: match.preview,
    });
  } catch (error) {
    return sendError(res, error);
  }
};

const linkFreightExpense = async (req, res) => {
  try {
    const expenseNumber =
      typeof req.body.expenseNumber === "string"
        ? req.body.expenseNumber.trim()
        : "";

    const reason =
      typeof req.body.reason === "string"
        ? req.body.reason.trim()
        : "";

    if (reason.length < 10 || reason.length > 1000) {
      fail("Enter a linking reason of 10–1000 characters.");
    }

    const postingDate = validDate(req.body.postingDate);

    if (
      typeof req.body.fingerprint !== "string" ||
      !/^[a-f0-9]{64}$/.test(req.body.fingerprint)
    ) {
      fail("Preview the existing expense before confirming.");
    }

    const result = await mongoose.connection.transaction(async (session) => {
      const existingExpense = await Expense.findOne({
        expenseNumber,
      }).session(session);

      if (
        existingExpense?.freightInvoiceNumber ===
        req.params.freightInvoiceNumber
      ) {
        return { replayed: true };
      }

      const match = await inspectMatch({
        freightInvoiceNumber: req.params.freightInvoiceNumber,
        expenseNumber,
        session,
      });

      if (match.fingerprint !== req.body.fingerprint) {
        fail("The records changed after preview. Preview the match again.", 409);
      }

      const {
        invoice,
        expense,
        payable,
        account,
        transaction,
        originalJournal,
      } = match;

      if (
        postingDate < invoice.invoiceDate ||
        postingDate < expense.date
      ) {
        fail("Correction date cannot precede the invoice or original expense.");
      }

      const vendor = await Vendor.findOne({
        vendorCode: invoice.vendorCode,
      }).session(session);

      if (!vendor) fail("Linked vendor not found.", 404);

      const carryingJmdAmount = round(payable.balanceDue);
      const actualJmdAmount = round(expense.amount);
      const difference = round(actualJmdAmount - carryingJmdAmount);

      /*
       * The original expense already contains the cost and Visa charge.
       * Clear the new payable and offset only its duplicate cost posting.
       * No cash/bank/card line and no new AccountTransaction are created.
       */
      const correction = await postJournalEntry({
        session,
        entryDate: postingDate,
        memo:
          `Link existing expense ${expense.expenseNumber} to ` +
          `${invoice.supplierInvoiceNumber}: ${reason}`,
        reference: `FWLINK-${expense.expenseNumber}`,
        sourceModule: "Accounts Payable",
        createdBy: userName(req.user),
        lines: [
          {
            accountCode: SYSTEM_ACCOUNTS.ACCOUNTS_PAYABLE,
            debit: carryingJmdAmount,
            credit: 0,
            description:
              `${invoice.supplierInvoiceNumber} settled by existing expense`,
          },
          {
            accountCode: invoice.expenseAccountCode,
            debit: 0,
            credit: carryingJmdAmount,
            description:
              `Offset duplicate cost; retain ${expense.expenseNumber}`,
          },
        ],
      });

      const note =
        `Linked existing expense ${expense.expenseNumber}. ` +
        `Original payment JMD ${actualJmdAmount.toFixed(2)}. ` +
        `Difference JMD ${difference.toFixed(2)} remains in the original ` +
        `expense; no additional payment or difference posting. ${reason}`;

      payable.amountPaid = carryingJmdAmount;
      payable.balanceDue = 0;
      payable.status = "Paid";
      payable.paymentAccountNumber = account.accountNumber;
      payable.paymentAccountName = account.accountName;
      payable.lastPaymentDate = expense.date;

      payable.paymentHistory.push({
        paymentDate: expense.date,
        paymentAmount: carryingJmdAmount,
        paymentAccountNumber: account.accountNumber,
        paymentAccountName: account.accountName,
        paymentMethod: "Existing Expense",
        paymentReference: expense.expenseNumber,
        journalEntryNumber: correction.entryNumber,
        accountTransactionNumber: transaction.transactionNumber,
        notes: note,
        paidBy: userName(req.user),
      });

      await payable.save({ session });

      vendor.currentBalance = round(
        Number(vendor.currentBalance || 0) - carryingJmdAmount
      );
      await vendor.save({ session });

      invoice.amountPaid = invoice.total;
      invoice.balanceDue = 0;
      invoice.status = "Paid";

      invoice.paymentHistory.push({
        sourceExpenseNumber: expense.expenseNumber,
        originalJournalEntryNumber: originalJournal.entryNumber,
        linkingReason: reason,
        requestId: `MATCH-${expense.expenseNumber}`,
        requestHash: match.fingerprint,
        paymentDate: expense.date,
        invoiceCurrencyAmount: invoice.total,
        actualJmdAmount,
        carryingJmdAmount,
        exchangeDifference: difference,
        exchangeAdjustmentAccountCode: "",
        paymentAccountNumber: account.accountNumber,
        paymentAccountName: account.accountName,
        paymentMethod: "Existing Expense",
        paymentReference: expense.expenseNumber,
        journalEntryNumber: correction.entryNumber,
        accountTransactionNumber: transaction.transactionNumber,
        paidBy: userName(req.user),
        notes: note,
      });

      await invoice.save({ session });

      expense.freightInvoiceNumber = invoice.freightInvoiceNumber;
      expense.freightLinkJournalEntryNumber = correction.entryNumber;
      expense.freightLinkedAt = new Date();
      expense.freightLinkedBy = userName(req.user);
      expense.freightLinkReason = reason;
      await expense.save({ session });

      transaction.freightInvoiceNumber = invoice.freightInvoiceNumber;
      await transaction.save({ session });

      return {
        replayed: false,
        journalEntryNumber: correction.entryNumber,
      };
    });

    return res.json({
      success: true,
      message: result.replayed
        ? "This expense is already linked. Nothing further was posted."
        : "Existing expense linked. The payable is Paid; no new Visa charge was created.",
      data: result,
    });
  } catch (error) {
    return sendError(res, error);
  }
};

module.exports = {
  previewFreightExpenseLink,
  linkFreightExpense,
};