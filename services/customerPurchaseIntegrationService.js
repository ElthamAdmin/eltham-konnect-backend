const CustomerPurchase = require("../models/CustomerPurchase");
const Package = require("../models/Package");

const roundMoney = (value) =>
  Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;

const getUserName = (user) =>
  user?.fullName || user?.name || user?.email || "System User";

const getPurchaseStatusFromPackage = ({
  packageStatus,
  invoiceNumber = "",
  outstandingAmount = 0,
}) => {
  if (invoiceNumber) {
    return Number(outstandingAmount || 0) <= 0
      ? "Recovered"
      : "Invoiced";
  }

  if (packageStatus === "Ready for Pickup") {
    return "Ready to Invoice";
  }

  if (packageStatus === "At Warehouse") {
    return "At Warehouse";
  }

  if (
    packageStatus === "Manifest Assigned" ||
    packageStatus === "In Transit" ||
    packageStatus === "Cleared Customs" ||
    packageStatus === "In Transit to Branch"
  ) {
    return "In Transit";
  }

  return "";
};

const syncCustomerPurchaseFromPackage = async ({
  pkg,
  user = null,
  session = null,
}) => {
  if (!pkg) return null;

  let purchase = null;

  if (pkg.customerPurchaseNumber) {
    purchase = await CustomerPurchase.findOne({
      purchaseNumber: pkg.customerPurchaseNumber,
    }).session(session);
  }

  if (!purchase && pkg.customerPurchaseId) {
    purchase = await CustomerPurchase.findById(
      pkg.customerPurchaseId
    ).session(session);
  }

  if (!purchase && pkg.trackingNumber) {
    purchase = await CustomerPurchase.findOne({
      trackingNumber: pkg.trackingNumber,
      customerEkonId: pkg.customerEkonId,
      status: {
        $nin: ["Cancelled", "Refunded", "Reversed"],
      },
    }).session(session);
  }

  if (!purchase) {
    return null;
  }

  if (purchase.customerEkonId !== pkg.customerEkonId) {
    throw new Error(
      "The package and customer purchase belong to different customers."
    );
  }

  const billedWeight =
    Number(pkg.weight || 0) > 0
      ? Math.ceil(Number(pkg.weight || 0))
      : 0;

  purchase.packageId = pkg._id;
  purchase.trackingNumber = pkg.trackingNumber;
  purchase.warehouse =
    pkg.warehouseLocation || purchase.warehouse || "";
  purchase.weight = roundMoney(pkg.weight || 0);
  purchase.chargeableWeight = billedWeight;
  purchase.packageReceivedDate =
    pkg.dateReceived || purchase.packageReceivedDate;
  purchase.lastPackageSyncAt = new Date();
  purchase.lastPackageStatus = pkg.status || "";
  purchase.updatedBy = getUserName(user);

  const synchronizedStatus = getPurchaseStatusFromPackage({
    packageStatus: pkg.status,
    invoiceNumber: purchase.invoiceNumber,
    outstandingAmount: purchase.outstandingAmount,
  });

  if (
    synchronizedStatus &&
    !["Refunded", "Reversed", "Cancelled"].includes(
      purchase.status
    )
  ) {
    purchase.status = synchronizedStatus;
  }

  if (
    pkg.status === "Ready for Pickup" &&
    !purchase.invoiceNumber
  ) {
    purchase.invoiceReady = true;
    purchase.status = "Ready to Invoice";
  }

  await purchase.save({ session });

  pkg.customerPurchaseId = purchase._id;
  pkg.customerPurchaseNumber = purchase.purchaseNumber;
  pkg.customerPurchaseLinked = true;
  pkg.customerPurchaseLinkedAt =
    pkg.customerPurchaseLinkedAt || new Date();
  pkg.customerPurchaseLinkedBy =
    pkg.customerPurchaseLinkedBy || getUserName(user);

  await pkg.save({ session });

  return purchase;
};

