const mongoose = require("mongoose");
const crypto = require("crypto");
const path = require("path");
const https = require("https");
const { pipeline } = require("stream");

const FreightInvoice = require("../models/FreightInvoice");
const AccountsPayable = require("../models/AccountsPayable");
const Vendor = require("../models/Vendor");
const Manifest = require("../models/Manifest");
const FinancialAccount = require("../models/FinancialAccount");
const AccountTransaction = require("../models/AccountTransaction");
const ChartOfAccount = require("../models/ChartOfAccount");

const { configureCloudinary } = require("../config/cloudinary");
const {
  postJournalEntry,
} = require("../services/accountingEngine/journalService");
const {
  SYSTEM_ACCOUNTS,
} = require("../services/accountingEngine/accountingConstants");

const fail = (message, statusCode = 400) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  throw error;
};

const userName = (user) =>
  user?.fullName || user?.name || user?.email || "System User";

const money = (value, label = "Amount") => {
  if (
    value === "" ||
    value === null ||
    value === undefined ||
    !["string", "number"].includes(typeof value)
  ) {
    fail(`${label} is required.`);
  }

  const number = Number(value);

  if (!Number.isFinite(number) || number < 0) {
    fail(`${label} must be a valid non-negative number.`);
  }

  const rounded = Math.round((number + Number.EPSILON) * 100) / 100;

  if (!Number.isSafeInteger(Math.round(rounded * 100))) {
    fail(`${label} is too large.`);
  }

  if (Math.abs(number - rounded) > 0.0000001) {
    fail(`${label} must have no more than two decimal places.`);
  }

  return rounded;
};

const round = (value) =>
  Math.round((Number(value) + Number.EPSILON) * 100) / 100;

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

const dateOnly = (value, label) => {
  const result = text(value, label, 10, true);
  const date = new Date(`${result}T00:00:00.000Z`);

  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(result) ||
    Number.isNaN(date.getTime()) ||
    date.toISOString().slice(0, 10) !== result
  ) {
    fail(`${label} must be a valid date.`);
  }

  return result;
};

const parsePayload = (req) => {
  try {
    const payload = JSON.parse(req.body.payload || "{}");

    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      fail("Invalid form data.");
    }

    return payload;
  } catch (error) {
    if (error.statusCode) throw error;
    fail("The form data could not be read.");
  }
};

const detectType = (buffer) => {
  if (!Buffer.isBuffer(buffer) || !buffer.length) return null;

  if (buffer.subarray(0, 5).toString("ascii") === "%PDF-") {
    return { extension: ".pdf", mimeType: "application/pdf" };
  }

  if (
    buffer.length >= 3 &&
    buffer[0] === 0xff &&
    buffer[1] === 0xd8 &&
    buffer[2] === 0xff
  ) {
    return { extension: ".jpg", mimeType: "image/jpeg" };
  }

  const png = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  ]);

  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(png)) {
    return { extension: ".png", mimeType: "image/png" };
  }

  if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
    buffer.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return { extension: ".webp", mimeType: "image/webp" };
  }

  return null;
};

const storeAttachment = async (file) => {
  if (!file) return undefined;

  const detected = detectType(file.buffer);

  if (!detected) {
    fail("The attachment must be a valid PDF, JPG, PNG or WEBP file.");
  }

  const cloudinary = configureCloudinary();
  const publicId =
    `ekos/freight-invoices/${crypto.randomUUID()}${detected.extension}`;

  let asset;

  try {
    asset = await new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          resource_type: "raw",
          type: "authenticated",
          public_id: publicId,
          overwrite: false,
        },
        (error, result) => {
          if (error) return reject(error);
          resolve(result);
        }
      );

      stream.on("error", reject);
      stream.end(file.buffer);
    });
  } catch (error) {
    console.error("Freight attachment upload failed:", error.message);
    fail("Attachment storage is temporarily unavailable.", 502);
  }

  const originalName = String(file.originalname || "document")
    .split(/[\\/]/)
    .pop()
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .slice(0, 180);

  return {
    publicId: asset.public_id,
    fileName:
      `${path.parse(originalName).name || "document"}${detected.extension}`,
    mimeType: detected.mimeType,
    fileSize: file.size,
  };
};

