// The order determines which outstanding charge is repaid first.
const chargeFields = [
  "itemRecoveryAmount",
  "shoppingAssistanceFee",
  "weightCharge",
  "shippingCharge",
  "customsDuty",
  "deliveryFee",
  "otherCharges",
];

const fail = (message, statusCode = 409) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  throw error;
};

const toCents = (value, label, statusCode = 409) => {
  const text = String(value ?? "").trim();

  if (!/^\d+(?:\.\d{1,2})?$/.test(text)) {
    fail(`${label} must be a non-negative amount with up to two decimals.`, statusCode);
  }

  const [whole, fraction = ""] = text.split(".");
  const cents = Number(whole + fraction.padEnd(2, "0"));

  if (!Number.isSafeInteger(cents)) {
    fail(`${label} exceeds the supported amount.`, statusCode);
  }

  return cents;
};

const allocateDirectRepayment = (purchase, amountReceived) => {
  if (purchase.invoiceNumber || purchase.invoiceHistory?.length) {
    fail("Use the linked invoice to record this repayment.");
  }

  const amount = toCents(amountReceived, "Amount received", 400);
  const outstanding = toCents(purchase.outstandingAmount, "Outstanding balance");
  const recovered = toCents(purchase.recoveredAmount ?? 0, "Amount recovered");
  const total = toCents(purchase.totalCustomerCharge, "Total customer charge");

  if (amount === 0 || amount > outstanding) {
    fail("Enter an amount greater than zero and within the outstanding balance.", 400);
  }

  const remaining = {};
  for (const field of chargeFields) {
    remaining[field] = toCents(purchase[field] ?? 0, field);
  }

  let previousPayments = 0;

  for (const receipt of purchase.paymentAllocations ?? []) {
    if (!receipt.appliedCharges || receipt.invoiceNumber) {
      fail("Review the existing payment allocations before recording a direct repayment.");
    }

    let receiptTotal = 0;
    for (const field of chargeFields) {
      const paid = toCents(receipt.appliedCharges[field] ?? 0, field);
      remaining[field] -= paid;
      receiptTotal += paid;

      if (remaining[field] < 0) {
        fail(`Previous repayments exceed the saved charge for ${field}.`);
      }
    }

    if (receiptTotal !== toCents(receipt.paymentAmount, "Previous payment")) {
      fail("A previous payment does not match its charge breakdown.");
    }

    previousPayments += receiptTotal;
  }

  const remainingTotal = chargeFields.reduce(
    (sum, field) => sum + remaining[field],
    0
  );

  if (
    previousPayments !== recovered ||
    total - recovered !== outstanding ||
    remainingTotal !== outstanding
  ) {
    fail("The purchase charges and payment history do not agree with the outstanding balance.");
  }

  const appliedCharges = {};
  let unallocated = amount;

  for (const field of chargeFields) {
    const applied = Math.min(unallocated, remaining[field]);
    appliedCharges[field] = applied / 100;
    unallocated -= applied;
  }

  return {
    appliedCharges,
    recoveredAmount: (recovered + amount) / 100,
    outstandingAmount: (outstanding - amount) / 100,
  };
};

module.exports = { allocateDirectRepayment };