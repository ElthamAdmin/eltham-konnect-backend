const crypto = require("crypto");
const mongoose = require("mongoose");

const Purchase = require("../models/CustomerPurchase");
const Refund = require("../models/CustomerPurchaseRefund");
const Invoice = require("../models/Invoice");
const Package = require("../models/Package");
const Journal = require("../models/JournalEntry");
const Account = require("../models/FinancialAccount");
const Chart = require("../models/ChartOfAccount");
const Transaction = require("../models/AccountTransaction");

const {
  postJournalEntry,
} = require("./accountingEngine/journalService");

const {
  SYSTEM_ACCOUNTS: A,
} = require("./accountingEngine/accountingConstants");

const { writeAuditLog } = require("../utils/auditLogger");

const fail = (message) => {
  const error = new Error(message);
  error.statusCode = 409;
  throw error;
};

const money = (value, label = "Amount") => {
  const number = Number(value);
  const minor = Math.round(number * 100);

  if (
    !Number.isFinite(number) ||
    !Number.isSafeInteger(minor) ||
    minor < 0
  ) {
    fail(`${label} must be a valid non-negative amount.`);
  }

  return minor / 100;
};

const actor = (req) =>
  req.user?.fullName ||
  req.user?.name ||
  req.user?.email ||
  "System User";

const dateOnly = (value) => {
  const text = String(value || "").trim();
  const parsed = new Date(`${text}T00:00:00.000Z`);

  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(text) ||
    Number.isNaN(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== text
  ) {
    fail("Enter a valid posting date.");
  }

  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Jamaica",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const today = ["year", "month", "day"]
    .map(
      (type) =>
        parts.find((part) => part.type === type).value
    )
    .join("-");

  if (text > today) {
    fail("A refund or payout cannot be posted in the future.");
  }

  return text;
};

const reference = (value) => {
  const result = String(value || "")
    .trim()
    .toUpperCase();

  if (result.length < 3 || result.length > 120) {
    fail(
      "Enter a refund/payment reference of 3–120 characters."
    );
  }

  return result;
};

const entity = (journal) => ({
  entityId: journal.entityId || null,
  entityCode: journal.entityCode || "",
  entitySnapshot: journal.entitySnapshot || null,
});

const requirePosted = async (
  number,
  expectedReference,
  session
) => {
  const journal = await Journal.findOne({
    entryNumber: number,
  }).session(session);

  if (
    !journal ||
    journal.status !== "Posted" ||
    journal.reversedAt ||
    journal.reversalEntryNumber ||
    journal.reference !== expectedReference
  ) {
    fail(
      "The original accounting journal needs review before this action."
    );
  }

  return journal;
};

const creditAccount = async (session) => {
  const chart = await Chart.findOne({
    accountCode: A.CUSTOMER_CREDITS_PAYABLE,
  }).session(session);

  if (
    !chart ||
    chart.status !== "Active" ||
    chart.normalBalance !== "Credit" ||
    chart.accountName.trim().toLowerCase() !==
      "customer credits payable"
  ) {
    fail(
      "Configure the active Customer Credits Payable liability account before creating or paying a customer credit."
    );
  }
};

const financialAccount = async (number, session) => {
  const account = await Account.findOne({
    accountNumber: number,
    status: "Active",
  }).session(session);

  if (
    !account ||
    !account.linkedChartAccountCode ||
    String(account.currency || "JMD").toUpperCase() !==
      "JMD"
  ) {
    fail(
      "An active JMD financial account linked to the chart is required."
    );
  }

  return account;
};

const fields = [
  "itemRecoveryAmount",
  "shoppingAssistanceFee",
  "weightCharge",
  "shippingCharge",
  "customsDuty",
  "deliveryFee",
  "otherCharges",
];

const totalCharges = (purchase) =>
  money(
    fields.reduce(
      (sum, key) => sum + money(purchase[key], key),
      0
    )
  );

