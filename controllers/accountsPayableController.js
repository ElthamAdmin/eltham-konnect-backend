const mongoose = require("mongoose");
const crypto = require("crypto");

const Vendor = require("../models/Vendor");
const AccountsPayable = require("../models/AccountsPayable");
const FinancialAccount = require("../models/FinancialAccount");
const AccountTransaction = require("../models/AccountTransaction");
const ChartOfAccount = require("../models/ChartOfAccount");

const accountingService = require("../services/accountingService");

const round = (value) =>
  Math.round((Number(value) + Number.EPSILON) * 100) / 100;

const fail = (message, statusCode = 400) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  throw error;
};

const getUserName = (user) =>
  user?.fullName || user?.name || user?.email || "System User";

const getActor = (user) =>
  String(user?.userId || user?._id || user?.email || getUserName(user));

const todayYMD = () => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Jamaica",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  return ["year", "month", "day"]
    .map((type) => parts.find((part) => part.type === type)?.value)
    .join("-");
};

const text = (value, label, max = 200, required = false) => {
  if (value !== undefined && typeof value !== "string") {
    fail(`${label} must be text.`);
  }

  const result = String(value || "").trim();

  if ((required && !result) || result.length > max) {
    fail(`${label} must contain ${required ? "1" : "0"}–${max} characters.`);
  }

  return result;
};

const positiveMoney = (value, label) => {
  if (
    value === "" ||
    value === undefined ||
    value === null ||
    !["string", "number"].includes(typeof value)
  ) {
    fail(`${label} is required.`);
  }

  const number = Number(value);
  const rounded = round(number);

  if (
    !Number.isFinite(number) ||
    rounded <= 0 ||
    !Number.isSafeInteger(Math.round(rounded * 100)) ||
    Math.abs(number - rounded) > 0.0000001
  ) {
    fail(`${label} must be positive and have no more than two decimal places.`);
  }

  return rounded;
};

const validDate = (value, label) => {
  const result = text(value, label, 10, true);
  const parsed = new Date(`${result}T00:00:00.000Z`);

  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(result) ||
    Number.isNaN(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== result
  ) {
    fail(`${label} must be a valid date.`);
  }

  return result;
};

const requestId = (value) => {
  const result = text(value, "Request ID", 100, true);

  if (!/^[a-zA-Z0-9_-]{10,100}$/.test(result)) {
    fail("Invalid request ID. Refresh the page and retry.");
  }

  return result;
};

const hash = (value) =>
  crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");

const safePayable = (payable) => {
  const result = payable.toObject();
  delete result.creationRequestHash;
  return result;
};

const sendError = (res, error) => {
  console.error("Accounts payable:", error.message);

  return res.status(
    error.code === 11000 ? 409 : error.statusCode || 500
  ).json({
    success: false,
    message:
      error.code === 11000
        ? "This request was already recorded. Refresh before retrying."
        : error.statusCode
        ? error.message
        : "Could not confirm the operation. Refresh records before retrying.",
  });
};

const getVendors = async (req, res) => {
  try {
    const vendors = await Vendor.find().sort({ vendorName: 1 });

    res.setHeader("Cache-Control", "private, no-store");
    return res.json({ success: true, data: vendors });
  } catch (error) {
    return sendError(res, error);
  }
};

const createVendor = async (req, res) => {
  try {
    const body = req.body || {};
    const vendorName = text(body.vendorName, "Vendor name", 200, true);
    const vendorType = text(body.vendorType || "Supplier", "Vendor type");

    if (
      ![
        "Freight Forwarder",
        "Utility",
        "Supplier",
        "Service Provider",
        "Government",
        "Other",
      ].includes(vendorType)
    ) {
      fail("Invalid vendor type.");
    }

    const openingBalance = Number(body.openingBalance ?? 0);

    if (!Number.isFinite(openingBalance) || openingBalance !== 0) {
      fail(
        "Create new vendors with a zero opening balance. Opening-balance accounting will be handled separately."
      );
    }

    const vendor = await Vendor.create({
      vendorCode: `VEN-${crypto.randomUUID()}`,
      vendorName,
      vendorType,
      contactPerson: text(body.contactPerson, "Contact person"),
      email: text(body.email, "Email", 320),
      phone: text(body.phone, "Phone", 100),
      address: text(body.address, "Address", 2000),
      openingBalance: 0,
      currentBalance: 0,
    });

    return res.status(201).json({
      success: true,
      message: "Vendor created successfully.",
      data: vendor,
    });
  } catch (error) {
    return sendError(res, error);
  }
};

