const Package = require("../models/Package");
const Customer = require("../models/Customer");
const AccountTransaction = require("../models/AccountTransaction");
const Invoice = require("../models/Invoice");
const CustomerPurchase = require("../models/CustomerPurchase");
const AccountsPayable = require("../models/AccountsPayable");

const TIME_ZONE = "America/Jamaica";
const DAY_MS = 24 * 60 * 60 * 1000;

const jamaicaDate = (value) => {
  if (!value) return "";

  // Preserve dates that were recorded without a time.
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(value))) {
    const parsed = new Date(`${value}T12:00:00Z`);

    return Number.isFinite(parsed.getTime()) &&
      parsed.toISOString().slice(0, 10) === value
      ? value
      : "";
  }

  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";

  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const get = (type) =>
    parts.find((part) => part.type === type)?.value;

  return `${get("year")}-${get("month")}-${get("day")}`;
};

const shiftDate = (date, days) =>
  new Date(
    new Date(`${date}T12:00:00Z`).getTime() + days * DAY_MS
  ).toISOString().slice(0, 10);

const daysBetween = (from, to) =>
  Math.round(
    (new Date(`${to}T12:00:00Z`) -
      new Date(`${from}T12:00:00Z`)) /
      DAY_MS
  );

const round = (value) =>
  Math.round((value + Number.EPSILON) * 100) / 100;

const buildCollectionsSummary = async ({
  start,
  end,
  previousStart,
  previousEnd,
}) => {
  const payments = await AccountTransaction.find({
    transactionType: "Invoice Payment",
    transactionDate: {
      $gte: new Date(`${previousStart}T00:00:00-05:00`),
      $lt: new Date(`${shiftDate(end, 1)}T00:00:00-05:00`),
    },
  })
    .select(
      "transactionNumber transactionDate amount paymentMethod " +
        "invoiceNumber reference customerEkonId customerName " +
        "branch cashierUserId cashierName journalEntryNumber " +
        "transactionCurrency"
    )
    .lean();

  // Older direct invoice payments can identify their cashier
  // through an exact journal-entry match.
  const journalNumbers = [
    ...new Set(
      payments
        .map((payment) => payment.journalEntryNumber)
        .filter(Boolean)
    ),
  ];

  const invoices = journalNumbers.length
    ? await Invoice.find({
        "paymentHistory.journalEntryNumber": {
          $in: journalNumbers,
        },
      })
        .select(
          "invoiceNumber customerEkonId customerName paymentHistory"
        )
        .lean()
    : [];

  const historyByJournal = new Map();

  for (const invoice of invoices) {
    for (const history of invoice.paymentHistory || []) {
      const journal = history.journalEntryNumber;
      if (!journal) continue;

      historyByJournal.set(journal, {
        invoiceNumber: invoice.invoiceNumber,
        customerEkonId: invoice.customerEkonId,
        customerName: invoice.customerName,
        cashierName: history.receivedBy || "",
      });
    }
  }

  const current = {
    moneyCollected: 0,
    paymentCount: 0,
  };

  const previous = {
    moneyCollected: 0,
    paymentCount: 0,
  };

  const daily = new Map();
  const cashiers = new Map();
  const branches = new Map();

  let invalidPaymentCount = 0;
  let excludedNonJmdPaymentCount = 0;
  let currentPaymentsWithoutBranch = 0;
  let currentPaymentsWithoutCashier = 0;

  const methodKey = (method) => {
    if (method === "Cash") return "cash";
    if (method === "Card") return "card";
    if (method === "Bank Transfer") return "bank";
    return "other";
  };

  for (const payment of payments) {
    const amount = Number(payment.amount);
    const date = jamaicaDate(payment.transactionDate);

    if (!Number.isFinite(amount) || amount <= 0 || !date) {
      invalidPaymentCount += 1;
      continue;
    }

    const currency = String(
      payment.transactionCurrency || "JMD"
    ).toUpperCase();

    if (currency !== "JMD") {
      excludedNonJmdPaymentCount += 1;
      continue;
    }

    const isCurrent = date >= start && date <= end;
    const isPrevious =
      date >= previousStart && date <= previousEnd;

    if (!isCurrent && !isPrevious) continue;

    const summary = isCurrent ? current : previous;
    summary.moneyCollected += amount;
    summary.paymentCount += 1;

    if (!isCurrent) continue;

    daily.set(date, (daily.get(date) || 0) + amount);

    const history =
      historyByJournal.get(payment.journalEntryNumber) || {};

    const branch =
      String(payment.branch || "").trim() || "Unassigned";

    const cashierName =
      String(payment.cashierName || history.cashierName || "")
        .trim() || "Unassigned";

    const cashierId = String(payment.cashierUserId || "").trim();
    const cashierKey = cashierId
      ? `id:${cashierId}`
      : `name:${cashierName}`;

    if (branch === "Unassigned") {
      currentPaymentsWithoutBranch += 1;
    }

    if (cashierName === "Unassigned") {
      currentPaymentsWithoutCashier += 1;
    }

    if (!cashiers.has(cashierKey)) {
      cashiers.set(cashierKey, {
        cashierUserId: cashierId,
        cashierName,
        paymentCount: 0,
        cash: 0,
        card: 0,
        bank: 0,
        other: 0,
        total: 0,
      });
    }

    const cashier = cashiers.get(cashierKey);
    cashier.paymentCount += 1;
    cashier[methodKey(payment.paymentMethod)] += amount;
    cashier.total += amount;

    if (!branches.has(branch)) {
      branches.set(branch, {
        branch,
        paymentCount: 0,
        amount: 0,
      });
    }

    const store = branches.get(branch);
    store.paymentCount += 1;
    store.amount += amount;
  }

  current.moneyCollected = round(current.moneyCollected);
  previous.moneyCollected = round(previous.moneyCollected);

  return {
    current,
    previous,
    daily: Object.fromEntries(
      [...daily].map(([date, amount]) => [date, round(amount)])
    ),
    byCashier: [...cashiers.values()]
      .map((cashier) => ({
        ...cashier,
        cash: round(cashier.cash),
        card: round(cashier.card),
        bank: round(cashier.bank),
        other: round(cashier.other),
        total: round(cashier.total),
      }))
      .sort((a, b) => b.total - a.total),
    byBranch: [...branches.values()]
      .map((store) => ({
        ...store,
        amount: round(store.amount),
      }))
      .sort((a, b) => b.amount - a.amount),
    dataQuality: {
      invalidPaymentCount,
      excludedNonJmdPaymentCount,
      currentPaymentsWithoutBranch,
      currentPaymentsWithoutCashier,
    },
  };
};

