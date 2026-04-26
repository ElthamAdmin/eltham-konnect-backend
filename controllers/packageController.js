const Package = require("../models/Package");
const Customer = require("../models/Customer");
const PointsHistory = require("../models/PointsHistory");
const CustomerNotification = require("../models/CustomerNotification");
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

const getJamaicaNow = () => {
  const jamaicaString = new Date().toLocaleString("en-US", {
    timeZone: "America/Jamaica",
  });
  return new Date(jamaicaString);
};

const getRequestUserDetails = (req) => {
  const user = req.user || req.admin || req.systemUser || {};

  return {
    addedByUserId: String(user._id || user.id || req.body.addedByUserId || ""),
    addedByName:
      user.name ||
      user.fullName ||
      user.username ||
      user.email ||
      req.body.addedByName ||
      "System User",
    addedByEmail: user.email || req.body.addedByEmail || "",
    addedByRole: user.role || req.body.addedByRole || "",
  };
};

const getDateRangeByFilter = (filter, customStartDate, customEndDate) => {
  const today = getJamaicaNow();
  today.setHours(0, 0, 0, 0);

  const endOfToday = new Date(today);
  endOfToday.setHours(23, 59, 59, 999);

  let startDate = new Date(today);
  let endDate = new Date(endOfToday);

  switch (filter) {
    case "today":
      break;

    case "thisWeek": {
      const day = startDate.getDay();
      const diff = day === 0 ? 6 : day - 1;
      startDate.setDate(startDate.getDate() - diff);
      break;
    }

    case "thisMonth":
      startDate = new Date(today.getFullYear(), today.getMonth(), 1);
      break;

    case "thisYear":
      startDate = new Date(today.getFullYear(), 0, 1);
      break;

    case "custom":
      if (!customStartDate || !customEndDate) {
        throw new Error("Custom start date and end date are required");
      }
      startDate = new Date(`${customStartDate}T00:00:00`);
      endDate = new Date(`${customEndDate}T23:59:59.999`);
      break;

    default:
      break;
  }

  return { startDate, endDate };
};

const normalizePackageDate = (value) => {
  if (!value) return null;

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;

  return parsed;
};

const getBilledWeight = (weight) => {
  const numericWeight = Number(weight || 0);
  if (numericWeight <= 0) return 0;
  return Math.ceil(numericWeight);
};