const getAccountsPayable = async (req, res) => {
  try {
    const payables = await AccountsPayable.find()
      .sort({ payableDate: -1, createdAt: -1 });

    res.setHeader("Cache-Control", "private, no-store");

    return res.json({
      success: true,
      data: payables.map(safePayable),
    });
  } catch (error) {
    return sendError(res, error);
  }
};

const createAccountsPayable = async (req, res) => {
  try {
    const body = req.body || {};

    const details = {
      vendorCode: text(body.vendorCode, "Vendor", 200, true),
      billNumber: text(body.billNumber, "Supplier bill number", 200, true),
      payableDate: validDate(body.payableDate || todayYMD(), "Bill date"),
      dueDate: validDate(body.dueDate, "Due date"),
      description: text(body.description, "Description", 2000),
      expenseAccountCode: text(
        body.expenseAccountCode || "6000",
        "Expense account code",
        50,
        true
      ),
      amount: positiveMoney(body.amount, "Bill amount"),
      notes: text(body.notes, "Notes", 5000),
    };

    if (details.dueDate < details.payableDate) {
      fail("Due date cannot precede the bill date.");
    }

    const creationRequestId = `APCREATE-${requestId(body.requestId)}`;
    const creationRequestHash = hash({
      actor: getActor(req.user),
      ...details,
    });

    const result = await mongoose.connection.transaction(async (session) => {
      const previous = await AccountsPayable.findOne({
        creationRequestId,
      })
        .select("+creationRequestHash")
        .session(session);

      if (previous) {
        if (previous.creationRequestHash !== creationRequestHash) {
          fail("This request ID was already used with different bill details.", 409);
        }

        return { payable: previous, replayed: true };
      }

      const vendor = await Vendor.findOne({
        vendorCode: details.vendorCode,
        status: "Active",
      }).session(session);

      if (!vendor) fail("Active vendor not found.", 404);

      if (vendor.vendorType === "Freight Forwarder") {
        fail(
          "Record freight-forwarder invoices through Financial → Freight Forwarder Invoices.",
          409
        );
      }

      const escapedNumber = details.billNumber.replace(
        /[.*+?^${}()|[\]\\]/g,
        "\\$&"
      );

      const duplicate = await AccountsPayable.exists({
        vendorCode: vendor.vendorCode,
        billNumber: {
          $regex: `^\\s*${escapedNumber}\\s*$`,
          $options: "i",
        },
      }).session(session);

      if (duplicate) {
        fail("This supplier bill number is already recorded for this vendor.", 409);
      }

      const expenseAccount = await ChartOfAccount.findOne({
        accountCode: details.expenseAccountCode,
        status: "Active",
      }).session(session);

      if (
        !expenseAccount ||
        !/expense|cost/i.test(String(expenseAccount.accountCategory || ""))
      ) {
        fail("Select an active expense or cost account.");
      }

      const [payable] = await AccountsPayable.create(
        [{
          ...details,
          payableNumber: `AP-${crypto.randomUUID()}`,
          creationRequestId,
          creationRequestHash,
          vendorName: vendor.vendorName,
          expenseAccountName: expenseAccount.accountName,
          amountPaid: 0,
          balanceDue: details.amount,
          status: "Unpaid",
          approvalStatus: "Not Required",
          paymentHistory: [],
          createdBy: getUserName(req.user),
        }],
        { session }
      );

      const journalEntry = await accountingService.postVendorBill({
        session,
        payable,
        expenseAccountCode: expenseAccount.accountCode,
        amount: details.amount,
        user: req.user,
      });

      payable.journalEntryNumber = journalEntry.entryNumber;
      await payable.save({ session });

      vendor.currentBalance = round(
        Number(vendor.currentBalance || 0) + details.amount
      );

      // Serializes simultaneous bills/payments for this vendor.
      await vendor.save({ session });

      return { payable, replayed: false };
    });

    return res.status(result.replayed ? 200 : 201).json({
      success: true,
      message: result.replayed
        ? "This bill was already recorded. No duplicate was posted."
        : "Supplier bill created and posted successfully.",
      data: safePayable(result.payable),
    });
  } catch (error) {
    return sendError(res, error);
  }
};