const buildDashboardBalances = async ({ start, end, today }) => {
  const [invoices, payables, purchases] = await Promise.all([
    Invoice.find({
      status: { $in: ["Unpaid", "Partially Paid"] },
    })
      .select(
        "invoiceNumber customerName finalTotal amountPaid " +
          "balanceDue dueDate"
      )
      .lean(),

    AccountsPayable.find({
      status: { $in: ["Unpaid", "Partially Paid", "Overdue"] },
    })
      .select(
        "payableNumber vendorName amount amountPaid balanceDue " +
          "dueDate approvalStatus"
      )
      .lean(),

    CustomerPurchase.find()
      .select(
        "purchaseNumber customerName purchaseDate status " +
          "baseCurrency baseCurrencyAmount shoppingAssistanceFee " +
          "totalCustomerCharge recoveredAmount outstandingAmount " +
          "recoveryStatus invoiceNumber invoiceHistory branch"
      )
      .lean(),
  ]);

  const number = (value) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  };

  const balance = (saved, total, paid) =>
    round(
      Number(saved) > 0
        ? Number(saved)
        : Math.max(0, number(total) - number(paid))
    );

  const summariseBalances = (rows) => {
    const aging = [
      { label: "Not overdue", count: 0, amount: 0 },
      { label: "1–30 days overdue", count: 0, amount: 0 },
      { label: "31–60 days overdue", count: 0, amount: 0 },
      { label: "61–90 days overdue", count: 0, amount: 0 },
      { label: "91+ days overdue", count: 0, amount: 0 },
      { label: "Due date unavailable", count: 0, amount: 0 },
    ];

    let outstanding = 0;
    let overdue = 0;
    let dueNextSevenDays = 0;

    for (const row of rows) {
      outstanding += row.balance;

      const overdueDays = row.dueDate
        ? daysBetween(row.dueDate, today)
        : null;

      let bucket = 5;

      if (overdueDays !== null) {
        bucket =
          overdueDays <= 0 ? 0 :
          overdueDays <= 30 ? 1 :
          overdueDays <= 60 ? 2 :
          overdueDays <= 90 ? 3 : 4;

        if (overdueDays > 0) overdue += row.balance;

        if (
          row.dueDate >= today &&
          row.dueDate <= shiftDate(today, 7)
        ) {
          dueNextSevenDays += row.balance;
        }
      }

      aging[bucket].count += 1;
      aging[bucket].amount += row.balance;
    }

    return {
      scope: "Company-wide current balances",
      asOf: today,
      count: rows.length,
      outstanding: round(outstanding),
      overdue: round(overdue),
      dueNextSevenDays: round(dueNextSevenDays),
      aging: aging.map((bucket) => ({
        ...bucket,
        amount: round(bucket.amount),
      })),
      oldestDue: rows
        .filter((row) => row.dueDate)
        .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
        .slice(0, 10),
    };
  };

  const receivableRows = invoices
    .map((invoice) => ({
      reference: invoice.invoiceNumber,
      name: invoice.customerName,
      dueDate: jamaicaDate(invoice.dueDate),
      balance: balance(
        invoice.balanceDue,
        invoice.finalTotal,
        invoice.amountPaid
      ),
    }))
    .filter((row) => row.balance > 0);

  const payableRows = payables
    .map((payable) => ({
      reference: payable.payableNumber,
      name: payable.vendorName,
      dueDate: jamaicaDate(payable.dueDate),
      approvalStatus: payable.approvalStatus,
      balance: balance(
        payable.balanceDue,
        payable.amount,
        payable.amountPaid
      ),
    }))
    .filter((row) => row.balance > 0);

  const activePurchases = purchases.filter(
    (purchase) =>
      !["Cancelled", "Refunded", "Reversed"].includes(
        purchase.status
      )
  );

  const jmdPurchases = activePurchases.filter(
    (purchase) =>
      String(purchase.baseCurrency || "").toUpperCase() === "JMD"
  );

  const periodPurchases = jmdPurchases.filter((purchase) => {
    const date = jamaicaDate(purchase.purchaseDate);
    return date && date >= start && date <= end;
  });

  // Pending requests are counted separately from actual purchases.
  const purchasedInPeriod = periodPurchases.filter(
    (purchase) => purchase.status !== "Pending Purchase"
  );

  const openRecoveries = jmdPurchases
    .filter(
      (purchase) =>
        purchase.status !== "Pending Purchase" &&
        !["Paid", "Refunded", "Written Off"].includes(
          purchase.recoveryStatus
        )
    )
    .map((purchase) => ({
      purchaseNumber: purchase.purchaseNumber,
      customerName: purchase.customerName,
      balance: balance(
        purchase.outstandingAmount,
        purchase.totalCustomerCharge,
        purchase.recoveredAmount
      ),
    }))
    .filter((purchase) => purchase.balance > 0);

  const statusCounts = {};

  for (const purchase of activePurchases) {
    const status = purchase.status || "Unknown";
    statusCounts[status] = (statusCounts[status] || 0) + 1;
  }

  return {
    receivables: {
      ...summariseBalances(receivableRows),
      basis: "Unpaid and partially paid shipping-system invoices",
      shoppingBalancesAddedSeparately: false,
      marketplaceIncluded: false,
    },

    payables: {
      ...summariseBalances(payableRows),
      basis: "Recorded unpaid, partially paid and overdue bills",
      pendingApprovalCount: payableRows.filter(
        (row) => row.approvalStatus === "Pending"
      ).length,
    },

    shoppingAssistance: {
      currency: "JMD",
      period: {
        from: start,
        to: end,
        purchaseCount: purchasedInPeriod.length,
        goodsCost: round(
          purchasedInPeriod.reduce(
            (sum, purchase) =>
              sum + number(purchase.baseCurrencyAmount),
            0
          )
        ),
        recordedAssistanceFees: round(
          purchasedInPeriod.reduce(
            (sum, purchase) =>
              sum + number(purchase.shoppingAssistanceFee),
            0
          )
        ),
      },
      current: {
        pendingPurchaseCount: activePurchases.filter(
          (purchase) => purchase.status === "Pending Purchase"
        ).length,
        outstandingCustomerCharges: round(
          openRecoveries.reduce(
            (sum, purchase) => sum + purchase.balance,
            0
          )
        ),
        outstandingPurchaseCount: openRecoveries.length,
        statusCounts: Object.entries(statusCounts).map(
          ([status, count]) => ({ status, count })
        ),
        largestOutstanding: [...openRecoveries]
          .sort((a, b) => b.balance - a.balance)
          .slice(0, 10),
      },
      excludedNonJmdPurchaseCount:
        activePurchases.length - jmdPurchases.length,
      note:
        "Goods cost is separate from assistance fees. Recorded fees " +
        "are not a cash-receipts measure. Outstanding customer " +
        "charges may already be included in invoice receivables " +
        "and must not be added to them.",
    },
  };
};