const cleanupUnreferencedAttachment = async (attachment) => {
  if (!attachment) return;

  try {
    const referenced = await FreightInvoice.exists({
      $or: [
        { "invoiceAttachment.publicId": attachment.publicId },
        { "paymentHistory.proof.publicId": attachment.publicId },
      ],
    });

    if (!referenced) {
      await configureCloudinary().uploader.destroy(attachment.publicId, {
        resource_type: "raw",
        type: "authenticated",
        invalidate: true,
      });
    }
  } catch (error) {
    console.error("Freight attachment cleanup deferred:", error.message);
  }
};

const safeInvoice = (document) => {
  const result = document.toObject
    ? document.toObject()
    : JSON.parse(JSON.stringify(document));

  if (result.invoiceAttachment) {
    delete result.invoiceAttachment.publicId;
  }

  for (const payment of result.paymentHistory || []) {
    delete payment.requestHash;

    if (payment.proof) {
      delete payment.proof.publicId;
    }
  }

  return result;
};

const sendError = (res, error) => {
  console.error("Freight invoice error:", error.message);

  return res.status(
    error.code === 11000 ? 409 : error.statusCode || 500
  ).json({
    success: false,
    message:
      error.code === 11000
        ? "This invoice or payment request already exists. Refresh before retrying."
        : error.statusCode
        ? error.message
        : "Could not confirm the operation. Refresh invoices before retrying.",
  });
};

const expenseAccount = async (accountCode, session) => {
  const account = await ChartOfAccount.findOne({
    accountCode,
    status: "Active",
  }).session(session);

  if (
    !account ||
    !/expense|cost/i.test(String(account.accountCategory || ""))
  ) {
    fail("Select an active expense or cost account.");
  }

  return account;
};

const getFreightInvoices = async (req, res) => {
  try {
    const invoices = await FreightInvoice.find()
      .sort({ invoiceDate: -1, createdAt: -1 })
      .lean();

    res.setHeader("Cache-Control", "private, no-store");

    return res.json({
      success: true,
      data: invoices.map(safeInvoice),
    });
  } catch (error) {
    return sendError(res, error);
  }
};

