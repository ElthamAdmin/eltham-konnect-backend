const crypto = require("crypto");
const mongoose = require("mongoose");
const Invoice = require("../models/Invoice");
const Customer = require("../models/Customer");
const Package = require("../models/Package");
const JournalEntry = require("../models/JournalEntry");
const PointsHistory = require("../models/PointsHistory");
const CustomerNotification = require("../models/CustomerNotification");
const { writeAuditLog } = require("../utils/auditLogger");

const {
  postJournalEntry,
} = require("./accountingEngine/journalService");

const {
  SYSTEM_ACCOUNTS,
} = require("./accountingEngine/accountingConstants");

const { roundMoney } = require("./accountingEngine/money");

const fail = (message, statusCode = 409) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  throw error;
};

const jamaicaDate = () => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Jamaica",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const part = (type) =>
    parts.find((item) => item.type === type).value;

  return `${part("year")}-${part("month")}-${part("day")}`;
};

const applyInvoicePoints = async ({
  invoiceNumber,
  pointsToRedeem,
  req,
}) => {
  const requested = Number(pointsToRedeem);

  if (!Number.isSafeInteger(requested) || requested <= 0) {
    fail("Enter a positive whole number of EK points.", 400);
  }

  return mongoose.connection.transaction(async (session) => {
    const invoice = await Invoice.findOne({
      invoiceNumber,
    }).session(session);

    if (!invoice) fail("Invoice not found.", 404);

    if (!["Unpaid", "Partially Paid"].includes(invoice.status)) {
      fail(
        "EK points can only be applied to an unpaid or partially paid invoice."
      );
    }

    if (invoice.invoiceSource === "Storage") {
      fail(
        "Storage invoices cannot receive general EK-points adjustments."
      );
    }

    const customer = await Customer.findOne({
      ekonId: invoice.customerEkonId,
    }).session(session);

    if (!customer) fail("Customer not found.", 404);

    const pointsBalance = Number(customer.pointsBalance || 0);

    if (!Number.isFinite(pointsBalance) || pointsBalance < 500) {
      fail(
        "Customer must have at least 500 EK points to redeem.",
        400
      );
    }

    if (requested > pointsBalance) {
      fail("Customer does not have enough EK points.", 400);
    }

    const original = await JournalEntry.findOne({
      entryNumber: invoice.journalEntryNumber,
      status: "Posted",
    }).session(session);

    if (
      !original ||
      original.reference !== invoice.invoiceNumber
    ) {
      fail(
        "The original invoice journal needs review before points can be applied."
      );
    }

        const adjustments = await JournalEntry.find({
      reference: invoice.invoiceNumber,
      sourceModule: {
        $in: ["Invoice Points", "Invoice Charges"],
      },
    }).session(session);

    if (
      adjustments.some((entry) => entry.status !== "Posted")
    ) {
      fail(
        "A previous points journal needs review before another redemption."
      );
    }

    const arCode = SYSTEM_ACCOUNTS.ACCOUNTS_RECEIVABLE;

    const eligibleCodes = new Set(
      [
        SYSTEM_ACCOUNTS.SHIPPING_REVENUE,
        SYSTEM_ACCOUNTS.SHOPPING_SERVICE_REVENUE,
        SYSTEM_ACCOUNTS.DELIVERY_REVENUE,
        SYSTEM_ACCOUNTS.MARKETPLACE_REVENUE,
      ].filter(Boolean)
    );

    const revenue = new Map();
    let postedInvoiceTotal = 0;

    for (const entry of [original, ...adjustments]) {
      for (const line of entry.lines || []) {
        if (line.accountCode === arCode) {
          postedInvoiceTotal +=
            Number(line.debit || 0) -
            Number(line.credit || 0);
        }

        if (eligibleCodes.has(line.accountCode)) {
          revenue.set(
            line.accountCode,
            roundMoney(
              (revenue.get(line.accountCode) || 0) +
                Number(line.credit || 0) -
                Number(line.debit || 0)
            )
          );
        }
      }
    }

    const oldTotal = roundMoney(invoice.finalTotal);
    const paid = roundMoney(invoice.amountPaid);

    if (
      !Number.isFinite(oldTotal) ||
      !Number.isFinite(paid) ||
      paid < 0 ||
      oldTotal <= paid
    ) {
      fail("This invoice has no valid outstanding balance.");
    }

    if (roundMoney(postedInvoiceTotal) !== oldTotal) {
      fail(
        "Invoice total and posted accounting differ. Review the existing adjustments before redeeming more points."
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

    const availableRevenue = roundMoney(
      [...revenue.values()].reduce(
        (sum, value) => sum + Math.max(0, value),
        0
      )
    );

    const goodsRecovery = Math.max(
      0,
      roundMoney(invoice.customerPurchaseRecoveryAmount)
    );

    const redeemAmount = Math.floor(
      Math.min(
        requested,
        oldTotal - paid,
        availableRevenue,
        Math.max(0, oldTotal - goodsRecovery)
      )
    );

    if (redeemAmount <= 0) {
      fail(
        "No unpaid shipping or service fees remain eligible for EK points. Points cannot cover goods purchased for the customer."
      );
    }

    let remaining = redeemAmount;
    const lines = [];

    for (const [accountCode, available] of revenue) {
      const debit = roundMoney(
        Math.min(Math.max(0, available), remaining)
      );

      if (debit <= 0) continue;

      lines.push({
        accountCode,
        debit,
        credit: 0,
        description:
          `EK points redeemed on ${invoice.invoiceNumber}`,
      });

      remaining = roundMoney(remaining - debit);

      if (remaining === 0) break;
    }

    if (remaining !== 0) {
      fail("Could not allocate the EK-points adjustment.");
    }

    lines.push({
      accountCode: arCode,
      debit: 0,
      credit: redeemAmount,
      description:
        `Receivable reduced by EK points on ${invoice.invoiceNumber}`,
    });

    const today = jamaicaDate();

    const journal = await postJournalEntry({
      session,
      entryDate: today,
      reference: invoice.invoiceNumber,
      sourceModule: "Invoice Points",
      memo:
        `EK-points adjustment; original journal ${original.entryNumber}`,
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

    invoice.pointsRedeemed = roundMoney(
      Number(invoice.pointsRedeemed || 0) + redeemAmount
    );

    invoice.finalTotal = roundMoney(
      oldTotal - redeemAmount
    );

    invoice.balanceDue = roundMoney(
      invoice.finalTotal - paid
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

    customer.pointsBalance = roundMoney(
      pointsBalance - redeemAmount
    );

    customer.lastActivityDate = today;

    await invoice.save({ session });
    await customer.save({ session });

    await PointsHistory.create(
      [
        {
          customerEkonId: customer.ekonId,
          customerName: customer.name,
          action: `Redeemed on ${invoice.invoiceNumber}`,
          points: -redeemAmount,
          reference: invoice.invoiceNumber,
          note:
            `Applied JMD ${redeemAmount} in EK Points; ` +
            `adjustment journal ${journal.entryNumber}`,
          date: today,
        },
      ],
      { session }
    );

    await CustomerNotification.create(
      [
        {
          notificationNumber: `NTF-${crypto.randomUUID()}`,
          customerEkonId: customer.ekonId,
          customerName: customer.name,
          title: "EK Points Applied to Invoice",
          message:
            `JMD ${redeemAmount.toLocaleString()} in EK Points ` +
            `was applied to invoice ${invoice.invoiceNumber}. ` +
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

    await writeAuditLog({
      req,
      session,
      action: "APPLY_EK_POINTS_TO_INVOICE",
      module: "Invoices",
      description:
        `EK Points applied to invoice ${invoice.invoiceNumber}`,
      targetType: "Invoice",
      targetId: invoice.invoiceNumber,
      journalEntryNumber: journal.entryNumber,
      beforeValues: {
        finalTotal: oldTotal,
        pointsBalance,
      },
      afterValues: {
        finalTotal: invoice.finalTotal,
        balanceDue: invoice.balanceDue,
        pointsBalance: customer.pointsBalance,
      },
      metadata: {
        redeemAmount,
        originalJournalEntryNumber: original.entryNumber,
      },
    });

    return {
      invoice,
      customer,
      redeemAmount,
      journalEntryNumber: journal.entryNumber,
    };
  });
};

module.exports = { applyInvoicePoints };