const getRecoveryInvoiceData = async ({
  customerEkonId,
  purchaseNumbers,
    session = null,
}) => {
  if (
    !Array.isArray(purchaseNumbers) ||
    purchaseNumbers.length === 0
  ) {
    throw new Error(
      "At least one customer purchase must be selected."
    );
  }

  const purchases = await CustomerPurchase.find({
    purchaseNumber: { $in: purchaseNumbers },
        customerEkonId,
  }).session(session);

  if (purchases.length !== purchaseNumbers.length) {
    throw new Error(
      "One or more selected customer purchases could not be found."
    );
  }

  const invalidPurchase = purchases.find((purchase) =>
    ["Cancelled", "Refunded", "Reversed"].includes(
      purchase.status
    )
  );

  if (invalidPurchase) {
    throw new Error(
      `Purchase ${invalidPurchase.purchaseNumber} cannot be invoiced because its status is ${invalidPurchase.status}.`
    );
  }

  const alreadyInvoiced = purchases.find(
    (purchase) =>
      purchase.invoiceNumber ||
      purchase.recoveryStatus === "Invoiced" ||
      purchase.recoveryStatus === "Paid"
  );

  if (alreadyInvoiced) {
    throw new Error(
      `Purchase ${alreadyInvoiced.purchaseNumber} has already been invoiced.`
    );
  }

  const notReady = purchases.find(
    (purchase) =>
      purchase.status !== "Ready to Invoice" &&
      purchase.invoiceReady !== true
  );

  if (notReady) {
    throw new Error(
      `Purchase ${notReady.purchaseNumber} is not ready to invoice. Prepare its recovery charges first.`
    );
  }

  const totals = purchases.reduce(
    (summary, purchase) => {
      summary.recoverableAmount += Number(
        purchase.itemRecoveryAmount || 0
      );

      summary.shoppingServiceFee += Number(
        purchase.shoppingAssistanceFee || 0
      );

      summary.weightCharge += Number(
        purchase.weightCharge || 0
      );

      summary.shippingCharge += Number(
        purchase.shippingCharge || 0
      );

      summary.customsDuty += Number(
        purchase.customsDuty || 0
      );

      summary.deliveryFee += Number(
        purchase.deliveryFee || 0
      );

      summary.otherCharges += Number(
        purchase.otherCharges || 0
      );

      return summary;
    },
    {
      recoverableAmount: 0,
      shoppingServiceFee: 0,
      weightCharge: 0,
      shippingCharge: 0,
      customsDuty: 0,
      deliveryFee: 0,
      otherCharges: 0,
    }
  );

  Object.keys(totals).forEach((key) => {
    totals[key] = roundMoney(totals[key]);
  });

  totals.shippingRevenue = roundMoney(
    totals.weightCharge + totals.shippingCharge
  );

  totals.otherServiceRevenue = roundMoney(
    totals.customsDuty + totals.otherCharges
  );

  totals.totalCustomerPurchaseAmount = roundMoney(
    totals.recoverableAmount +
      totals.shoppingServiceFee +
      totals.shippingRevenue +
      totals.deliveryFee +
      totals.otherServiceRevenue
  );

  const packageIds = purchases
    .map((purchase) => purchase.packageId)
    .filter(Boolean);

  const packages = packageIds.length
    ? await Package.find({
                _id: { $in: packageIds },
      }).session(session)
    : [];

  const invoicePurchaseLines = purchases.map((purchase) => ({
    purchaseNumber: purchase.purchaseNumber,
    merchant: purchase.merchant,
    orderNumber: purchase.orderNumber,
    trackingNumber: purchase.trackingNumber,
    itemRecoveryAmount: roundMoney(
      purchase.itemRecoveryAmount
    ),
    shoppingAssistanceFee: roundMoney(
      purchase.shoppingAssistanceFee
    ),
    weightCharge: roundMoney(purchase.weightCharge),
    shippingCharge: roundMoney(
      purchase.shippingCharge
    ),
    customsDuty: roundMoney(purchase.customsDuty),
    deliveryFee: roundMoney(purchase.deliveryFee),
    otherCharges: roundMoney(purchase.otherCharges),
    allocatedInvoiceAmount: roundMoney(
      purchase.totalCustomerCharge
    ),
    recoveredAmount: 0,
    outstandingAmount: roundMoney(
      purchase.totalCustomerCharge
    ),
  }));

  const invoicePackageLines = purchases
    .filter((purchase) => purchase.trackingNumber)
    .map((purchase) => ({
      trackingNumber: purchase.trackingNumber,
      chargeableWeight:
        purchase.chargeableWeight ||
        (Number(purchase.weight || 0) > 0
          ? Math.ceil(Number(purchase.weight || 0))
          : 0),
      rate: roundMoney(
        Number(purchase.weightCharge || 0) +
          Number(purchase.shippingCharge || 0)
      ),
      customerPurchaseNumber:
        purchase.purchaseNumber,
    }));

  return {
    purchases,
    packages,
    totals,
    invoicePurchaseLines,
    invoicePackageLines,
  };
};

