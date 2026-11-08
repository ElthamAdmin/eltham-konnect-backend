const crypto = require("crypto");
const mongoose = require("mongoose");
const Customer = require("../models/Customer");
const Package = require("../models/Package");
const CustomerPurchase = require("../models/CustomerPurchase");
const Invoice = require("../models/Invoice");
const ShippingRate = require("../models/ShippingRate");
const PointsHistory = require("../models/PointsHistory");
const CustomerNotification = require("../models/CustomerNotification");

const {
  postCustomerInvoice,
  postCustomerPurchaseRecoveryInvoice,
} = require("./accountingService");

const {
  getRecoveryInvoiceData,
  markPurchasesInvoiced,
} = require("./customerPurchaseIntegrationService");

const fail = (message, statusCode = 400) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  throw error;
};

const money = (value = 0) => {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    fail("Invoice amounts must be valid numbers.");
  }

  return Math.round((number + Number.EPSILON) * 100) / 100;
};

const today = () => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Jamaica",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  return ["year", "month", "day"]
    .map((name) => parts.find((part) => part.type === name).value)
    .join("-");
};

const uniqueSelection = (values, label) => {
  if (
    !Array.isArray(values) ||
    !values.length ||
    values.some(
      (value) =>
        typeof value !== "string" ||
        !value.trim() ||
        value !== value.trim()
    ) ||
    new Set(values).size !== values.length
  ) {
    fail(`Select distinct, valid ${label}.`);
  }

  return values;
};

const customerFor = async (ekonId, session) => {
  if (typeof ekonId !== "string" || !ekonId.trim()) {
    fail("Customer EKON ID is required.");
  }

  const customer = await Customer.findOne({
    ekonId: ekonId.trim(),
  }).session(session);

  if (!customer) fail("Customer not found.", 404);
  return customer;
};

const checkExistingBilling = async (customerEkonId, packages, session) => {
  const trackingNumbers = packages.map((pkg) => pkg.trackingNumber);

  if (!trackingNumbers.length) return;

  const existing = await Invoice.findOne({
    customerEkonId,
    invoiceSource: { $ne: "Storage" },
    status: { $ne: "Cancelled" },
    $or: [
      { "packages.trackingNumber": { $in: trackingNumbers } },
      { "customerPurchases.trackingNumber": { $in: trackingNumbers } },
    ],
  }).session(session);

  if (existing) {
    fail(
      `A selected package is already billed on ${existing.invoiceNumber}. ` +
        "Refresh the invoice list before proceeding.",
      409
    );
  }

  if (
    packages.some((pkg) =>
      ["Issued", "Paid"].includes(pkg.invoiceStatus)
    )
  ) {
    fail("A selected package is already invoiced. Refresh Packages.", 409);
  }
};

const notify = async (customer, invoice, session) => {
  await CustomerNotification.create(
    [{
      notificationNumber: `NTF-${crypto.randomUUID()}`,
      customerEkonId: customer.ekonId,
      customerName: customer.name,
      title: "New Invoice Generated",
      message:
        `Invoice ${invoice.invoiceNumber} generated. ` +
        `Total: JMD ${invoice.finalTotal.toLocaleString()}.`,
      type: "Invoice Update",
      referenceType: "Invoice",
      referenceId: invoice.invoiceNumber,
      isRead: false,
      date: today(),
    }],
    { session }
  );
};

const stampJournal = (invoice, journal) => {
  if (!journal) return;
  invoice.journalEntryNumber = journal.entryNumber;
  invoice.journalStatus = "Posted";
  invoice.journalPostedAt = new Date();
};