const validateInvoice = async (invoice, session) => {
  if (
    invoice.invoiceSource !== "Customer Purchases" ||
    !invoice.customerPurchases?.length ||
    !["Unpaid", "Partially Paid", "Paid"].includes(
      invoice.status
    ) ||
    Number(invoice.pointsRedeemed || 0) !== 0 ||
    Number(invoice.posDiscountAmount || 0) !== 0 ||
    Number(invoice.gct || 0) !== 0 ||
    invoice.writeOffJournalEntryNumber ||
    [
      "Pending Approval",
      "Approved",
      "Written Off",
      "Recovered",
    ].includes(invoice.writeOffStatus)
  ) {
    fail(
      "This invoice requires separate review before a merchant refund."
    );
  }

  const original = await requirePosted(
    invoice.journalEntryNumber,
    invoice.invoiceNumber,
    session
  );

  const adjustments = await Journal.find({
    reference: invoice.invoiceNumber,
    sourceModule: {
      $in: ["Invoice Points", "Invoice Charges"],
    },
  }).session(session);

  if (
    adjustments.some(
      (journal) =>
        journal.status !== "Posted" ||
        journal.reversedAt ||
        journal.reversalEntryNumber
    )
  ) {
    fail("An invoice adjustment journal needs review.");
  }

  const ar = money(
    [original, ...adjustments].reduce(
      (sum, journal) =>
        sum +
        (journal.lines || []).reduce(
          (value, line) =>
            value +
            (
              line.accountCode === A.ACCOUNTS_RECEIVABLE
                ? Number(line.debit || 0) -
                  Number(line.credit || 0)
                : 0
            ),
          0
        ),
      0
    )
  );

  if (ar !== money(invoice.finalTotal)) {
    fail("Invoice total and posted accounting disagree.");
  }

  let total = 0;
  let recovered = 0;
  let outstanding = 0;

  const componentTotals = Object.fromEntries(
    fields.map((field) => [field, 0])
  );

  const linked = new Map();

  for (const line of invoice.customerPurchases) {
    if (linked.has(line.purchaseNumber)) {
      fail("Duplicate purchase allocation.");
    }

    const purchase = await Purchase.findOne({
      purchaseNumber: line.purchaseNumber,
      invoiceNumber: invoice.invoiceNumber,
      customerEkonId: invoice.customerEkonId,
    }).session(session);

    if (
      !purchase ||
      ["Cancelled", "Refunded", "Reversed"].includes(
        purchase.status
      )
    ) {
      fail("A linked purchase needs review.");
    }

    const histories = (
      purchase.invoiceHistory || []
    ).filter(
      (history) =>
        history.invoiceNumber === invoice.invoiceNumber
    );

    if (histories.length !== 1) {
      fail("Purchase invoice history needs review.");
    }

    const history = histories[0];

    for (const field of fields) {
      if (
        money(purchase[field]) !== money(line[field])
      ) {
        fail("Purchase charge allocations disagree.");
      }

      componentTotals[field] = money(
        componentTotals[field] + money(line[field])
      );
    }

    const allocated = money(line.allocatedInvoiceAmount);
    const cash = money(line.recoveredAmount);
    const balance = money(line.outstandingAmount);

    if (
      allocated !== totalCharges(purchase) ||
      allocated !== money(purchase.totalCustomerCharge) ||
      allocated !== money(history.allocatedInvoiceAmount) ||
      cash !== money(purchase.recoveredAmount) ||
      cash !== money(history.recoveredAmount) ||
      balance !== money(purchase.outstandingAmount) ||
      balance !== money(history.outstandingAmount) ||
      allocated !== money(cash + balance)
    ) {
      fail(
        "Purchase, invoice and recovery-history balances disagree."
      );
    }

    total = money(total + allocated);
    recovered = money(recovered + cash);
    outstanding = money(outstanding + balance);

    linked.set(purchase.purchaseNumber, {
      purchase,
      line,
      history,
    });
  }

  if (
    total !== money(invoice.finalTotal) ||
    recovered !== money(invoice.amountPaid) ||
    outstanding !== money(invoice.balanceDue) ||
    componentTotals.itemRecoveryAmount !==
      money(invoice.customerPurchaseRecoveryAmount) ||
    componentTotals.shoppingAssistanceFee !==
      money(invoice.processingFee) ||
    money(
      componentTotals.weightCharge +
        componentTotals.shippingCharge
    ) !== money(invoice.subtotal) ||
    componentTotals.customsDuty !==
      money(invoice.customsDuty) ||
    componentTotals.deliveryFee !==
      money(invoice.deliveryFee) ||
    componentTotals.otherCharges !==
      money(invoice.otherAdjustment)
  ) {
    fail("Invoice allocation totals need review.");
  }

  return { original, linked };
};

