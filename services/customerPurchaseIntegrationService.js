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
}) => {
  if (!pkg) return null;

  let purchase = null;

  if (pkg.customerPurchaseNumber) {
    purchase = await CustomerPurchase.findOne({
      purchaseNumber: pkg.customerPurchaseNumber,
    });
  }

  if (!purchase && pkg.customerPurchaseId) {
    purchase = await CustomerPurchase.findById(
      pkg.customerPurchaseId
    );
  }

  if (!purchase && pkg.trackingNumber) {
    purchase = await CustomerPurchase.findOne({
      trackingNumber: pkg.trackingNumber,
      customerEkonId: pkg.customerEkonId,
      status: {
        $nin: ["Cancelled", "Refunded", "Reversed"],
      },
    });
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

  await purchase.save();

  pkg.customerPurchaseId = purchase._id;
  pkg.customerPurchaseNumber = purchase.purchaseNumber;
  pkg.customerPurchaseLinked = true;
  pkg.customerPurchaseLinkedAt =
    pkg.customerPurchaseLinkedAt || new Date();
  pkg.customerPurchaseLinkedBy =
    pkg.customerPurchaseLinkedBy || getUserName(user);

  await pkg.save();

  return purchase;
};

const getRecoveryInvoiceData = async ({
  customerEkonId,
  purchaseNumbers,
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
  });

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
      })
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
}) => {
  const now = new Date();
  const userName = getUserName(user);

  for (const purchase of purchases) {
    const invoiceLine = (
      invoice.customerPurchases || []
    ).find(
      (line) =>
        line.purchaseNumber === purchase.purchaseNumber
    );

    const allocatedInvoiceAmount = roundMoney(
      invoiceLine?.allocatedInvoiceAmount ||
        purchase.totalCustomerCharge ||
        0
    );

    purchase.invoiceNumber = invoice.invoiceNumber;
    purchase.invoiceReady = false;
    purchase.invoicedAt = now;
    purchase.invoiceJournalEntryNumber =
      journalEntryNumber;
    purchase.recoveryStatus = "Invoiced";
    purchase.status = "Invoiced";
    purchase.outstandingAmount =
      allocatedInvoiceAmount;
    purchase.updatedBy = userName;

    purchase.invoiceHistory =
      purchase.invoiceHistory || [];

    purchase.invoiceHistory.push({
      invoiceNumber: invoice.invoiceNumber,
      invoiceDate: now,
      allocatedInvoiceAmount,
      recoveredAmount: 0,
      outstandingAmount:
        allocatedInvoiceAmount,
      journalEntryNumber,
      status: "Invoiced",
    });

    await purchase.save();
  }
};

const allocateInvoicePaymentToPurchases = async ({
  invoice,
  paymentAmount,
  paymentJournalEntryNumber = "",
  paymentDate = new Date(),
  receivedBy = "",
}) => {
  if (
    !invoice ||
    !Array.isArray(invoice.customerPurchases) ||
    invoice.customerPurchases.length === 0
  ) {
    return {
      totalAllocated: 0,
      allocations: [],
    };
  }

  let remainingPayment = roundMoney(paymentAmount);
  const allocations = [];

  for (const invoiceLine of invoice.customerPurchases) {
    if (remainingPayment <= 0) break;

    const purchase = await CustomerPurchase.findOne({
      purchaseNumber: invoiceLine.purchaseNumber,
      invoiceNumber: invoice.invoiceNumber,
    });

    if (!purchase) continue;

    const purchaseOutstanding = roundMoney(
      purchase.outstandingAmount
    );

    if (purchaseOutstanding <= 0) continue;

    const allocatedAmount = roundMoney(
      Math.min(
        purchaseOutstanding,
        remainingPayment
      )
    );

    purchase.recoveredAmount = roundMoney(
      Number(purchase.recoveredAmount || 0) +
        allocatedAmount
    );

    purchase.outstandingAmount = roundMoney(
      Math.max(
        0,
        purchaseOutstanding - allocatedAmount
      )
    );

    purchase.paymentAllocations =
      purchase.paymentAllocations || [];

    purchase.paymentAllocations.push({
      invoiceNumber: invoice.invoiceNumber,
      paymentDate,
      paymentAmount: allocatedAmount,
      journalEntryNumber:
        paymentJournalEntryNumber,
      receivedBy,
      remainingBalance:
        purchase.outstandingAmount,
    });

    if (purchase.outstandingAmount <= 0) {
      purchase.recoveryStatus = "Paid";
      purchase.status = "Recovered";
    } else {
      purchase.recoveryStatus = "Partially Paid";
      purchase.status = "Partially Recovered";
    }

    const historyEntry = (
      purchase.invoiceHistory || []
    )
      .slice()
      .reverse()
      .find(
        (entry) =>
          entry.invoiceNumber === invoice.invoiceNumber
      );

    if (historyEntry) {
      historyEntry.recoveredAmount = roundMoney(
        Number(historyEntry.recoveredAmount || 0) +
          allocatedAmount
      );

      historyEntry.outstandingAmount =
        purchase.outstandingAmount;

      historyEntry.status =
        purchase.outstandingAmount <= 0
          ? "Paid"
          : "Partially Paid";
    }

    await purchase.save();

    invoiceLine.recoveredAmount = roundMoney(
      Number(invoiceLine.recoveredAmount || 0) +
        allocatedAmount
    );

    invoiceLine.outstandingAmount =
      purchase.outstandingAmount;

    remainingPayment = roundMoney(
      remainingPayment - allocatedAmount
    );

    allocations.push({
      purchaseNumber: purchase.purchaseNumber,
      allocatedAmount,
      remainingBalance:
        purchase.outstandingAmount,
      recoveryStatus:
        purchase.recoveryStatus,
    });
  }

  await invoice.save();

  return {
    totalAllocated: roundMoney(
      Number(paymentAmount || 0) - remainingPayment
    ),
    unallocatedAmount: remainingPayment,
    allocations,
  };
};

module.exports = {
  syncCustomerPurchaseFromPackage,
  getRecoveryInvoiceData,
  markPurchasesInvoiced,
  allocateInvoicePaymentToPurchases,
};