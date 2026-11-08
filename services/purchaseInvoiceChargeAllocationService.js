const CustomerPurchase = require("../models/CustomerPurchase");

const fail = (message) => {
  const error = new Error(message);
  error.statusCode = 409;
  throw error;
};

const cents = (value, label) => {
  const number = Number(value);
  const result = Math.round(number * 100);

  if (
    !Number.isFinite(number) ||
    !Number.isSafeInteger(result) ||
    result < 0
  ) {
    fail(`${label} must be a valid non-negative amount.`);
  }

  return result;
};

const componentFields = [
  "itemRecoveryAmount",
  "shoppingAssistanceFee",
  "weightCharge",
  "shippingCharge",
  "customsDuty",
  "deliveryFee",
  "otherCharges",
];

const chargeMap = {
  processingFee: "shoppingAssistanceFee",
  customsDuty: "customsDuty",
  deliveryFee: "deliveryFee",
  otherAdjustment: "otherCharges",
};

const allocatePurchaseInvoiceCharges = async ({
  invoice,
  next,
  newTotal,
  session,
  user = null,
}) => {
  if (!session?.inTransaction()) {
    fail("Purchase charge changes require a transaction.");
  }

  if (
    invoice.invoiceSource !== "Customer Purchases" ||
    !invoice.customerPurchases?.length
  ) {
    fail("A complete Customer Purchases invoice is required.");
  }

  if (
    Number(invoice.pointsRedeemed || 0) !== 0 ||
    Number(invoice.posDiscountAmount || 0) !== 0 ||
    invoice.writeOffJournalEntryNumber ||
    [
      "Pending Approval",
      "Approved",
      "Written Off",
      "Recovered",
    ].includes(invoice.writeOffStatus)
  ) {
    fail(
      "This invoice has a discount or write-off requiring a separate review."
    );
  }

  if (
    cents(invoice.gct || 0, "Current GCT") !== 0 ||
    cents(next.gct, "New GCT") !== 0
  ) {
    fail(
      "GCT changes require a tax-aware purchase allocation and are not supported here."
    );
  }

  const rows = [];
  const seen = new Set();

  for (const line of invoice.customerPurchases) {
    if (
      !line.purchaseNumber ||
      seen.has(line.purchaseNumber)
    ) {
      fail("Duplicate or missing purchase allocation.");
    }

    seen.add(line.purchaseNumber);

    const purchase = await CustomerPurchase.findOne({
      purchaseNumber: line.purchaseNumber,
      invoiceNumber: invoice.invoiceNumber,
      customerEkonId: invoice.customerEkonId,
    }).session(session);

    if (
      !purchase ||
      ["Cancelled", "Refunded", "Reversed"].includes(
        purchase.status
      ) ||
      ["Refunded", "Written Off"].includes(
        purchase.recoveryStatus
      )
    ) {
      fail(
        `Purchase ${line.purchaseNumber} cannot receive this adjustment.`
      );
    }

    const histories = (
      purchase.invoiceHistory || []
    ).filter(
      (entry) =>
        entry.invoiceNumber === invoice.invoiceNumber
    );

    if (histories.length !== 1) {
      fail(
        `Invoice history needs review for ${line.purchaseNumber}.`
      );
    }

    const history = histories[0];
    const values = {};

    for (const field of componentFields) {
      values[field] = cents(line[field], field);

      if (
        values[field] !== cents(purchase[field], field)
      ) {
        fail(
          `Charge mismatch for ${line.purchaseNumber}: ${field}.`
        );
      }
    }

    const total = componentFields.reduce(
      (sum, field) => sum + values[field],
      0
    );

    const recovered = cents(
      line.recoveredAmount,
      "Recovered amount"
    );

    const outstanding = cents(
      line.outstandingAmount,
      "Outstanding amount"
    );

    if (
      total !==
        cents(
          line.allocatedInvoiceAmount,
          "Invoice allocation"
        ) ||
      total !== recovered + outstanding ||
      total !==
        cents(purchase.totalCustomerCharge, "Purchase total") ||
      recovered !==
        cents(
          purchase.recoveredAmount,
          "Purchase recovered amount"
        ) ||
      outstanding !==
        cents(purchase.outstandingAmount, "Purchase balance") ||
      total !==
        cents(
          history.allocatedInvoiceAmount,
          "History allocation"
        ) ||
      recovered !==
        cents(history.recoveredAmount, "History recovery") ||
      outstanding !==
        cents(history.outstandingAmount, "History balance")
    ) {
      fail(
        `Purchase and invoice balances disagree for ${line.purchaseNumber}.`
      );
    }

    rows.push({
      line,
      purchase,
      history,
      values,
      total,
      recovered,
      outstanding,
    });
  }

  const sum = (getValue) =>
    rows.reduce(
      (value, row) => value + getValue(row),
      0
    );

  if (
    sum((row) => row.total) !==
      cents(invoice.finalTotal, "Invoice total") ||
    sum((row) => row.recovered) !==
      cents(invoice.amountPaid, "Invoice payments") ||
    sum((row) => row.outstanding) !==
      cents(invoice.balanceDue, "Invoice balance") ||
    sum((row) => row.values.itemRecoveryAmount) !==
      cents(
        invoice.customerPurchaseRecoveryAmount,
        "Goods recovery"
      ) ||
    sum(
      (row) =>
        row.values.weightCharge +
        row.values.shippingCharge
    ) !== cents(invoice.subtotal, "Shipping subtotal")
  ) {
    fail(
      "Invoice totals and purchase allocations need review before editing charges."
    );
  }

  const changes = Object.entries(chargeMap).map(
    ([invoiceField, purchaseField]) => {
      const previous = cents(
        invoice[invoiceField],
        invoiceField
      );

      if (
        sum((row) => row.values[purchaseField]) !==
        previous
      ) {
        fail(
          `Invoice ${invoiceField} allocations disagree.`
        );
      }

      return {
        purchaseField,
        delta:
          cents(next[invoiceField], invoiceField) -
          previous,
      };
    }
  );

  // Apply increases before offsetting reductions.
  changes.sort((a, b) => b.delta - a.delta);

  for (const { purchaseField, delta } of changes) {
    if (!delta) continue;

    const reduction = delta < 0;
    const amount = Math.abs(delta);

    const capacities = rows.map((row) =>
      reduction
        ? Math.min(
            row.values[purchaseField],
            row.outstanding
          )
        : amount
    );

    if (
      reduction &&
      capacities.reduce((a, b) => a + b, 0) < amount
    ) {
      fail(
        `Cannot reduce ${purchaseField} without reducing a paid allocation. Review the individual purchase charges.`
      );
    }

    const weights = rows.map((row, index) =>
      reduction
        ? capacities[index]
        : row.values[purchaseField]
    );

    const weightTotal = weights.reduce(
      (a, b) => a + b,
      0
    );

    const shares = weights.map((weight, index) =>
      Math.min(
        capacities[index],
        Math.floor(
          amount *
            (weightTotal
              ? weight / weightTotal
              : 1 / rows.length)
        )
      )
    );

    let remaining =
      amount - shares.reduce((a, b) => a + b, 0);

    for (
      let index = 0;
      index < rows.length && remaining > 0;
      index++
    ) {
      const extra = Math.min(
        remaining,
        capacities[index] - shares[index]
      );

      shares[index] += extra;
      remaining -= extra;
    }

    if (remaining !== 0) {
      fail(
        "Could not allocate the complete charge adjustment."
      );
    }

    rows.forEach((row, index) => {
      const change = reduction
        ? -shares[index]
        : shares[index];

      row.values[purchaseField] += change;
      row.total += change;
      row.outstanding += change;
    });
  }

  if (
    sum((row) => row.total) !==
    cents(newTotal, "New invoice total")
  ) {
    fail(
      "Adjusted purchase totals do not match the invoice."
    );
  }

  for (const row of rows) {
    const {
      line,
      purchase,
      history,
      values,
      total,
      recovered,
      outstanding,
    } = row;

    for (const field of componentFields) {
      line[field] = values[field] / 100;
      purchase[field] = values[field] / 100;
    }

    line.allocatedInvoiceAmount = total / 100;
    purchase.totalCustomerCharge = total / 100;
    history.allocatedInvoiceAmount = total / 100;

    line.outstandingAmount = outstanding / 100;
    purchase.outstandingAmount = outstanding / 100;
    history.outstandingAmount = outstanding / 100;

    purchase.recoveryStatus =
      outstanding === 0
        ? "Paid"
        : recovered > 0
          ? "Partially Paid"
          : "Invoiced";

    purchase.status =
      outstanding === 0
        ? "Recovered"
        : recovered > 0
          ? "Partially Recovered"
          : "Invoiced";

    history.status = purchase.recoveryStatus;

    purchase.updatedBy =
      user?.fullName ||
      user?.name ||
      user?.email ||
      "System User";

    await purchase.save({ session });
  }

  invoice.customerPurchaseTotal = newTotal;
};

module.exports = { allocatePurchaseInvoiceCharges };