const recordMerchantRefund = async ({
  purchaseNumber,
  body,
  req,
}) => {
  const amount = money(body.refundAmount);

  if (amount <= 0) {
    fail("Refund amount must be greater than zero.");
  }

  const refundDate = dateOnly(body.refundDate);
  const merchantReference = reference(
    body.merchantReference
  );

  const notes = String(body.notes || "").trim();

  const requestHash = crypto
    .createHash("sha256")
    .update(
      JSON.stringify({
        purchaseNumber,
        amount,
        refundDate,
        merchantReference,
        notes,
      })
    )
    .digest("hex");

  return mongoose.connection.transaction(
    async (session) => {
      const previous = await Refund.findOne({
        purchaseNumber,
        merchantReference,
      }).session(session);

      if (previous) {
        if (previous.requestHash !== requestHash) {
          fail(
            "This merchant refund reference was already used with different details."
          );
        }

        return {
          refund: previous,
          replayed: true,
        };
      }

      let purchase = await Purchase.findOne({
        purchaseNumber,
      }).session(session);

      if (
        !purchase ||
        !purchase.journalEntryNumber ||
        ["Cancelled", "Refunded", "Reversed"].includes(
          purchase.status
        )
      ) {
        fail(
          "A posted, active customer purchase is required."
        );
      }

      const funding = await requirePosted(
        purchase.journalEntryNumber,
        purchaseNumber,
        session
      );

      const base = money(purchase.baseCurrencyAmount);
      const refunded = money(purchase.refundedAmount);

      if (amount > money(base - refunded)) {
        fail(
          "Refund exceeds the remaining original purchase cost."
        );
      }

      if (
        refundDate <
        String(purchase.purchaseDate).slice(0, 10)
      ) {
        fail("Refund date cannot precede the purchase date.");
      }

      if (
        String(
          purchase.baseCurrency || "JMD"
        ).toUpperCase() !== "JMD"
      ) {
        fail(
          "This refund workflow supports JMD base-currency purchases only."
        );
      }

      const account = await financialAccount(
        purchase.paymentAccountNumber,
        session
      );

      const fundedGoods = money(
        (funding.lines || []).reduce(
          (sum, line) =>
            sum +
            (
              line.accountCode ===
              A.CUSTOMER_PURCHASE_RECOVERABLE
                ? Number(line.debit || 0) -
                  Number(line.credit || 0)
                : 0
            ),
          0
        )
      );

      const fundedAccount = money(
        (funding.lines || []).reduce(
          (sum, line) =>
            sum +
            (
              line.accountCode ===
              account.linkedChartAccountCode
                ? Number(line.credit || 0) -
                  Number(line.debit || 0)
                : 0
            ),
          0
        )
      );

      if (
        fundedGoods !== base ||
        fundedAccount !== base
      ) {
        fail(
          "Original purchase funding or account linkage needs review."
        );
      }

      const priorRefunds = await Refund.find({
        purchaseNumber,
      }).session(session);

      const recordedRefunds = money(
        priorRefunds.reduce(
          (sum, record) =>
            sum + Number(record.amount || 0),
          0
        )
      );

      if (recordedRefunds !== refunded) {
        fail(
          "Earlier refunds need review before another refund can be posted. No historical records were changed."
        );
      }

      const priorCredit = money(
        priorRefunds.reduce(
          (sum, record) =>
            sum + Number(record.creditAmount || 0),
          0
        )
      );

      if (
        amount >
        money(
          money(purchase.itemRecoveryAmount) -
            priorCredit
        )
      ) {
        fail(
          "Refund exceeds the remaining billed goods amount; review this purchase separately."
        );
      }

      let invoice = null;
      let history = null;
      let line = null;

      let postingSource = funding;
      let invoiceReduction = 0;
      let creditAmount = 0;

      if (purchase.invoiceNumber) {
        invoice = await Invoice.findOne({
          invoiceNumber: purchase.invoiceNumber,
          customerEkonId: purchase.customerEkonId,
        }).session(session);

        if (!invoice) {
          fail("Linked invoice was not found.");
        }

        if (
          refundDate <
          String(invoice.createdAt || "").slice(0, 10)
        ) {
          fail("Refund date cannot precede the invoice date.");
        }

        const checked = await validateInvoice(
          invoice,
          session
        );

        ({ purchase, history, line } =
          checked.linked.get(purchaseNumber));

        postingSource = checked.original;

        if (
          String(funding.entityCode || "") !==
          String(postingSource.entityCode || "")
        ) {
          fail(
            "Purchase and invoice entity attribution need review."
          );
        }

        invoiceReduction = money(
          Math.min(
            amount,
            money(purchase.outstandingAmount)
          )
        );

        creditAmount = money(
          amount - invoiceReduction
        );
      } else if (
        money(purchase.recoveredAmount) !== 0 ||
        totalCharges(purchase) !==
          money(purchase.totalCustomerCharge) ||
        money(purchase.outstandingAmount) !==
          money(purchase.totalCustomerCharge)
      ) {
        fail(
          "Uninvoiced purchase recovery balances need review."
        );
      }

      if (creditAmount > 0) {
        await creditAccount(session);
      }

      const number = `CPRF-${crypto.randomUUID()}`;

      const lines = [
        {
          accountCode: account.linkedChartAccountCode,
          debit: amount,
          credit: 0,
          description:
            `Merchant refund ${merchantReference}`,
        },
      ];

      const credits = invoice
        ? [
            [
              A.ACCOUNTS_RECEIVABLE,
              invoiceReduction,
            ],
            [
              A.CUSTOMER_CREDITS_PAYABLE,
              creditAmount,
            ],
          ]
        : [
            [
              A.CUSTOMER_PURCHASE_RECOVERABLE,
              amount,
            ],
          ];

      for (const [accountCode, value] of credits) {
        if (value > 0) {
          lines.push({
            accountCode,
            debit: 0,
            credit: value,
            description:
              `${number} - ${purchaseNumber}`,
          });
        }
      }

      const journal = await postJournalEntry({
        session,
        entryDate: refundDate,
        reference:
          invoice?.invoiceNumber || purchaseNumber,
        sourceModule: invoice
          ? "Invoice Charges"
          : "Customer Purchases",
        ...entity(postingSource),
        createdBy: actor(req),
        memo:
          `Merchant refund ${merchantReference}; ` +
          `${purchaseNumber}; ${number}`,
        lines,
      });

      const [transaction] = await Transaction.create(
        [
          {
            transactionNumber:
              `TRN-${crypto.randomUUID()}`,
            accountNumber: account.accountNumber,
            accountName: account.accountName,
            linkedChartAccountCode:
              account.linkedChartAccountCode,
            journalEntryNumber: journal.entryNumber,
            ledgerReference: journal.entryNumber,
            transactionType: "Customer Purchase Refund",
            amount,
            reference: number,
            notes:
              `Merchant ${purchase.merchant}; ` +
              `${merchantReference}; ${notes}`,
            transactionDate: new Date(
              `${refundDate}T12:00:00-05:00`
            ),
            transactionCurrency: "JMD",
            customerPurchaseNumber: purchaseNumber,
            customerEkonId: purchase.customerEkonId,
            customerName: purchase.customerName,
          },
        ],
        { session }
      );

      const reduction = invoice
        ? invoiceReduction
        : amount;

      purchase.refundedAmount = money(
        refunded + amount
      );

      purchase.refundJournalEntryNumber =
        journal.entryNumber;

      purchase.itemRecoveryAmount = money(
        purchase.itemRecoveryAmount - reduction
      );

      purchase.totalCustomerCharge = money(
        purchase.totalCustomerCharge - reduction
      );

      purchase.outstandingAmount = money(
        purchase.outstandingAmount - reduction
      );

      purchase.updatedBy = actor(req);

      if (invoice) {
        line.itemRecoveryAmount =
          purchase.itemRecoveryAmount;

        line.allocatedInvoiceAmount =
          purchase.totalCustomerCharge;

        history.allocatedInvoiceAmount =
          purchase.totalCustomerCharge;

        line.outstandingAmount =
          purchase.outstandingAmount;

        history.outstandingAmount =
          purchase.outstandingAmount;

        purchase.recoveryStatus =
          purchase.outstandingAmount === 0
            ? "Paid"
            : purchase.recoveredAmount > 0
              ? "Partially Paid"
              : "Invoiced";

        purchase.status =
          purchase.outstandingAmount === 0
            ? "Recovered"
            : purchase.recoveredAmount > 0
              ? "Partially Recovered"
              : "Invoiced";

        history.status = purchase.recoveryStatus;

        invoice.customerPurchaseRecoveryAmount = money(
          invoice.customerPurchaseRecoveryAmount -
            reduction
        );

        invoice.customerPurchaseTotal = money(
          invoice.customerPurchaseTotal - reduction
        );

        invoice.finalTotal = money(
          invoice.finalTotal - reduction
        );

        invoice.balanceDue = money(
          invoice.balanceDue - reduction
        );

        invoice.status =
          invoice.balanceDue === 0
            ? "Paid"
            : invoice.amountPaid > 0
              ? "Partially Paid"
              : "Unpaid";

        if (
          invoice.status === "Paid" &&
          !invoice.paidDate
        ) {
          invoice.paidDate = refundDate;
          invoice.paidAt = new Date();
        }

        await invoice.save({ session });

        if (invoice.status === "Paid") {
          const trackingNumbers = (
            invoice.packages || []
          )
            .map((pkg) => pkg.trackingNumber)
            .filter(Boolean);

          if (trackingNumbers.length) {
            await Package.updateMany(
              {
                customerEkonId:
                  invoice.customerEkonId,
                trackingNumber: {
                  $in: trackingNumbers,
                },
              },
              {
                $set: {
                  invoiceStatus: "Paid",
                },
              },
              { session }
            );
          }
        }
      } else if (purchase.totalCustomerCharge === 0) {
        purchase.status = "Refunded";
        purchase.recoveryStatus = "Refunded";
        purchase.invoiceReady = false;
      }

      await purchase.save({ session });

      const [refund] = await Refund.create(
        [
          {
            refundNumber: number,
            purchaseNumber,
            customerEkonId:
              purchase.customerEkonId,
            customerName: purchase.customerName,
            invoiceNumber:
              invoice?.invoiceNumber || "",
            merchantReference,
            requestHash,
            refundDate,
            amount,
            invoiceReduction,
            creditAmount,
            creditRemaining: creditAmount,
            journalEntryNumber:
              journal.entryNumber,
            accountTransactionNumber:
              transaction.transactionNumber,
            notes,
            createdBy: actor(req),
          },
        ],
        { session }
      );

      await writeAuditLog({
        req,
        session,
        action: "CUSTOMER_PURCHASE_MERCHANT_REFUND",
        module: "Customer Purchases",
        description:
          `Merchant refund ${number} for ${purchaseNumber}`,
        targetType: "CustomerPurchase",
        targetId: purchaseNumber,
        metadata: {
          refundNumber: number,
          amount,
          invoiceReduction,
          creditAmount,
          journalEntryNumber:
            journal.entryNumber,
        },
      });

      return {
        refund,
        replayed: false,
      };
    }
  );
};