const createFreightInvoice = async ({ body, user, allReady = false }) =>
  mongoose.connection.transaction(async (session) => {
    if (body.customerPurchaseNumbers?.length) {
      fail("Invoice ordinary packages and Shopping Assistance purchases separately.");
    }

    const customer = await customerFor(body.customerEkonId, session);
    let packageIds = null;

    if (!allReady) {
      packageIds = uniqueSelection(body.packageIds, "packages");

      if (packageIds.some((id) => !mongoose.isValidObjectId(id))) {
        fail("A selected package reference is invalid.");
      }
    }

    const packages = await Package.find({
      customerEkonId: customer.ekonId,
      status: "Ready for Pickup",
      readyForPickup: true,
      invoiceStatus: { $nin: ["Issued", "Paid"] },
      ...(packageIds ? { _id: { $in: packageIds } } : {}),
    }).session(session);

    if (
      !packages.length ||
      (packageIds && packages.length !== packageIds.length)
    ) {
      fail(
        "Every selected package must belong to this customer, be Ready for Pickup, and be uninvoiced. Refresh your selection.",
        409
      );
    }

    const purchase = await CustomerPurchase.findOne({
      $or: [
        { packageId: { $in: packages.map((pkg) => pkg._id) } },
        {
          customerEkonId: customer.ekonId,
          trackingNumber: {
            $in: packages.map((pkg) => pkg.trackingNumber),
          },
        },
      ],
    }).session(session);

    if (
      purchase ||
      packages.some((pkg) =>
        pkg.customerPurchaseId || pkg.customerPurchaseNumber
      )
    ) {
      fail(
        "A selected package is linked to Shopping Assistance. Generate its invoice through the purchase selection.",
        409
      );
    }

    await checkExistingBilling(customer.ekonId, packages, session);

    const lines = [];

    for (const pkg of packages) {
      const weight = Number(pkg.weight);

      if (!Number.isFinite(weight) || weight <= 0) {
        fail(`Package ${pkg.trackingNumber} needs a valid positive weight.`);
      }

      const chargeableWeight = Math.ceil(weight);
      const rate = await ShippingRate.findOne({
        weight: chargeableWeight,
      }).session(session);

      if (!rate || !Number.isFinite(Number(rate.price)) || Number(rate.price) < 0) {
        fail(`No valid shipping rate exists for ${chargeableWeight} lb.`);
      }

      lines.push({
        trackingNumber: pkg.trackingNumber,
        chargeableWeight,
        rate: money(rate.price),
      });
    }

    const subtotal = money(lines.reduce((sum, line) => sum + line.rate, 0));
    const charges = {};

    for (const field of ["customsDuty", "gct", "processingFee", "deliveryFee"]) {
      charges[field] = money(body[field] ?? 0);
      if (charges[field] < 0) fail(`${field} cannot be negative.`);
    }

    charges.otherAdjustment = money(body.otherAdjustment ?? 0);
    charges.adjustmentNote = String(body.adjustmentNote || "").trim();
    charges.deliveryType = String(body.deliveryType || "").trim();

    const requestedPoints = Number(body.pointsToRedeem ?? 0);

    if (
      !Number.isFinite(requestedPoints) ||
      !Number.isInteger(requestedPoints) ||
      requestedPoints < 0
    ) {
      fail("Points to redeem must be a whole number of zero or greater.");
    }

    const balance = Number(customer.pointsBalance || 0);

    if (
      requestedPoints > 0 &&
      (!Number.isFinite(balance) || balance < 500 || requestedPoints > balance)
    ) {
      fail("Check the customer's points balance and minimum redemption requirement.");
    }

    const pointsRedeemed = Math.min(requestedPoints, subtotal);

    const finalTotal = money(
      subtotal +
      charges.customsDuty +
      charges.gct +
      charges.processingFee +
      charges.deliveryFee +
      charges.otherAdjustment -
      pointsRedeemed
    );

    if (finalTotal <= 0) {
      fail("The invoice total must be greater than zero. Review the charges, adjustments and points.");
    }

    const date = today();

    const [invoice] = await Invoice.create(
      [{
        invoiceNumber: `INV-${crypto.randomUUID()}`,
        customerEkonId: customer.ekonId,
        customerName: customer.name,
        invoiceSource: "Packages",
        packages: lines,
        packageCount: lines.length,
        subtotal,
        ...charges,
        pointsRedeemed,
        finalTotal,
        amountPaid: 0,
        balanceDue: finalTotal,
        status: "Unpaid",
        dueDate: date,
        paymentTerms: "Due on Receipt",
        createdAt: date,
      }],
      { session }
    );

    if (pointsRedeemed > 0) {
      customer.pointsBalance = balance - pointsRedeemed;
      customer.lastActivityDate = date;
      await customer.save({ session });

      await PointsHistory.create(
        [{
          customerEkonId: customer.ekonId,
          customerName: customer.name,
          action: `Redeemed on ${invoice.invoiceNumber}`,
          points: -pointsRedeemed,
          reference: invoice.invoiceNumber,
          note: `Applied to invoice ${invoice.invoiceNumber}`,
          date,
        }],
        { session }
      );
    }

    const journal = await postCustomerInvoice({ invoice, user, session });
    stampJournal(invoice, journal);
    await invoice.save({ session });

    for (const pkg of packages) {
      pkg.invoiceStatus = "Issued";
      await pkg.save({ session });
    }

    await notify(customer, invoice, session);
    return invoice;
  });