const markPurchasesInvoiced = async ({
  purchases,
  invoice,
  journalEntryNumber = "",
  user = null,
  session = null,
}) => {
  const now = new Date();

  for (const purchase of purchases) {
    const line = (invoice.customerPurchases || []).find(
      (item) => item.purchaseNumber === purchase.purchaseNumber
    );

    if (!line) {
      throw new Error(
        `Invoice line missing for purchase ${purchase.purchaseNumber}.`
      );
    }

    const amount = roundMoney(line.allocatedInvoiceAmount);

    if (!Number.isFinite(amount) || amount < 0) {
      throw new Error("Invalid purchase invoice allocation.");
    }

    if (purchase.invoiceNumber) {
      throw new Error(
        `Purchase ${purchase.purchaseNumber} is already invoiced.`
      );
    }

    purchase.invoiceNumber = invoice.invoiceNumber;
    purchase.invoiceReady = false;
    purchase.invoicedAt = now;
    purchase.invoiceJournalEntryNumber = journalEntryNumber;
    purchase.recoveryStatus = "Invoiced";
    purchase.status = "Invoiced";
    purchase.outstandingAmount = amount;
    purchase.updatedBy = getUserName(user);
    purchase.invoiceHistory = purchase.invoiceHistory || [];

    purchase.invoiceHistory.push({
      invoiceNumber: invoice.invoiceNumber,
      invoiceDate: now,
      allocatedInvoiceAmount: amount,
      recoveredAmount: 0,
      outstandingAmount: amount,
      journalEntryNumber,
      status: "Invoiced",
    });

    await purchase.save({ session });
  }
};