const createFreightInvoice = async (req, res) => {
  let attachment;

  try {
    const body = parsePayload(req);
    const vendorCode = text(body.vendorCode, "Vendor", 200, true);
    const supplierInvoiceNumber = text(
      body.supplierInvoiceNumber,
      "Supplier invoice number",
      200,
      true
    );
    const supplierInvoiceKey = supplierInvoiceNumber.toUpperCase();
    const invoiceDate = dateOnly(body.invoiceDate, "Invoice date");
    const dueDate = dateOnly(body.dueDate, "Due date");
    const currency = text(body.currency, "Currency", 3, true).toUpperCase();

    if (!["JMD", "USD"].includes(currency)) {
      fail("Invoice currency must be JMD or USD.");
    }

    if (dueDate < invoiceDate) {
      fail("Due date cannot be earlier than the invoice date.");
    }

    const exchangeRate =
      currency === "JMD" ? 1 : Number(body.exchangeRate);

    if (
      !Number.isFinite(exchangeRate) ||
      exchangeRate <= 0 ||
      exchangeRate > 1000000
    ) {
      fail("Enter a valid JMD-per-USD invoice exchange rate.");
    }

    const packageCount = Number(body.packageCount);
    const totalWeight = Number(body.totalWeight);

    if (!Number.isSafeInteger(packageCount) || packageCount < 0) {
      fail("Package count must be a non-negative whole number.");
    }

    if (!Number.isFinite(totalWeight) || totalWeight < 0) {
      fail("Total weight must be a valid non-negative number.");
    }

    if (
      !Array.isArray(body.trackingNumbers) ||
      body.trackingNumbers.length > 1000
    ) {
      fail("Tracking numbers must be a list of up to 1,000 entries.");
    }

    const trackingNumbers = body.trackingNumbers.map((value) =>
      text(value, "Tracking number", 200, true)
    );

    if (
      new Set(trackingNumbers.map((value) => value.toUpperCase())).size !==
      trackingNumbers.length
    ) {
      fail("Remove duplicate tracking numbers.");
    }

    if (trackingNumbers.length && trackingNumbers.length !== packageCount) {
      fail("Package count must match the supplied tracking-number list.");
    }

    if (
      !Array.isArray(body.charges) ||
      !body.charges.length ||
      body.charges.length > 100
    ) {
      fail("Enter between 1 and 100 charge lines.");
    }

    const charges = body.charges.map((line) => {
      if (!line || typeof line !== "object") fail("Invalid charge line.");

      const category = text(line.category, "Charge category", 30, true);

      if (!["Warehousing", "Freight", "Surcharge", "Other"].includes(category)) {
        fail("Invalid charge category.");
      }

      return {
        category,
        description: text(line.description, "Charge description", 1000),
        amount: money(line.amount, "Charge amount"),
      };
    });

    const total = round(charges.reduce((sum, line) => sum + line.amount, 0));
    const baseCurrencyAmount = round(total * exchangeRate);

    if (total <= 0 || baseCurrencyAmount <= 0) {
      fail("The invoice total must be greater than zero.");
    }

    if (!Number.isSafeInteger(Math.round(baseCurrencyAmount * 100))) {
      fail("The converted invoice total is too large.");
    }

    const postingAccountCode = text(
      body.expenseAccountCode,
      "Expense account code",
      50,
      true
    );
    const manifestNumber = text(body.manifestNumber, "Manifest number");
    const notes = text(body.notes, "Notes", 5000);

    attachment = await storeAttachment(req.file);

    const freightInvoiceNumber = `FWI-${crypto.randomUUID()}`;
    const payableNumber = `AP-${crypto.randomUUID()}`;

    const invoice = await mongoose.connection.transaction(async (session) => {
      const vendor = await Vendor.findOne({
        vendorCode,
        vendorType: "Freight Forwarder",
        status: "Active",
      }).session(session);

      if (!vendor) fail("Active freight-forwarder vendor not found.", 404);

      const existingInvoice = await FreightInvoice.exists({
        vendorCode,
        supplierInvoiceKey,
      }).session(session);

      const escapedNumber = supplierInvoiceNumber.replace(
        /[.*+?^${}()|[\]\\]/g,
        "\\$&"
      );

      const existingPayable = await AccountsPayable.exists({
        vendorCode,
        billNumber: {
          $regex: `^\\s*${escapedNumber}\\s*$`,
          $options: "i",
        },
      }).session(session);

      if (existingInvoice || existingPayable) {
        fail("This supplier invoice is already recorded.", 409);
      }

      if (manifestNumber) {
        const manifest = await Manifest.exists({ manifestNumber })
          .session(session);

        if (!manifest) fail("The specified manifest was not found.", 404);
      }

      const account = await expenseAccount(postingAccountCode, session);

      const [payable] = await AccountsPayable.create(
        [{
          payableNumber,
          freightInvoiceNumber,
          vendorCode,
          vendorName: vendor.vendorName,
          billNumber: supplierInvoiceNumber,
          payableDate: invoiceDate,
          dueDate,
          description:
            `Freight invoice ${supplierInvoiceNumber}: ` +
            `${currency} ${total.toFixed(2)}; ` +
            `JMD rate ${exchangeRate}`,
          expenseAccountCode: account.accountCode,
          expenseAccountName: account.accountName,
          amount: baseCurrencyAmount,
          amountPaid: 0,
          balanceDue: baseCurrencyAmount,
          status: "Unpaid",
          approvalStatus: "Not Required",
          notes,
          createdBy: userName(req.user),
        }],
        { session }
      );

      const journal = await postJournalEntry({
        session,
        entryDate: invoiceDate,
        memo: `Freight invoice from ${vendor.vendorName}`,
        reference: payableNumber,
        sourceModule: "Accounts Payable",
        createdBy: userName(req.user),
        lines: [
          {
            accountCode: account.accountCode,
            debit: baseCurrencyAmount,
            credit: 0,
            description: `${supplierInvoiceNumber} freight costs`,
          },
          {
            accountCode: SYSTEM_ACCOUNTS.ACCOUNTS_PAYABLE,
            debit: 0,
            credit: baseCurrencyAmount,
            description: `${supplierInvoiceNumber} supplier liability`,
          },
        ],
      });

      payable.journalEntryNumber = journal.entryNumber;
      await payable.save({ session });

      vendor.currentBalance = round(
        Number(vendor.currentBalance || 0) + baseCurrencyAmount
      );
      await vendor.save({ session });

      const [record] = await FreightInvoice.create(
        [{
          freightInvoiceNumber,
          vendorCode,
          vendorName: vendor.vendorName,
          supplierInvoiceNumber,
          supplierInvoiceKey,
          invoiceDate,
          dueDate,
          currency,
          exchangeRate,
          packageCount,
          totalWeight,
          trackingNumbers,
          manifestNumber,
          charges,
          total,
          amountPaid: 0,
          balanceDue: total,
          baseCurrencyAmount,
          expenseAccountCode: account.accountCode,
          payableNumber,
          journalEntryNumber: journal.entryNumber,
          invoiceAttachment: attachment,
          notes,
          createdBy: userName(req.user),
        }],
        { session }
      );

      return record;
    });

    return res.status(201).json({
      success: true,
      message: "Freight invoice saved and posted.",
      data: safeInvoice(invoice),
    });
  } catch (error) {
    await cleanupUnreferencedAttachment(attachment);
    return sendError(res, error);
  }
};