const createCustomerNotification = async ({
  customerEkonId,
  customerName,
  title,
  message,
  type,
  referenceType = "",
  referenceId = "",
}) => {
  await CustomerNotification.create({
    notificationNumber: `NTF-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
    customerEkonId,
    customerName,
    title,
    message,
    type,
    referenceType,
    referenceId,
    isRead: false,
    date: getJamaicaDateString(),
  });
};

const awardWarehousePointsIfEligible = async (customer, pkg, req) => {
  if (!customer) return 0;
  if (!pkg) return 0;
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
      action: `Package ${pkg.trackingNumber} marked At Warehouse`,
      points: pointsAwarded,
      date: getJamaicaDateString(),
    });

    if (req) {
      await writeAuditLog({
        req,
        action: "AWARD_POINTS",
        module: "Points History",
        description: `${pointsAwarded} EK points awarded to ${customer.name} (${customer.ekonId}) for package ${pkg.trackingNumber}`,
        targetType: "Customer",
        targetId: customer.ekonId,
        metadata: {
          trackingNumber: pkg.trackingNumber,
          pointsAwarded,
          newPointsBalance: customer.pointsBalance,
        },
      });
    }
  }

  return pointsAwarded;
};

const getPackageWeightAnalysis = async (req, res) => {
  try {
    const {
      filter = "today",
      startDate: customStartDate = "",
      endDate: customEndDate = "",
    } = req.query;

    const { startDate, endDate } = getDateRangeByFilter(
      filter,
      customStartDate,
      customEndDate
    );

    const packages = await Package.find().sort({ dateReceived: -1, _id: -1 });

    const filteredPackages = packages.filter((pkg) => {
      const packageDate = normalizePackageDate(pkg.dateReceived || pkg.createdAt);
      if (!packageDate) return false;
      return packageDate >= startDate && packageDate <= endDate;
    });

    const weightMap = {};

    filteredPackages.forEach((pkg) => {
      const billedWeight = getBilledWeight(pkg.weight);

      if (billedWeight <= 0) return;

      if (!weightMap[billedWeight]) {
        weightMap[billedWeight] = {
          billedWeight,
          packageCount: 0,
          totalActualWeight: 0,
        };
      }

      weightMap[billedWeight].packageCount += 1;
      weightMap[billedWeight].totalActualWeight += Number(pkg.weight || 0);
    });

    const groupedWeights = Object.values(weightMap)
      .sort((a, b) => a.billedWeight - b.billedWeight)
      .map((item) => ({
        ...item,
        totalActualWeight: Number(item.totalActualWeight.toFixed(2)),
        percentageOfPackages:
          filteredPackages.length > 0
            ? Number(((item.packageCount / filteredPackages.length) * 100).toFixed(2))
            : 0,
      }));

    const mostCommonWeight =
      groupedWeights.length > 0
        ? groupedWeights.reduce((top, current) =>
            current.packageCount > top.packageCount ? current : top
          )
        : null;

    res.json({
      success: true,
      message: "Package weight analysis retrieved successfully",
      data: {
        filter,
        startDate,
        endDate,
        totalPackages: filteredPackages.length,
        groupedWeights,
        mostCommonWeight,
      },
    });
  } catch (error) {
    console.error("Error getting package weight analysis:", error);
    res.status(500).json({
      success: false,
      message: "Failed to retrieve package weight analysis",
      error: error.message,
    });
  }
};

const getPackages = async (req, res) => {
  try {
    const packages = await Package.find().sort({ dateReceived: -1, createdAt: -1 });

    res.json({
      success: true,
      message: "Packages retrieved successfully",
      totalPackages: packages.length,
      data: packages,
    });
  } catch (error) {
    console.error("Error getting packages:", error);
    res.status(500).json({
      success: false,
      message: "Failed to retrieve packages",
    });
  }
};

const createPackage = async (req, res) => {
  try {
    const {
      trackingNumber,
      customerEkonId,
      customerName,
      courier,
      weight,
      status,
      warehouseLocation,
      invoiceStatus,
      readyForPickup,
      dateReceived,
    } = req.body;

    if (!trackingNumber || !customerEkonId || !customerName) {
      return res.status(400).json({
        success: false,
        message: "Tracking number, customer EKON ID, and customer name are required",
      });
    }

    const existingPackage = await Package.findOne({ trackingNumber });

    if (existingPackage) {
      return res.status(400).json({
        success: false,
        message: "A package with that tracking number already exists",
      });
    }

    const customer = await Customer.findOne({ ekonId: customerEkonId });

    if (!customer) {
      return res.status(404).json({
        success: false,
        message: "Customer not found",
      });
    }

    const packageStatus = status || "At Warehouse";
    const now = new Date();
    const addedByDetails = getRequestUserDetails(req);

    const newPackage = new Package({
      trackingNumber,
      customerEkonId,
      customerName,
      courier,
      weight,
      status: packageStatus,
      warehouseLocation,
      invoiceStatus: invoiceStatus || "Pending",
      readyForPickup: packageStatus === "Ready for Pickup" ? true : readyForPickup || false,
      readyForPickupDate: packageStatus === "Ready for Pickup" ? now : null,
      statusUpdatedAt: now,
      dateReceived: dateReceived || now,
      ...addedByDetails,
    });

    await newPackage.save();

const pointsAwarded = await awardWarehousePointsIfEligible(customer, newPackage, req);

if (packageStatus === "At Warehouse") {
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
}

    if (packageStatus === "At Warehouse") {
      await createCustomerNotification({
        customerEkonId: customer.ekonId,
        customerName: customer.name,
        title: "Package Received at Warehouse",
        message: `Your package ${newPackage.trackingNumber} has been received at the warehouse.${pointsAwarded > 0 ? ` You earned ${pointsAwarded} EK points.` : ""}`,
        type: "Package Update",
        referenceType: "Package",
        referenceId: newPackage.trackingNumber,
      });
    }

    if (packageStatus === "Ready for Pickup") {
      await createCustomerNotification({
        customerEkonId: customer.ekonId,
        customerName: customer.name,
        title: "Package Ready for Pickup",
        message: `Your package ${newPackage.trackingNumber} is now ready for pickup.`,
        type: "Package Update",
        referenceType: "Package",
        referenceId: newPackage.trackingNumber,
      });
    }

    await writeAuditLog({
      req,
      action: "CREATE_PACKAGE",
      module: "Packages",
      description: `Package ${newPackage.trackingNumber} was created for ${newPackage.customerName}`,
      targetType: "Package",
      targetId: newPackage.trackingNumber,
      metadata: {
        customerEkonId: newPackage.customerEkonId,
        courier: newPackage.courier,
        weight: newPackage.weight,
        status: newPackage.status,
        warehouseLocation: newPackage.warehouseLocation,
        pointsAwarded,
        addedByName: newPackage.addedByName,
        addedByEmail: newPackage.addedByEmail,
        addedByRole: newPackage.addedByRole,
        createdAt: newPackage.createdAt,
      },
    });

    res.status(201).json({
      success: true,
      message:
        pointsAwarded > 0
          ? `Package created successfully and ${pointsAwarded} EK points awarded`
          : "Package created successfully",
      data: newPackage,
      pointsAwarded,
      customerPointsBalance: customer.pointsBalance,
    });
  } catch (error) {
    console.error("Error creating package:", error);
    res.status(500).json({
      success: false,
      message: "Failed to create package",
      error: error.message,
    });
  }
};

const updatePackageStatus = async (req, res) => {
  try {
    const { trackingNumber } = req.params;
    const { status } = req.body;

    const validStatuses = [
      "At Warehouse",
      "Manifest Assigned",
      "In Transit",
      "Cleared Customs",
      "Ready for Pickup",
      "Delivered",
      "In Transit to Branch",
    ];

    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Invalid package status",
      });
    }

    const pkg = await Package.findOne({ trackingNumber });

    if (!pkg) {
      return res.status(404).json({
        success: false,
        message: "Package not found",
      });
    }

    const previousStatus = pkg.status;
    const now = new Date();

    pkg.status = status;
    pkg.statusUpdatedAt = now;

    if (status === "Ready for Pickup") {
      pkg.readyForPickup = true;
      pkg.readyForPickupDate = now;
    } else {
      pkg.readyForPickup = false;
      pkg.readyForPickupDate = null;
    }

    if (status === "Delivered") {
      pkg.readyForPickup = false;
      pkg.readyForPickupDate = null;
    }

    await pkg.save();

    let pointsAwarded = 0;
    let customer = null;

    if (previousStatus !== "At Warehouse" && status === "At Warehouse") {
      customer = await Customer.findOne({ ekonId: pkg.customerEkonId });

      if (customer) {
        pointsAwarded = await awardWarehousePointsIfEligible(customer, pkg, req);

        await createCustomerNotification({
          customerEkonId: customer.ekonId,
          customerName: customer.name,
          title: "Package Received at Warehouse",
          message: `Your package ${pkg.trackingNumber} has been received at the warehouse.${pointsAwarded > 0 ? ` You earned ${pointsAwarded} EK points.` : ""}`,
          type: "Package Update",
          referenceType: "Package",
          referenceId: pkg.trackingNumber,
        });
      }
    }

    if (previousStatus !== "Ready for Pickup" && status === "Ready for Pickup") {
      if (!customer) {
        customer = await Customer.findOne({ ekonId: pkg.customerEkonId });
      }

      if (customer) {
        await createCustomerNotification({
          customerEkonId: customer.ekonId,
          customerName: customer.name,
          title: "Package Ready for Pickup",
          message: `Your package ${pkg.trackingNumber} is now ready for pickup.`,
          type: "Package Update",
          referenceType: "Package",
          referenceId: pkg.trackingNumber,
        });
      }
    }

    await writeAuditLog({
      req,
      action: "UPDATE_PACKAGE_STATUS",
      module: "Packages",
      description: `Package ${pkg.trackingNumber} status changed from ${previousStatus} to ${pkg.status}`,
      targetType: "Package",
      targetId: pkg.trackingNumber,
      metadata: {
        previousStatus,
        newStatus: pkg.status,
        readyForPickup: pkg.readyForPickup,
        readyForPickupDate: pkg.readyForPickupDate,
        statusUpdatedAt: pkg.statusUpdatedAt,
        pointsAwarded,
      },
    });

    res.json({
      success: true,
      message:
        pointsAwarded > 0
          ? `Package status updated successfully and ${pointsAwarded} EK points awarded`
          : "Package status updated successfully",
      data: pkg,
      pointsAwarded,
    });
  } catch (error) {
    console.error("Error updating package status:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update package status",
      error: error.message,
    });
  }
};

const bulkUpdatePackageStatus = async (req, res) => {
  try {
    const { trackingNumbers, status } = req.body;

    const validStatuses = [
      "At Warehouse",
      "Manifest Assigned",
      "In Transit",
      "Cleared Customs",
      "Ready for Pickup",
      "Delivered",
      "In Transit to Branch",
    ];

    if (!Array.isArray(trackingNumbers) || trackingNumbers.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Please provide at least one tracking number",
      });
    }

    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Invalid package status",
      });
    }

    const packages = await Package.find({
      trackingNumber: { $in: trackingNumbers },
    });

    if (packages.length === 0) {
      return res.status(404).json({
        success: false,
        message: "No matching packages found",
      });
    }

    let updatedCount = 0;
    let totalPointsAwarded = 0;

    for (const pkg of packages) {
      const previousStatus = pkg.status;
      const now = new Date();

      pkg.status = status;
      pkg.statusUpdatedAt = now;

      if (status === "Ready for Pickup") {
        pkg.readyForPickup = true;
        pkg.readyForPickupDate = now;
      } else {
        pkg.readyForPickup = false;
        pkg.readyForPickupDate = null;
      }

      if (status === "Delivered") {
        pkg.readyForPickup = false;
        pkg.readyForPickupDate = null;
      }

      await pkg.save();

      let pointsAwarded = 0;
      let customer = null;

      if (previousStatus !== "At Warehouse" && status === "At Warehouse") {
        customer = await Customer.findOne({ ekonId: pkg.customerEkonId });

        if (customer) {
          pointsAwarded = await awardWarehousePointsIfEligible(customer, pkg, req);
          totalPointsAwarded += pointsAwarded;

          await createCustomerNotification({
            customerEkonId: customer.ekonId,
            customerName: customer.name,
            title: "Package Received at Warehouse",
            message: `Your package ${pkg.trackingNumber} has been received at the warehouse.${pointsAwarded > 0 ? ` You earned ${pointsAwarded} EK points.` : ""}`,
            type: "Package Update",
            referenceType: "Package",
            referenceId: pkg.trackingNumber,
          });
        }
      }

      if (previousStatus !== "Ready for Pickup" && status === "Ready for Pickup") {
        if (!customer) {
          customer = await Customer.findOne({ ekonId: pkg.customerEkonId });
        }

        if (customer) {
          await createCustomerNotification({
            customerEkonId: customer.ekonId,
            customerName: customer.name,
            title: "Package Ready for Pickup",
            message: `Your package ${pkg.trackingNumber} is now ready for pickup.`,
            type: "Package Update",
            referenceType: "Package",
            referenceId: pkg.trackingNumber,
          });
        }
      }

      await writeAuditLog({
        req,
        action: "BULK_UPDATE_PACKAGE_STATUS",
        module: "Packages",
        description: `Package ${pkg.trackingNumber} status changed from ${previousStatus} to ${pkg.status} by bulk update`,
        targetType: "Package",
        targetId: pkg.trackingNumber,
        metadata: {
          previousStatus,
          newStatus: pkg.status,
          readyForPickup: pkg.readyForPickup,
          readyForPickupDate: pkg.readyForPickupDate,
          statusUpdatedAt: pkg.statusUpdatedAt,
          pointsAwarded,
        },
      });

      updatedCount += 1;
    }

    res.json({
      success: true,
      message:
        totalPointsAwarded > 0
          ? `${updatedCount} package(s) updated successfully and ${totalPointsAwarded} EK points awarded`
          : `${updatedCount} package(s) updated successfully`,
      updatedCount,
      totalPointsAwarded,
    });
  } catch (error) {
    console.error("Error bulk updating package status:", error);
    res.status(500).json({
      success: false,
      message: "Failed to bulk update package statuses",
      error: error.message,
    });
  }
};

module.exports = {
  getPackages,
  getPackageWeightAnalysis,
  createPackage,
  updatePackageStatus,
  bulkUpdatePackageStatus,
};