const markAccountsPayablePaid = async (req, res) => {
  try {
    const body = req.body || {};

    const details = {
      payableNumber: text(
        req.params.payableNumber,
        "Payable number",
        200,
        true
      ),
      paymentAccountNumber: text(
        body.paymentAccountNumber,
        "Payment account",
        200,
        true
      ),
      paymentDate: validDate(body.paymentDate || todayYMD(), "Payment date"),
      paymentAmount: positiveMoney(body.paymentAmount, "Payment amount"),
      paymentMethod: text(
        body.paymentMethod || "Bank Transfer",
        "Payment method",
        100,
        true
      ),
      paymentReference: text(
        body.paymentReference,
        "Payment reference",
        200,
        true
      ),
      notes: text(body.notes, "Payment notes", 5000),
    };

    const paymentRequestId = `APPAY-${requestId(body.requestId)}`;
    const paymentRequestHash = hash({
      actor: getActor(req.user),
      ...details,
    });

    const result = await mongoose.connection.transaction(async (session) => {
      const previous = await AccountTransaction.findOne({
        paymentRequestId,
      }).session(session);

      if (previous) {
        if (previous.paymentRequestHash !== paymentRequestHash) {
          fail("This request ID was already used with different payment details.", 409);
        }

        const payable = await AccountsPayable.findOne({
          payableNumber: details.payableNumber,
        }).session(session);

        if (!payable) fail("The original payable could not be retrieved.", 409);

        return { payable, replayed: true };
      }

      const payable = await AccountsPayable.findOne({
        payableNumber: details.payableNumber,
      }).session(session);

      if (!payable) fail("Accounts payable record not found.", 404);

      if (payable.freightInvoiceNumber) {
        fail(
          "Record this payment through Financial → Freight Forwarder Invoices.",
          409
        );
      }

      if (
        !["Unpaid", "Partially Paid", "Overdue"].includes(payable.status) ||
        !["Not Required", "Approved"].includes(payable.approvalStatus)
      ) {
        fail("This payable is not available for payment.", 409);
      }

      const originalAmount = round(payable.amount);
      const alreadyPaid = round(payable.amountPaid);
      const balanceDue = round(payable.balanceDue);

      if (
        !Number.isFinite(originalAmount) ||
        !Number.isFinite(alreadyPaid) ||
        !Number.isFinite(balanceDue) ||
        originalAmount <= 0 ||
        alreadyPaid < 0 ||
        balanceDue <= 0 ||
        round(originalAmount - alreadyPaid) !== balanceDue
      ) {
        fail("The payable amounts are inconsistent. No payment was posted.", 409);
      }

      if (details.paymentDate < payable.payableDate) {
        fail("Payment date cannot precede the bill date.");
      }

      if (details.paymentAmount > balanceDue) {
        fail("Payment amount cannot exceed the remaining balance.", 409);
      }

      if (
        payable.paymentHistory.some(
          (entry) =>
            String(entry.paymentReference || "").trim().toUpperCase() ===
            details.paymentReference.toUpperCase()
        )
      ) {
        fail("This payment reference is already recorded against this bill.", 409);
      }

      const account = await FinancialAccount.findOne({
        accountNumber: details.paymentAccountNumber,
        status: "Active",
      }).session(session);

      if (
        !account ||
        String(account.currency || "JMD").toUpperCase() !== "JMD" ||
        String(account.baseCurrency || "JMD").toUpperCase() !== "JMD"
      ) {
        fail("Select an active JMD payment account.");
      }

      if (!account.linkedChartAccountCode) {
        fail("Payment account is not linked to the Chart of Accounts.");
      }

      const linkedCount = await FinancialAccount.countDocuments({
        linkedChartAccountCode: account.linkedChartAccountCode,
      }).session(session);

      if (linkedCount !== 1) {
        fail("Use a financial account with a dedicated chart-account link.");
      }

      if (
        account.accountType !== "Credit Card" &&
        Number(account.currentBalance || 0) < details.paymentAmount
      ) {
        fail("Insufficient balance in the selected payment account.");
      }

      const vendor = await Vendor.findOne({
        vendorCode: payable.vendorCode,
      }).session(session);

      if (!vendor) fail("Linked vendor not found.", 404);

      const journalEntry = await accountingService.payVendorBill({
        session,
        payable,
        paymentAccount: account,
        amount: details.paymentAmount,
        paymentDate: details.paymentDate,
        paymentReference: details.paymentReference,
        user: req.user,
      });

      const transactionNumber = `TXN-${crypto.randomUUID()}`;

      await AccountTransaction.create(
        [{
          transactionNumber,
          paymentRequestId,
          paymentRequestHash,
          paymentRequestActorId: getActor(req.user),
          accountNumber: account.accountNumber,
          accountName: account.accountName,
          linkedChartAccountCode: account.linkedChartAccountCode,
          journalEntryNumber: journalEntry.entryNumber,
          ledgerReference: payable.payableNumber,
          transactionType:
            account.accountType === "Credit Card"
              ? "Credit Card Charge"
              : "Expense Payment",
          amount: details.paymentAmount,
          paymentMethod: details.paymentMethod,
          reference: details.paymentReference,
          notes: details.notes || `Payment for ${payable.payableNumber}`,
          transactionDate: `${details.paymentDate}T12:00:00-05:00`,
          transactionCurrency: "JMD",
          foreignCurrencyAmount: 0,
          exchangeRate: 1,
        }],
        { session }
      );

      payable.amountPaid = round(alreadyPaid + details.paymentAmount);
      payable.balanceDue = round(balanceDue - details.paymentAmount);
      payable.status = payable.balanceDue === 0 ? "Paid" : "Partially Paid";
      payable.paymentAccountNumber = account.accountNumber;
      payable.paymentAccountName = account.accountName;
      payable.lastPaymentDate = details.paymentDate;

      payable.paymentHistory.push({
        paymentDate: details.paymentDate,
        paymentAmount: details.paymentAmount,
        paymentAccountNumber: account.accountNumber,
        paymentAccountName: account.accountName,
        paymentMethod: details.paymentMethod,
        paymentReference: details.paymentReference,
        journalEntryNumber: journalEntry.entryNumber,
        accountTransactionNumber: transactionNumber,
        notes: details.notes,
        paidBy: getUserName(req.user),
      });

      await payable.save({ session });

      vendor.currentBalance = round(
        Number(vendor.currentBalance || 0) - details.paymentAmount
      );
      await vendor.save({ session });

      return { payable, replayed: false };
    });

    return res.json({
      success: true,
      message: result.replayed
        ? "This payment was already recorded. No second payment was posted."
        : "Supplier payment recorded and posted successfully.",
      data: safePayable(result.payable),
    });
  } catch (error) {
    return sendError(res, error);
  }
};

module.exports = {
  getVendors,
  createVendor,
  getAccountsPayable,
  createAccountsPayable,
  markAccountsPayablePaid,
};