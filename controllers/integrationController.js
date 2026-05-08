const Package = require("../models/Package");
const Customer = require("../models/Customer");
const PointsHistory = require("../models/PointsHistory");
const CustomerNotification = require("../models/CustomerNotification");
const IntegrationLog = require("../models/IntegrationLog");
const UnmatchedPackage = require("../models/UnmatchedPackage");
const { completeReferral } = require("./referralController");
const { writeAuditLog } = require("../utils/auditLogger");

const getJamaicaDateString = (date = new Date()) => {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Jamaica",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  return formatter.format(date);
};

const createIntegrationLog = async ({
  source = "Freight Partner",
  eventType = "PACKAGE_ARRIVAL",
  status = "Success",
  trackingNumber = "",
  customerEkonId = "",
  message = "",
  payload = {},
  errorDetails = "",
}) => {
  await IntegrationLog.create({
    logNumber: `INT-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
    source,
    eventType,
    status,
    trackingNumber,
    customerEkonId,
    message,
    payload,
    errorDetails,
  });
};

const createUnmatchedPackage = async ({
  trackingNumber = "",
  customerEkonId = "",
  customerName = "",
  courier = "",
  weight = 0,
  warehouseLocation = "",
  dateReceived = null,
  externalPackageId = "",
  externalWarehouseId = "",
  externalStatus = "",
  integrationSource = "Freight Partner",
  issueReason = "",
  rawPayload = {},
}) => {
  return await UnmatchedPackage.create({
    unmatchedNumber: `UNM-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
    trackingNumber,
    customerEkonId,
    customerName,
    courier,
    weight: Number(weight || 0),
    warehouseLocation,
    dateReceived: dateReceived || new Date(),
    externalPackageId,
    externalWarehouseId,
    externalStatus,
    integrationSource,
    issueReason,
    status: "Pending Review",
    rawPayload,
  });
};

const awardWarehousePointsIfEligible = async (customer, pkg, req) => {
  if (!customer || !pkg) return 0;
  if (pkg.status !== "At Warehouse") return 0;

  const oldPoints = Number(customer.pointsBalance || 0);
  const newPoints = Math.min(oldPoints + 100, 1500);
  const pointsAwarded = newPoints - oldPoints;

  if (pointsAwarded > 0) {
    customer.pointsBalance = newPoints;
    customer.lastActivityDate = getJamaicaDateString();
    await customer.save();

    await PointsHistory.create({
      customerEkonId: customer.ekonId,
      customerName: customer.name,
      action: `Package ${pkg.trackingNumber} marked At Warehouse by freight integration`,
      points: pointsAwarded,
      date: getJamaicaDateString(),
    });

    await writeAuditLog({
      req,
      action: "AWARD_POINTS_INTEGRATION",
      module: "Points History",
      description: `${pointsAwarded} EK points awarded to ${customer.name} (${customer.ekonId}) from freight integration package ${pkg.trackingNumber}`,
      targetType: "Customer",
      targetId: customer.ekonId,
      metadata: {
        trackingNumber: pkg.trackingNumber,
        pointsAwarded,
        newPointsBalance: customer.pointsBalance,
        integrationSource: pkg.integrationSource,
      },
    });
  }

  return pointsAwarded;
};