const createRecoveryInvoice = async ({ body, user }) =>
  mongoose.connection.transaction(async (session) => {
    if (body.packageIds?.length) {
      fail("Invoice ordinary packages and Shopping Assistance purchases separately.");
    }

    const customer = await customerFor(body.customerEkonId, session);
    const purchaseNumbers = uniqueSelection(
      body.customerPurchaseNumbers,
      "customer purchases"
    );

    const recovery = await getRecoveryInvoiceData({
      customerEkonId: customer.ekonId,
      purchaseNumbers,
      session,
    });

    const {
      purchases,
      packages,
      totals,
      invoicePurchaseLines,
      invoicePackageLines,
    } = recovery;

    for (const pkg of packages) {
      if (
        pkg.customerEkonId !== customer.ekonId ||
        ["Deleted", "Deleted by KP"].includes(pkg.status)
      ) {
        fail("A purchase has an invalid package link.", 409);
      }
    }

    for (const purchase of purchases) {
      if (
        purchase.packageId &&
        !packages.some((pkg) => String(pkg._id) === String(purchase.packageId))
      ) {
        fail(`The package linked to ${purchase.purchaseNumber} was not found.`, 409);
      }
    }

    const lineTotal = money(
      invoicePurchaseLines.reduce(
        (sum, line) => sum + Number(line.allocatedInvoiceAmount),
        0
      )
    );

    if (
      lineTotal <= 0 ||
      lineTotal !== money(totals.totalCustomerPurchaseAmount) ||
      invoicePurchaseLines.some((line) =>
        !Number.isFinite(Number(line.allocatedInvoiceAmount)) ||
        Number(line.allocatedInvoiceAmount) < 0
      )
    ) {
      fail("Purchase recovery totals do not match. Review recovery charges before invoicing.", 409);
    }

    await checkExistingBilling(customer.ekonId, packages, session);

    const previous = await Invoice.findOne({
      status: { $ne: "Cancelled" },
      "customerPurchases.purchaseNumber": { $in: purchaseNumbers },
    }).session(session);

    if (previous) {
      fail(`A selected purchase is already billed on ${previous.invoiceNumber}.`, 409);
    }

    const date = today();

    const [invoice] = await Invoice.create(
      [{
        invoiceNumber: `INV-${crypto.randomUUID()}`,
        customerEkonId: customer.ekonId,
        customerName: customer.name,
        invoiceSource: "Customer Purchases",
        packages: invoicePackageLines,
        packageCount: invoicePackageLines.length,
        customerPurchases: invoicePurchaseLines,
        customerPurchaseCount: invoicePurchaseLines.length,
        customerPurchaseRecoveryAmount: totals.recoverableAmount,
        shoppingAssistanceFee: totals.shoppingServiceFee,
        customerPurchaseWeightCharge: totals.weightCharge,
        customerPurchaseShippingCharge: totals.shippingCharge,
        customerPurchaseCustomsDuty: totals.customsDuty,
        customerPurchaseDeliveryFee: totals.deliveryFee,
        customerPurchaseOtherCharges: totals.otherCharges,
        customerPurchaseTotal: lineTotal,
        subtotal: totals.shippingRevenue,
        customsDuty: totals.customsDuty,
        processingFee: totals.shoppingServiceFee,
        deliveryFee: totals.deliveryFee,
        otherAdjustment: totals.otherCharges,
        adjustmentNote: "Generated from Customer Purchase recovery records.",
        finalTotal: lineTotal,
        amountPaid: 0,
        balanceDue: lineTotal,
        status: "Unpaid",
        dueDate: date,
        paymentTerms: "Due on Receipt",
        createdAt: date,
      }],
      { session }
    );

    const journal = await postCustomerPurchaseRecoveryInvoice({
      customerName: customer.name,
      invoiceNumber: invoice.invoiceNumber,
      recoverableAmount: totals.recoverableAmount,
      shoppingServiceFee: totals.shoppingServiceFee,
      shippingRevenue: totals.shippingRevenue,
      deliveryRevenue: totals.deliveryFee,
      otherServiceRevenue: totals.otherServiceRevenue,
      invoiceDate: date,
      user,
      session,
    });

    stampJournal(invoice, journal);
    invoice.customerPurchaseJournalEntryNumber = journal.entryNumber;
    await invoice.save({ session });

    await markPurchasesInvoiced({
      purchases,
      invoice,
      journalEntryNumber: journal.entryNumber,
      user,
      session,
    });

    for (const pkg of packages) {
      pkg.invoiceStatus = "Issued";
      await pkg.save({ session });
    }

    await notify(customer, invoice, session);
    return invoice;
  });

module.exports = { createFreightInvoice, createRecoveryInvoice };