const buildOperationalDashboard = async ({
  from = "",
  to = "",
} = {}) => {
  const today = jamaicaDate(new Date());
  const end = to || today;
  const start = from || shiftDate(end, -29);

  if (
    !jamaicaDate(start) ||
    !jamaicaDate(end) ||
    start > end ||
    daysBetween(start, end) > 365
  ) {
    const error = new Error(
      "Choose a valid date range of no more than 366 days."
    );
    error.status = 400;
    throw error;
  }

  const periodDays = daysBetween(start, end) + 1;
  const previousEnd = shiftDate(start, -1);
  const previousStart = shiftDate(start, -periodDays);

  const [packages, customers] = await Promise.all([
    Package.find()
      .select(
        "trackingNumber status weight dateReceived createdAt " +
          "readyForPickup readyForPickupDate collectedAt"
      )
      .lean(),
    Customer.find()
      .select("signUpDate createdAt branch")
      .lean(),
  ]);

  const activePackages = packages.filter(
    (pkg) =>
      !["deleted", "cancelled", "canceled"].includes(
        String(pkg.status || "").trim().toLowerCase()
      )
  );

  const inRange = (date, rangeStart, rangeEnd) =>
    Boolean(date && date >= rangeStart && date <= rangeEnd);

  const receivedDate = (pkg) =>
    jamaicaDate(pkg.dateReceived) || jamaicaDate(pkg.createdAt);

  const signupDate = (customer) =>
    jamaicaDate(customer.signUpDate) ||
    jamaicaDate(customer.createdAt);

  const summarise = (rangeStart, rangeEnd) => {
    const received = activePackages.filter((pkg) =>
      inRange(receivedDate(pkg), rangeStart, rangeEnd)
    );

    const collected = activePackages.filter((pkg) =>
      inRange(jamaicaDate(pkg.collectedAt), rangeStart, rangeEnd)
    );

    const collectionDays = collected.flatMap((pkg) => {
      const ready = jamaicaDate(pkg.readyForPickupDate);
      const collection = jamaicaDate(pkg.collectedAt);

      return ready && collection >= ready
        ? [daysBetween(ready, collection)]
        : [];
    });

    return {
      packagesReceived: received.length,
      packagesCollected: collected.length,
      weightReceived: round(
        received.reduce((sum, pkg) => {
          const weight = Number(pkg.weight);
          return sum + (Number.isFinite(weight) ? weight : 0);
        }, 0)
      ),
      newCustomers: customers.filter((customer) =>
        inRange(signupDate(customer), rangeStart, rangeEnd)
      ).length,
      averageDaysToCollect: collectionDays.length
        ? round(
            collectionDays.reduce((sum, days) => sum + days, 0) /
              collectionDays.length
          )
        : null,
      collectionTimeSampleSize: collectionDays.length,
    };
  };

  const daily = [];

  for (let date = start; date <= end; date = shiftDate(date, 1)) {
    daily.push({ date, received: 0, collected: 0 });
  }

  const dailyByDate = new Map(
    daily.map((item) => [item.date, item])
  );

  const pipeline = {};
  let deliveredWithoutCollectionDate = 0;

  for (const pkg of activePackages) {
    const received = receivedDate(pkg);
    const collected = jamaicaDate(pkg.collectedAt);
    const status = String(pkg.status || "Unknown").trim();

    if (dailyByDate.has(received)) {
      dailyByDate.get(received).received += 1;
    }

    if (dailyByDate.has(collected)) {
      dailyByDate.get(collected).collected += 1;
    }

    if (inRange(received, start, end)) {
      const currentStatus = collected ? "Collected" : status;
      pipeline[currentStatus] = (pipeline[currentStatus] || 0) + 1;
    }

    if (
      ["delivered", "collected"].includes(status.toLowerCase()) &&
      !collected
    ) {
      deliveredWithoutCollectionDate += 1;
    }
  }

    const collections = await buildCollectionsSummary({
    start,
    end,
    previousStart,
    previousEnd,
  });

    const balances = await buildDashboardBalances({
    start,
    end,
    today,
  });

  return {
    filters: {
      from: start,
      to: end,
      previousFrom: previousStart,
      previousTo: previousEnd,
      timeZone: TIME_ZONE,
      scope: "All stores",
    },
        current: {
      ...summarise(start, end),
      ...collections.current,
    },
    previous: {
      ...summarise(previousStart, previousEnd),
      ...collections.previous,
    },
    daily: daily.map((item) => ({
      ...item,
      moneyCollected: collections.daily[item.date] || 0,
    })),
        receivables: balances.receivables,
    payables: balances.payables,
    shoppingAssistance: balances.shoppingAssistance,
    collections: {
      currency: "JMD",
      basis: "Recorded invoice payment receipts",
      byCashier: collections.byCashier,
      byBranch: collections.byBranch,
      pointsIncluded: false,
      refundsDeducted: false,
    },
    receivedPackageCurrentStatuses: Object.entries(pipeline).map(
      ([status, count]) => ({ status, count })
    ),
        dataQuality: {
      ...collections.dataQuality,
      deliveredWithoutCollectionDate,
      historicalCompletenessVerified: false,
      note:
        "Figures reflect recorded EKOS data. Historical transaction " +
        "completeness remains pending review.",
    },
  };
};

module.exports = { buildOperationalDashboard };