const allocateInvoicePaymentToPurchases = async ({
  invoice,
  paymentAmount,
  paymentJournalEntryNumber = "",
  paymentDate = new Date(),
  receivedBy = "",
  session = null,
}) => {
  const failAllocation = (message) => {
    const error = new Error(message);
    error.statusCode = 409;
    throw error;
  };

  const money = (value, label) => {
    const number = Number(value);

    if (!Number.isFinite(number) || number < 0) {
      failAllocation(`${label} must be a valid non-negative amount.`);
    }

    return roundMoney(number);
  };

  if (!invoice) {
    failAllocation("Invoice is required for purchase payment allocation.");
  }

  const invoiceLines = invoice.customerPurchases || [];

  if (invoiceLines.length === 0) {
    if (
      ["Customer Purchases", "Combined"].includes(invoice.invoiceSource)
    ) {
      failAllocation(
        "This invoice has no customer-purchase allocations. Review it before recording payment."
      );
    }

    return {
      totalAllocated: 0,
      unallocatedAmount: roundMoney(paymentAmount),
      allocations: [],
    };
  }

  if (!session || !session.inTransaction()) {
    failAllocation(
      "Customer-purchase payments must run inside the payment transaction."
    );
  }

  if (invoice.invoiceSource !== "Customer Purchases") {
    failAllocation(
      "Combined invoice payments require a separate allocation review."
    );
  }

  const amount = money(paymentAmount, "Payment amount");

  if (amount <= 0) {
    failAllocation("Payment amount must be greater than zero.");
  }

  const journalNumber = String(
    paymentJournalEntryNumber || ""
  ).trim();

  if (!journalNumber) {
    failAllocation(
      "A posted payment journal number is required."
    );
  }

  const parsedPaymentDate = new Date(paymentDate);

  if (Number.isNaN(parsedPaymentDate.getTime())) {
    failAllocation("Payment date is invalid.");
  }

  const seen = new Set();
  const prepared = [];

  let totalAllocated = 0;
  let totalRecovered = 0;
  let totalOutstanding = 0;

  for (const line of invoiceLines) {
    const purchaseNumber = String(
      line.purchaseNumber || ""
    ).trim();

    if (!purchaseNumber || seen.has(purchaseNumber)) {
      failAllocation(
        "The invoice contains a missing or duplicate purchase allocation."
      );
    }

    seen.add(purchaseNumber);

    const purchase = await CustomerPurchase.findOne({
      purchaseNumber,
      invoiceNumber: invoice.invoiceNumber,
      customerEkonId: invoice.customerEkonId,
    }).session(session);

    if (!purchase) {
      failAllocation(
        `Purchase allocation link is invalid for ${purchaseNumber}.`
      );
    }

    if (
      ["Cancelled", "Refunded", "Reversed"].includes(purchase.status) ||
      ["Refunded", "Written Off"].includes(purchase.recoveryStatus)
    ) {
      failAllocation(
        `Purchase ${purchaseNumber} cannot receive this payment in its current status.`
      );
    }

    const histories = (purchase.invoiceHistory || []).filter(
      (entry) => entry.invoiceNumber === invoice.invoiceNumber
    );

    if (histories.length !== 1) {
      failAllocation(
        `Purchase ${purchaseNumber} needs exactly one matching invoice-history entry.`
      );
    }

    const history = histories[0];

    const allocated = money(
      line.allocatedInvoiceAmount,
      `${purchaseNumber} invoice allocation`
    );

    const recovered = money(
      line.recoveredAmount,
      `${purchaseNumber} recovered amount`
    );

    const outstanding = money(
      line.outstandingAmount,
      `${purchaseNumber} outstanding amount`
    );

    if (
      allocated !== roundMoney(recovered + outstanding) ||
      money(
        purchase.totalCustomerCharge,
        `${purchaseNumber} total charge`
      ) !== allocated ||
      money(
        purchase.recoveredAmount,
        `${purchaseNumber} purchase recovery`
      ) !== recovered ||
      money(
        purchase.outstandingAmount,
        `${purchaseNumber} purchase balance`
      ) !== outstanding ||
      money(
        history.allocatedInvoiceAmount,
        `${purchaseNumber} history allocation`
      ) !== allocated ||
      money(
        history.recoveredAmount,
        `${purchaseNumber} history recovery`
      ) !== recovered ||
      money(
        history.outstandingAmount,
        `${purchaseNumber} history balance`
      ) !== outstanding
    ) {
      failAllocation(
        `Purchase ${purchaseNumber}, its invoice allocation and recovery history do not agree. No payment allocation was saved.`
      );
    }

    const paymentAllocations = purchase.paymentAllocations || [];

    if (
      paymentAllocations.some(
        (entry) =>
          String(entry.journalEntryNumber || "").trim() ===
          journalNumber
      )
    ) {
      failAllocation(
        `Payment journal ${journalNumber} has already been allocated to this invoice.`
      );
    }

    prepared.push({
      line,
      purchase,
      history,
      recovered,
      outstanding,
    });

    totalAllocated = roundMoney(totalAllocated + allocated);
    totalRecovered = roundMoney(totalRecovered + recovered);
    totalOutstanding = roundMoney(
      totalOutstanding + outstanding
    );
  }

  const invoiceTotal = money(
    invoice.finalTotal,
    "Invoice total"
  );

  const invoicePaid = money(
    invoice.amountPaid,
    "Invoice cash received"
  );

  const invoiceBalance = money(
    invoice.balanceDue,
    "Invoice balance"
  );

  /*
   * The calling payment service may update invoice cash totals
   * immediately before or immediately after this helper.
   * Accept either complete state, never a mixture of both.
   */
  const beforePayment =
    invoicePaid === totalRecovered &&
    invoiceBalance === totalOutstanding;

  const afterPayment =
    invoicePaid === roundMoney(totalRecovered + amount) &&
    invoiceBalance === roundMoney(totalOutstanding - amount);

  if (
    invoiceTotal !== totalAllocated ||
    (!beforePayment && !afterPayment) ||
    amount > totalOutstanding
  ) {
    failAllocation(
      "The payment does not agree with the invoice and purchase balances. Review the allocation before retrying."
    );
  }

  let remainingPayment = amount;
  const allocations = [];

  for (const entry of prepared) {
    if (remainingPayment === 0) break;
    if (entry.outstanding === 0) continue;

    const {
      line,
      purchase,
      history,
      recovered,
      outstanding,
    } = entry;

    const allocatedAmount = roundMoney(
      Math.min(outstanding, remainingPayment)
    );

    const nextRecovered = roundMoney(
      recovered + allocatedAmount
    );

    const nextOutstanding = roundMoney(
      outstanding - allocatedAmount
    );

    purchase.recoveredAmount = nextRecovered;
    purchase.outstandingAmount = nextOutstanding;

    purchase.recoveryStatus =
      nextOutstanding === 0 ? "Paid" : "Partially Paid";

    purchase.status =
      nextOutstanding === 0
        ? "Recovered"
        : "Partially Recovered";

    purchase.paymentAllocations.push({
      invoiceNumber: invoice.invoiceNumber,
      paymentDate: parsedPaymentDate,
      paymentAmount: allocatedAmount,
      journalEntryNumber: journalNumber,
      receivedBy,
      remainingBalance: nextOutstanding,
    });

    history.recoveredAmount = nextRecovered;
    history.outstandingAmount = nextOutstanding;
    history.status = purchase.recoveryStatus;

    line.recoveredAmount = nextRecovered;
    line.outstandingAmount = nextOutstanding;

    await purchase.save({ session });

    remainingPayment = roundMoney(
      remainingPayment - allocatedAmount
    );

    allocations.push({
      purchaseNumber: purchase.purchaseNumber,
      allocatedAmount,
      remainingBalance: nextOutstanding,
      recoveryStatus: purchase.recoveryStatus,
    });
  }

  if (remainingPayment !== 0) {
    failAllocation(
      "The complete payment could not be allocated. The payment transaction must be rolled back."
    );
  }

  await invoice.save({ session });

  return {
    totalAllocated: amount,
    unallocatedAmount: 0,
    allocations,
  };
};

module.exports = {
  syncCustomerPurchaseFromPackage,
  getRecoveryInvoiceData,
  markPurchasesInvoiced,
  allocateInvoicePaymentToPurchases,
};