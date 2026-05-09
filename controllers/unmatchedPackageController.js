const Package = require("../models/Package");
const Customer = require("../models/Customer");
const PointsHistory = require("../models/PointsHistory");
const CustomerNotification = require("../models/CustomerNotification");
const UnmatchedPackage = require("../models/UnmatchedPackage");
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

const getUnmatchedPackages = async (req, res) => {
  try {
    const packages = await UnmatchedPackage.find().sort({ createdAt: -1 });

    res.json({
      success: true,
      message: "Unmatched packages retrieved successfully",
      totalPackages: packages.length,
      data: packages,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Could not load unmatched packages.",
      error: error.message,
    });
  }
};

const resolveUnmatchedPackage = async (req, res) => {
  try {
    const { unmatchedNumber } = req.params;
    const { customerEkonId } = req.body;

    if (!customerEkonId) {
      return res.status(400).json({
        success: false,
        message: "Customer EKON ID is required.",
      });
    }

    const unmatched = await UnmatchedPackage.findOne({ unmatchedNumber });

    if (!unmatched) {
      return res.status(404).json({
        success: false,
        message: "Unmatched package not found.",
      });
    }

    if (unmatched.status === "Resolved") {
      return res.status(400).json({
        success: false,
        message: "This unmatched package is already resolved.",
      });
    }

    const existingPackage = await Package.findOne({
      trackingNumber: unmatched.trackingNumber,
    });

    if (existingPackage) {
      unmatched.status = "Resolved";
      unmatched.resolvedCustomerEkonId = existingPackage.customerEkonId;
      unmatched.resolvedPackageId = String(existingPackage._id);
      unmatched.resolvedAt = new Date();
      await unmatched.save();

      return res.status(409).json({
        success: false,
        message: "A package with this tracking number already exists. Unmatched item marked as resolved.",
        data: existingPackage,
      });
    }

    const customer = await Customer.findOne({ ekonId: customerEkonId });

    if (!customer) {
      return res.status(404).json({
        success: false,
        message: "Customer not found.",
      });
    }

    const now = new Date();

    const newPackage = await Package.create({
      trackingNumber: unmatched.trackingNumber,
      customerEkonId: customer.ekonId,
      customerName: customer.name,
      courier: unmatched.courier,
      weight: Number(unmatched.weight || 0),
      status: "At Warehouse",
      warehouseLocation: unmatched.warehouseLocation,
      invoiceStatus: "Pending",
      readyForPickup: false,
      readyForPickupDate: null,
      statusUpdatedAt: now,
      dateReceived: unmatched.dateReceived || now,

      integrationSource: unmatched.integrationSource,
      externalWarehouseId: unmatched.externalWarehouseId,
      externalPackageId: unmatched.externalPackageId,
      externalStatus: unmatched.externalStatus,
      lastExternalSyncAt: now,
      syncNotes: `Resolved from unmatched package ${unmatched.unmatchedNumber}`,

      addedByUserId: req.user?.userId || "",
      addedByName: req.user?.fullName || "System User",
      addedByEmail: req.user?.email || "",
      addedByRole: req.user?.role || "",
    });

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
        action: `Package ${newPackage.trackingNumber} resolved from unmatched queue`,
        points: pointsAwarded,
        date: getJamaicaDateString(),
      });
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

    unmatched.status = "Resolved";
    unmatched.resolvedCustomerEkonId = customer.ekonId;
    unmatched.resolvedPackageId = String(newPackage._id);
    unmatched.resolvedAt = now;
    await unmatched.save();

    await writeAuditLog({
      req,
      action: "RESOLVE_UNMATCHED_PACKAGE",
      module: "Integrations",
      description: `Unmatched package ${unmatched.trackingNumber} assigned to ${customer.name} (${customer.ekonId})`,
      targetType: "Package",
      targetId: newPackage.trackingNumber,
      metadata: {
        unmatchedNumber: unmatched.unmatchedNumber,
        customerEkonId: customer.ekonId,
        packageId: newPackage._id,
        pointsAwarded,
      },
    });

    res.json({
      success: true,
      message: "Unmatched package resolved and moved to Packages successfully.",
      data: newPackage,
      unmatched,
      pointsAwarded,
    });
  } catch (error) {
    console.error("Resolve unmatched package error:", error);
    res.status(500).json({
      success: false,
      message: "Could not resolve unmatched package.",
      error: error.message,
    });
  }
};

module.exports = {
  getUnmatchedPackages,
  resolveUnmatchedPackage,
};