const payPurchaseCredit = async ({
  purchaseNumber,
  refundNumber,
  body,
  req,
}) => {
  const amount = money(body.amount);

  if (amount <= 0) {
    fail("Payout must be greater than zero.");
  }

  const paymentDate = dateOnly(body.paymentDate);
  const paymentReference = reference(body.reference);
  const accountNumber = String(
    body.accountNumber || ""
  ).trim();

  return mongoose.connection.transaction(
    async (session) => {
      const refund = await Refund.findOne({
        purchaseNumber,
        refundNumber,
      }).session(session);

      if (!refund) {
        fail("Customer credit was not found.");
      }

      const previous = refund.payouts.find(
        (payout) =>
          payout.reference === paymentReference
      );

      if (previous) {
        if (
          previous.amount !== amount ||
          previous.paymentDate !== paymentDate ||
          previous.accountNumber !== accountNumber
        ) {
          fail(
            "This payout reference was already used with different details."
          );
        }

        return {
          refund,
          replayed: true,
        };
      }

      const usedReference = await Refund.findOne({
        "payouts.reference": paymentReference,
      }).session(session);

      if (usedReference) {
        fail(
          "This payout reference is already recorded against another customer credit."
        );
      }

      if (amount > money(refund.creditRemaining)) {
        fail(
          "Payout exceeds the remaining customer credit."
        );
      }

      if (paymentDate < refund.refundDate) {
        fail(
          "Payout cannot precede the merchant refund date."
        );
      }

      await creditAccount(session);

      const original = await Journal.findOne({
        entryNumber: refund.journalEntryNumber,
      }).session(session);

      if (
        !original ||
        original.status !== "Posted" ||
        original.reversedAt ||
        original.reversalEntryNumber
      ) {
        fail("The merchant refund journal needs review.");
      }

      const account = await financialAccount(
        accountNumber,
        session
      );

      if (
        !["Bank", "Cash"].includes(account.accountType)
      ) {
        fail(
          "Customer credit payouts require a bank or cash account."
        );
      }

      const chart = await Chart.findOne({
        accountCode:
          account.linkedChartAccountCode,
      }).session(session);

      if (
        !chart ||
        chart.status !== "Active" ||
        chart.normalBalance !== "Debit" ||
        money(chart.currentBalance) < amount
      ) {
        fail(
          "The payout account has insufficient available funds or needs review."
        );
      }

      const journal = await postJournalEntry({
        session,
        entryDate: paymentDate,
        reference: refundNumber,
        sourceModule:
          "Customer Purchase Credit Payout",
        ...entity(original),
        createdBy: actor(req),
        memo:
          `Customer credit paid to ${refund.customerName}; ` +
          paymentReference,
        lines: [
          {
            accountCode:
              A.CUSTOMER_CREDITS_PAYABLE,
            debit: amount,
            credit: 0,
          },
          {
            accountCode:
              account.linkedChartAccountCode,
            debit: 0,
            credit: amount,
          },
        ],
      });

      const [transaction] = await Transaction.create(
        [
          {
            transactionNumber:
              `TRN-${crypto.randomUUID()}`,
            accountNumber,
            accountName: account.accountName,
            linkedChartAccountCode:
              account.linkedChartAccountCode,
            journalEntryNumber:
              journal.entryNumber,
            ledgerReference:
              journal.entryNumber,
            transactionType: "Withdrawal",
            amount,
            reference: refundNumber,
            notes:
              `Customer credit payout ${paymentReference}`,
            transactionDate: new Date(
              `${paymentDate}T12:00:00-05:00`
            ),
            transactionCurrency: "JMD",
            customerPurchaseNumber:
              purchaseNumber,
            customerEkonId:
              refund.customerEkonId,
            customerName:
              refund.customerName,
          },
        ],
        { session }
      );

      refund.creditRemaining = money(
        refund.creditRemaining - amount
      );

      refund.payouts.push({
        reference: paymentReference,
        amount,
        paymentDate,
        accountNumber,
        journalEntryNumber:
          journal.entryNumber,
        accountTransactionNumber:
          transaction.transactionNumber,
        paidBy: actor(req),
      });

      await refund.save({ session });

      await writeAuditLog({
        req,
        session,
        action: "CUSTOMER_PURCHASE_CREDIT_PAID",
        module: "Customer Purchases",
        description:
          `Customer credit payout for ${refundNumber}`,
        targetType: "CustomerPurchaseRefund",
        targetId: refundNumber,
        metadata: {
          amount,
          paymentReference,
          journalEntryNumber:
            journal.entryNumber,
          creditRemaining:
            refund.creditRemaining,
        },
      });

      return {
        refund,
        replayed: false,
      };
    }
  );
};

module.exports = {
  recordMerchantRefund,
  payPurchaseCredit,
};