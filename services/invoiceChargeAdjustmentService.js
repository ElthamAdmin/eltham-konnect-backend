const crypto = require("crypto");
const mongoose = require("mongoose");
const Invoice = require("../models/Invoice");
const Package = require("../models/Package");
const JournalEntry = require("../models/JournalEntry");
const CustomerNotification = require("../models/CustomerNotification");
const {
  allocatePurchaseInvoiceCharges,
} = require("./purchaseInvoiceChargeAllocationService");
const { writeAuditLog } = require("../utils/auditLogger");

const {
  postJournalEntry,
} = require("./accountingEngine/journalService");

const {
  SYSTEM_ACCOUNTS: A,
} = require("./accountingEngine/accountingConstants");

const { roundMoney } = require("./accountingEngine/money");

const {
  assertCollectibleBalance,
  getPostedWriteOffAmount,
} = require("./arBalanceService");

const fail = (message, statusCode = 409) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  throw error;
};

const chargeFields = [
  "customsDuty",
  "gct",
  "processingFee",
  "deliveryFee",
  "otherAdjustment",
];

const dateInJamaica = () => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Jamaica",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  return ["year", "month", "day"]
    .map((type) =>
      parts.find((part) => part.type === type).value
    )
    .join("-");
};

const updateInvoiceCharges = async ({
  invoiceNumber,
  changes = {},
  req,
}) =>
  mongoose.connection.transaction(async (session) => {
    const invoice = await Invoice.findOne({
      invoiceNumber,
    }).session(session);

    if (!invoice) fail("Invoice not found.", 404);

    if (!["Unpaid", "Partially Paid"].includes(invoice.status)) {
      fail(
        "Charges can only be edited on unpaid or partially paid invoices."
      );
    }

    if (invoice.invoiceSource === "Storage") {
      fail(
        "Storage invoices cannot receive general charge adjustments."
      );
    }

        assertCollectibleBalance(invoice);
    const writeOffAmount = getPostedWriteOffAmount(invoice);

        if (
      invoice.invoiceSource === "Combined" ||
      (
        invoice.customerPurchases?.length &&
        invoice.invoiceSource !== "Customer Purchases"
      )
    ) {
      fail(
        "Combined or incorrectly linked purchase invoices require a separate allocation review."
      );
    }


    const original = await JournalEntry.findOne({
      entryNumber: invoice.journalEntryNumber,
      status: "Posted",
    }).session(session);

        if (
      !original ||
      original.reversalEntryNumber ||
      original.reversedAt ||
      original.reference !== invoice.invoiceNumber
    ) {
      fail(
        "The original invoice journal needs review before charges can be edited."
      );
    }

    const adjustments = await JournalEntry.find({
      reference: invoice.invoiceNumber,
      sourceModule: {
        $in: ["Invoice Points", "Invoice Charges"],
      },
    }).session(session);

    if (
            adjustments.some(
        (entry) =>
          entry.status !== "Posted" ||
          entry.reversalEntryNumber ||
          entry.reversedAt
      )
    ) {
      fail("An earlier invoice adjustment journal needs review.");
    }

    const ledgerTotal = roundMoney(
      [original, ...adjustments].reduce(
        (sum, entry) =>
          sum +
          (entry.lines || []).reduce(
            (value, line) =>
              value +
              (line.accountCode === A.ACCOUNTS_RECEIVABLE
                ? Number(line.debit || 0) -
                  Number(line.credit || 0)
                : 0),
            0
          ),
        0
      )
    );

    const oldTotal = roundMoney(invoice.finalTotal);
    const paid = roundMoney(invoice.amountPaid);

    if (
      !Number.isFinite(oldTotal) ||
      !Number.isFinite(paid) ||
      paid < 0 ||
      ledgerTotal !== oldTotal
    ) {
      fail(
        "Invoice total and posted accounting differ. Review the existing adjustments before editing charges."
      );
    }

    const invoiceEntityCode = String(
      invoice.entityCode ||
        invoice.entitySnapshot?.entityCode ||
        ""
    ).trim();

    if (
      invoiceEntityCode &&
      invoiceEntityCode !==
        String(original.entityCode || "").trim()
    ) {
      fail(
        "Invoice and original journal entity attribution need review."
      );
    }

    const before = {
      finalTotal: oldTotal,
      balanceDue: invoice.balanceDue,
      deliveryType: invoice.deliveryType || "",
      adjustmentNote: invoice.adjustmentNote || "",
    };

    const next = {};
    const deltas = {};
    let totalDelta = 0;

    for (const field of chargeFields) {
      const previous = Number(invoice[field] || 0);

      const value =
        Object.prototype.hasOwnProperty.call(changes, field)
          ? Number(changes[field])
          : previous;

      if (
        !Number.isFinite(previous) ||
        !Number.isFinite(value) ||
        (field !== "otherAdjustment" && value < 0)
      ) {
        fail(`Enter a valid amount for ${field}.`, 400);
      }

      before[field] = roundMoney(previous);
      next[field] = roundMoney(value);
      deltas[field] = roundMoney(
        next[field] - before[field]
      );

      totalDelta = roundMoney(
        totalDelta + deltas[field]
      );
    }

    const newTotal = roundMoney(oldTotal + totalDelta);

    const goodsRecovery = Math.max(
      0,
      roundMoney(invoice.customerPurchaseRecoveryAmount)
    );

        if (
      newTotal < 0 ||
      newTotal < roundMoney(paid + writeOffAmount) ||
      newTotal < goodsRecovery
    ) {
      fail(
        "The edited total cannot be below zero, cash payments plus posted write-offs, or the customer-purchase goods amount."
      );
    }

    const purchaseInvoice =
      invoice.invoiceSource === "Customer Purchases";

    const originalCodes = new Set(
      (original.lines || []).map((line) => line.accountCode)
    );

    if (
      !purchaseInvoice &&
      [...originalCodes].some(
        (code) =>
          code !== A.ACCOUNTS_RECEIVABLE &&
          code !== A.SHIPPING_REVENUE
      )
    ) {
      fail(
        "This invoice uses a different original posting layout and needs review before editing charges."
      );
    }

    const accountMap = purchaseInvoice
      ? {
          customsDuty: A.MARKETPLACE_REVENUE,
          gct: A.GCT_OUTPUT_TAX_PAYABLE,
          processingFee: A.SHOPPING_SERVICE_REVENUE,
          deliveryFee: A.DELIVERY_REVENUE,
          otherAdjustment: A.MARKETPLACE_REVENUE,
        }
      : Object.fromEntries(
          chargeFields.map((field) => [
            field,
            A.SHIPPING_REVENUE,
          ])
        );

    const accountChanges = new Map();

    for (const field of chargeFields) {
      if (!deltas[field]) continue;

      const code = accountMap[field];

      if (!code) {
        fail(`No posting account is configured for ${field}.`);
      }

      accountChanges.set(
        code,
        roundMoney(
          (accountChanges.get(code) || 0) + deltas[field]
        )
      );
    }

    const lines = [...accountChanges]
      .filter(([, delta]) => delta !== 0)
      .map(([accountCode, delta]) => ({
        accountCode,
        debit: delta < 0 ? -delta : 0,
        credit: delta > 0 ? delta : 0,
        description:
          `Charge adjustment for ${invoice.invoiceNumber}`,
      }));

    if (totalDelta !== 0) {
      lines.push({
        accountCode: A.ACCOUNTS_RECEIVABLE,
        debit: totalDelta > 0 ? totalDelta : 0,
        credit: totalDelta < 0 ? -totalDelta : 0,
        description:
          `Invoice receivable adjustment for ${invoice.invoiceNumber}`,
      });
    }

    const today = dateInJamaica();
    let journal = null;

    if (lines.length) {
      journal = await postJournalEntry({
        session,
        entryDate: today,
        reference: invoice.invoiceNumber,
        sourceModule: "Invoice Charges",
        memo:
          `Charge adjustment; original journal ${original.entryNumber}`,
        entityId: original.entityId || null,
        entityCode: original.entityCode || "",
        entitySnapshot: original.entitySnapshot || null,
        createdBy:
          req?.user?.fullName ||
          req?.user?.name ||
          req?.user?.email ||
          "System User",
        lines,
      });
    }

        if (purchaseInvoice) {
      await allocatePurchaseInvoiceCharges({
        invoice,
        next,
        newTotal,
        session,
        user: req?.user,
      });
    }

    Object.assign(invoice, next);

    for (const field of ["deliveryType", "adjustmentNote"]) {
      if (
        Object.prototype.hasOwnProperty.call(changes, field)
      ) {
        invoice[field] = String(changes[field] || "").trim();
      }
    }

    if (purchaseInvoice) {
      invoice.shoppingAssistanceFee = invoice.processingFee;
      invoice.customerPurchaseCustomsDuty = invoice.customsDuty;
      invoice.customerPurchaseDeliveryFee = invoice.deliveryFee;
      invoice.customerPurchaseOtherCharges =
        invoice.otherAdjustment;
    }

    if (Number(invoice.posDiscountAmount || 0) > 0) {
      invoice.prePosDiscountTotal = roundMoney(
        newTotal + Number(invoice.posDiscountAmount)
      );
    }

    invoice.finalTotal = newTotal;
        invoice.balanceDue = roundMoney(
      newTotal - paid - writeOffAmount
    );

    invoice.status =
      invoice.balanceDue === 0
        ? "Paid"
        : paid > 0
          ? "Partially Paid"
          : "Unpaid";

    if (invoice.status === "Paid") {
      invoice.paidDate = today;
      invoice.paidAt = new Date();
    }

    await invoice.save({ session });

    if (invoice.status === "Paid") {
      const trackingNumbers = (invoice.packages || [])
        .map((pkg) => pkg.trackingNumber)
        .filter(Boolean);

      if (trackingNumbers.length) {
        await Package.updateMany(
          {
            customerEkonId: invoice.customerEkonId,
            trackingNumber: { $in: trackingNumbers },
          },
          {
            $set: { invoiceStatus: "Paid" },
          },
          { session }
        );
      }
    }

    await CustomerNotification.create(
      [
        {
          notificationNumber: `NTF-${crypto.randomUUID()}`,
          customerEkonId: invoice.customerEkonId,
          customerName: invoice.customerName,
          title: "Invoice Charges Updated",
          message:
            `Invoice ${invoice.invoiceNumber} was updated. ` +
            `New balance: JMD ${invoice.balanceDue.toLocaleString()}.`,
          type: "Invoice Update",
          referenceType: "Invoice",
          referenceId: invoice.invoiceNumber,
          isRead: false,
          date: today,
        },
      ],
      { session }
    );

    await writeAuditLog({
      req,
      session,
      action: "UPDATE_INVOICE_CHARGES",
      module: "Invoices",
      description:
        `Invoice charges updated for ${invoice.invoiceNumber}`,
      targetType: "Invoice",
      targetId: invoice.invoiceNumber,
      journalEntryNumber: journal?.entryNumber || "",
      beforeValues: before,
      afterValues: {
        ...next,
        finalTotal: newTotal,
        balanceDue: invoice.balanceDue,
        deliveryType: invoice.deliveryType,
        adjustmentNote: invoice.adjustmentNote,
      },
      metadata: {
        originalJournalEntryNumber: original.entryNumber,
        totalDelta,
      },
    });

    return {
      invoice,
      journalEntryNumber: journal?.entryNumber || "",
    };
  });

module.exports = { updateInvoiceCharges };