const recordFreightPayment = async (req, res) => {
  let proof;

  try {
    const body = parsePayload(req);
    const requestId = text(body.requestId, "Payment request ID", 100, true);

    if (!/^[a-zA-Z0-9_-]{10,100}$/.test(requestId)) {
      fail("Invalid payment request ID.");
    }

    const paymentDate = dateOnly(body.paymentDate, "Payment date");
    const invoiceCurrencyAmount = money(
      body.invoiceCurrencyAmount,
      "Invoice amount settled"
    );
    const actualJmdAmount = money(body.actualJmdAmount, "Actual JMD paid");

    if (invoiceCurrencyAmount <= 0 || actualJmdAmount <= 0) {
      fail("Both payment amounts must be greater than zero.");
    }

    const paymentAccountNumber = text(
      body.paymentAccountNumber,
      "Payment account",
      200,
      true
    );
    const paymentReference = text(
      body.paymentReference,
      "Payment reference",
      200,
      true
    );
    const paymentMethod = text(
      body.paymentMethod,
      "Payment method",
      100,
      true
    );
    const notes = text(body.notes, "Payment notes", 5000);
    const adjustmentCode = text(
      body.exchangeAdjustmentAccountCode,
      "Exchange adjustment account code",
      50
    );

    const actor = String(
      req.user?.userId || req.user?._id || req.user?.email || userName(req.user)
    );

    const requestHash = crypto.createHash("sha256").update(
      JSON.stringify({
        invoice: req.params.freightInvoiceNumber,
        actor,
        paymentDate,
        invoiceCurrencyAmount,
        actualJmdAmount,
        paymentAccountNumber,
        paymentReference,
        paymentMethod,
        notes,
        adjustmentCode,
        file: req.file
          ? crypto.createHash("sha256").update(req.file.buffer).digest("hex")
          : "",
      })
    ).digest("hex");

    proof = await storeAttachment(req.file);

    const result = await mongoose.connection.transaction(async (session) => {
      const invoice = await FreightInvoice.findOne({
        freightInvoiceNumber: req.params.freightInvoiceNumber,
      }).session(session);

      if (!invoice) fail("Freight invoice not found.", 404);

      const previous = invoice.paymentHistory.find(
        (payment) => payment.requestId === requestId
      );

      if (previous) {
        if (previous.requestHash !== requestHash) {
          fail("This payment request was already used with different details.", 409);
        }

        return { invoice, replayed: true };
      }

      if (invoice.status === "Paid") {
        fail("This freight invoice is already paid.", 409);
      }

      if (paymentDate < invoice.invoiceDate) {
        fail("Payment date cannot precede the invoice date.");
      }

      if (invoiceCurrencyAmount > round(invoice.balanceDue)) {
        fail("The payment exceeds the remaining invoice balance.", 409);
      }

      if (
        invoice.paymentHistory.some(
          (payment) =>
            payment.paymentReference.trim().toUpperCase() ===
            paymentReference.toUpperCase()
        )
      ) {
        fail("This payment reference is already recorded for the invoice.", 409);
      }

      if (
        invoice.currency === "JMD" &&
        actualJmdAmount !== invoiceCurrencyAmount
      ) {
        fail("For a JMD invoice, the settled amount and actual JMD paid must match.");
      }

      const payable = await AccountsPayable.findOne({
        payableNumber: invoice.payableNumber,
        freightInvoiceNumber: invoice.freightInvoiceNumber,
      }).session(session);

      if (
        !payable ||
        ["Draft", "Void", "Paid"].includes(payable.status) ||
        !["Not Required", "Approved"].includes(payable.approvalStatus)
      ) {
        fail("The linked payable is missing or not available for payment.", 409);
      }

      const vendor = await Vendor.findOne({
        vendorCode: invoice.vendorCode,
      }).session(session);

      if (!vendor) fail("The linked vendor was not found.", 404);

      const account = await FinancialAccount.findOne({
        accountNumber: paymentAccountNumber,
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
        fail("The payment account must be linked to the Chart of Accounts.");
      }

      const linkedAccounts = await FinancialAccount.countDocuments({
        linkedChartAccountCode: account.linkedChartAccountCode,
      }).session(session);

      if (linkedAccounts !== 1) {
        fail(
          "This chart account is linked to multiple financial accounts. Use an account with a dedicated chart link."
        );
      }

      const fullySettled = invoiceCurrencyAmount === round(invoice.balanceDue);
      const carryingJmdAmount = fullySettled
        ? round(payable.balanceDue)
        : round(invoiceCurrencyAmount * invoice.exchangeRate);

      if (
        carryingJmdAmount <= 0 ||
        carryingJmdAmount > round(payable.balanceDue)
      ) {
        fail("The linked payable balance needs review before recording this payment.", 409);
      }

      const exchangeDifference = round(actualJmdAmount - carryingJmdAmount);

      const lines = [
        {
          accountCode: SYSTEM_ACCOUNTS.ACCOUNTS_PAYABLE,
          debit: carryingJmdAmount,
          credit: 0,
          description: `${invoice.supplierInvoiceNumber} liability settled`,
        },
        {
          accountCode: account.linkedChartAccountCode,
          debit: 0,
          credit: actualJmdAmount,
          description: `${invoice.supplierInvoiceNumber} actual JMD payment`,
        },
      ];

      let exchangeAdjustmentAccountCode = "";

      if (exchangeDifference !== 0) {
        exchangeAdjustmentAccountCode =
          adjustmentCode || invoice.expenseAccountCode;

        const adjustmentAccount = await expenseAccount(
          exchangeAdjustmentAccountCode,
          session
        );

        lines.push({
          accountCode: adjustmentAccount.accountCode,
          debit: exchangeDifference > 0 ? exchangeDifference : 0,
          credit: exchangeDifference < 0 ? -exchangeDifference : 0,
          description:
            `${invoice.supplierInvoiceNumber} exchange adjustment`,
        });
      }

      const journal = await postJournalEntry({
        session,
        entryDate: paymentDate,
        memo: `Freight invoice payment to ${invoice.vendorName}`,
        reference: paymentReference,
        sourceModule: "Accounts Payable",
        createdBy: userName(req.user),
        lines,
      });

      const accountTransactionNumber = `TXN-${crypto.randomUUID()}`;

      await AccountTransaction.create(
        [{
          transactionNumber: accountTransactionNumber,
          paymentRequestId: `FREIGHT-${requestId}`,
          paymentRequestHash: requestHash,
          paymentRequestActorId: actor,
          accountNumber: account.accountNumber,
          accountName: account.accountName,
          linkedChartAccountCode: account.linkedChartAccountCode,
          journalEntryNumber: journal.entryNumber,
          ledgerReference: payable.payableNumber,
          transactionType:
            account.accountType === "Credit Card"
              ? "Credit Card Charge"
              : "Expense Payment",
          amount: actualJmdAmount,
          paymentMethod,
          reference: paymentReference,
          notes: notes || `Freight invoice ${invoice.supplierInvoiceNumber}`,
          transactionDate: `${paymentDate}T12:00:00-05:00`,
          transactionCurrency: "JMD",
          foreignCurrencyAmount: 0,
          exchangeRate: 1,
        }],
        { session }
      );

      payable.amountPaid = round(payable.amountPaid + carryingJmdAmount);
      payable.balanceDue = round(payable.balanceDue - carryingJmdAmount);
      payable.status = fullySettled ? "Paid" : "Partially Paid";
      payable.paymentAccountNumber = account.accountNumber;
      payable.paymentAccountName = account.accountName;
      payable.lastPaymentDate = paymentDate;

      payable.paymentHistory.push({
        paymentDate,
        paymentAmount: carryingJmdAmount,
        paymentAccountNumber: account.accountNumber,
        paymentAccountName: account.accountName,
        paymentMethod,
        paymentReference,
        journalEntryNumber: journal.entryNumber,
        accountTransactionNumber,
        notes:
          `${invoice.currency} ${invoiceCurrencyAmount.toFixed(2)} settled; ` +
          `actual JMD ${actualJmdAmount.toFixed(2)}; ` +
          `exchange adjustment JMD ${exchangeDifference.toFixed(2)}. ${notes}`,
        paidBy: userName(req.user),
      });

      await payable.save({ session });

      vendor.currentBalance = round(
        Number(vendor.currentBalance || 0) - carryingJmdAmount
      );
      await vendor.save({ session });

      invoice.amountPaid = round(invoice.amountPaid + invoiceCurrencyAmount);
      invoice.balanceDue = round(invoice.balanceDue - invoiceCurrencyAmount);
      invoice.status = fullySettled ? "Paid" : "Partially Paid";

      invoice.paymentHistory.push({
        requestId,
        requestHash,
        paymentDate,
        invoiceCurrencyAmount,
        actualJmdAmount,
        carryingJmdAmount,
        exchangeDifference,
        exchangeAdjustmentAccountCode,
        paymentAccountNumber,
        paymentAccountName: account.accountName,
        paymentMethod,
        paymentReference,
        journalEntryNumber: journal.entryNumber,
        accountTransactionNumber,
        paidBy: userName(req.user),
        notes,
        proof,
      });

      await invoice.save({ session });

      return { invoice, replayed: false };
    });

    if (result.replayed) {
      await cleanupUnreferencedAttachment(proof);
    }

    return res.json({
      success: true,
      message: result.replayed
        ? "This payment was already recorded. No second payment was posted."
        : "Freight payment recorded and posted.",
      data: safeInvoice(result.invoice),
    });
  } catch (error) {
    await cleanupUnreferencedAttachment(proof);
    return sendError(res, error);
  }
};

const openFreightAttachment = async (req, res) => {
  try {
    const invoice = await FreightInvoice.findOne({
      freightInvoiceNumber: req.params.freightInvoiceNumber,
    }).lean();

    if (!invoice) fail("Freight invoice not found.", 404);

    let attachment;

    if (req.params.documentType === "invoice") {
      attachment = invoice.invoiceAttachment;
    } else if (req.params.documentType === "payment") {
      attachment = invoice.paymentHistory.find(
        (payment) => String(payment._id) === req.params.paymentId
      )?.proof;
    }

    if (!attachment?.publicId) fail("Attachment not found.", 404);

    const signedUrl = configureCloudinary().utils.private_download_url(
      attachment.publicId,
      "",
      {
        resource_type: "raw",
        type: "authenticated",
        expires_at: Math.floor(Date.now() / 1000) + 120,
        attachment: false,
        secure: true,
      }
    );

    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");

    const upstream = https.get(signedUrl, (response) => {
      if (res.destroyed) {
        response.destroy();
        return;
      }

      if (response.statusCode !== 200) {
        response.resume();

        return res.status(502).json({
          success: false,
          message: "Document storage could not return this attachment.",
        });
      }

      res.setHeader("Content-Type", attachment.mimeType);
      res.setHeader("Content-Disposition", "inline");

      pipeline(response, res, (error) => {
        if (error) console.error("Freight document stream:", error.message);
      });
    });

    upstream.setTimeout(30000, () =>
      upstream.destroy(new Error("Document request timed out."))
    );

    upstream.on("error", (error) => {
      console.error("Freight document download:", error.message);

      if (!res.headersSent && !res.destroyed) {
        res.status(502).json({
          success: false,
          message: "Document storage is temporarily unavailable.",
        });
      } else if (!res.destroyed) {
        res.destroy();
      }
    });

    res.on("close", () => upstream.destroy());
  } catch (error) {
    if (!res.headersSent && !res.destroyed) {
      return sendError(res, error);
    }
  }
};

module.exports = {
  getFreightInvoices,
  createFreightInvoice,
  recordFreightPayment,
  openFreightAttachment,
};