const receiveFreightPackage = async (req, res) => {
  const payload = req.body || {};

  try {
    const {
      trackingNumber,
      customerEkonId,
      customerName,
      courier = "",
      weight = 0,
      warehouseLocation = "",
      dateReceived,
      externalPackageId = "",
      externalWarehouseId = "",
      externalStatus = "ARRIVED",
      integrationSource = req.integrationPartner?.partnerName || "Freight Partner",
    } = payload;

    if (!trackingNumber) {
  await createIntegrationLog({
    source: integrationSource,
    status: "Failed",
    trackingNumber,
    customerEkonId,
    message: "Missing tracking number.",
    payload,
    errorDetails: "trackingNumber is required.",
  });

  return res.status(400).json({
    success: false,
    message: "trackingNumber is required.",
  });
}

if (!customerEkonId) {
  const unmatched = await createUnmatchedPackage({
    trackingNumber,
    customerEkonId,
    customerName,
    courier,
    weight,
    warehouseLocation,
    dateReceived,
    externalPackageId,
    externalWarehouseId,
    externalStatus,
    integrationSource,
    issueReason: "Missing customer EKON ID.",
    rawPayload: payload,
  });

  await createIntegrationLog({
    source: integrationSource,
    status: "Failed",
    trackingNumber,
    customerEkonId,
    message: "Package saved to unmatched review queue because customer EKON ID is missing.",
    payload,
    errorDetails: "Missing customer EKON ID.",
  });

  await writeAuditLog({
    req,
    action: "CREATE_UNMATCHED_PACKAGE",
    module: "Integrations",
    description: `Unmatched package ${trackingNumber} saved for review due to missing EKON ID`,
    targetType: "UnmatchedPackage",
    targetId: unmatched.unmatchedNumber,
    metadata: {
      trackingNumber,
      integrationSource,
      issueReason: "Missing customer EKON ID.",
    },
  });

  return res.status(202).json({
    success: true,
    needsReview: true,
    message: "Package saved to unmatched review queue. Customer EKON ID is missing.",
    data: unmatched,
  });
}

    const existingPackage = await Package.findOne({ trackingNumber });

    if (existingPackage) {
      await createIntegrationLog({
        source: req.integrationPartner?.partnerName || "Freight Partner",
        status: "Duplicate",
        trackingNumber,
        customerEkonId,
        message: "Package already exists. Duplicate ignored.",
        payload,
      });

      return res.status(409).json({
        success: false,
        message: "Package already exists. Duplicate ignored.",
        data: existingPackage,
      });
    }

    const customer = await Customer.findOne({ ekonId: customerEkonId });

    if (!customer) {
  const unmatched = await createUnmatchedPackage({
    trackingNumber,
    customerEkonId,
    customerName,
    courier,
    weight,
    warehouseLocation,
    dateReceived,
    externalPackageId,
    externalWarehouseId,
    externalStatus,
    integrationSource,
    issueReason: `Customer not found for EKON ID ${customerEkonId}.`,
    rawPayload: payload,
  });

  await createIntegrationLog({
    source: integrationSource,
    status: "Failed",
    trackingNumber,
    customerEkonId,
    message: "Package saved to unmatched review queue because customer was not found.",
    payload,
    errorDetails: `No customer found for ${customerEkonId}`,
  });

  await writeAuditLog({
    req,
    action: "CREATE_UNMATCHED_PACKAGE",
    module: "Integrations",
    description: `Unmatched package ${trackingNumber} saved for review due to invalid EKON ID ${customerEkonId}`,
    targetType: "UnmatchedPackage",
    targetId: unmatched.unmatchedNumber,
    metadata: {
      trackingNumber,
      customerEkonId,
      integrationSource,
      issueReason: `Customer not found for EKON ID ${customerEkonId}.`,
    },
  });

  return res.status(202).json({
    success: true,
    needsReview: true,
    message: "Package saved to unmatched review queue. Customer could not be matched.",
    data: unmatched,
  });
}

    const now = new Date();

    const newPackage = await Package.create({
      trackingNumber,
      customerEkonId: customer.ekonId,
      customerName: customerName || customer.name,
      courier,
      weight: Number(weight || 0),
      status: "At Warehouse",
      warehouseLocation,
      invoiceStatus: "Pending",
      readyForPickup: false,
      readyForPickupDate: null,
      statusUpdatedAt: now,
      dateReceived: dateReceived || now,

      integrationSource,
      externalWarehouseId,
      externalPackageId,
      externalStatus,
      lastExternalSyncAt: now,
      syncNotes: "Created from freight partner integration.",

      addedByUserId: "FREIGHT-INTEGRATION",
      addedByName: "Freight Partner API",
      addedByEmail: "",
      addedByRole: "Integration",
    });

    const pointsAwarded = await awardWarehousePointsIfEligible(customer, newPackage, req);

    try {
      const customerPackageCount = await Package.countDocuments({
        customerEkonId: newPackage.customerEkonId,
      });

      if (customerPackageCount === 1) {
        await completeReferral(newPackage.customerEkonId, newPackage.trackingNumber);
      }
    } catch (referralError) {
      console.error("Referral reward processing failed:", referralError.message);
    }

    await CustomerNotification.create({
      notificationNumber: `NTF-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
      customerEkonId: customer.ekonId,
      customerName: customer.name,
      title: "Package Received at Warehouse",
      message: `Your package ${newPackage.trackingNumber} has been received at the warehouse.${pointsAwarded > 0 ? ` You earned ${pointsAwarded} EK points.` : ""}`,
      type: "Package Update",
      referenceType: "Package",
      referenceId: newPackage.trackingNumber,
      isRead: false,
      date: getJamaicaDateString(),
    });

    await createIntegrationLog({
      source: integrationSource,
      status: "Success",
      trackingNumber,
      customerEkonId: customer.ekonId,
      message: "Package created successfully from freight integration.",
      payload,
    });

    await writeAuditLog({
      req,
      action: "CREATE_PACKAGE_INTEGRATION",
      module: "Integrations",
      description: `Package ${newPackage.trackingNumber} created from freight integration for ${customer.name}`,
      targetType: "Package",
      targetId: newPackage.trackingNumber,
      metadata: {
        customerEkonId: customer.ekonId,
        integrationSource,
        externalPackageId,
        externalWarehouseId,
        externalStatus,
        pointsAwarded,
      },
    });

    return res.status(201).json({
      success: true,
      message: "Package received and created successfully.",
      data: newPackage,
      pointsAwarded,
      customerPointsBalance: customer.pointsBalance,
    });
  } catch (error) {
    console.error("Freight integration error:", error);

    await createIntegrationLog({
      status: "Failed",
      trackingNumber: payload.trackingNumber || "",
      customerEkonId: payload.customerEkonId || "",
      message: "Freight integration failed.",
      payload,
      errorDetails: error.message,
    });

    return res.status(500).json({
      success: false,
      message: "Freight integration failed.",
      error: error.message,
    });
  }
};

module.exports = {
  receiveFreightPackage,
};