const mongoose = require("mongoose");
const Package = require("../models/Package");
const ShippingRate = require("../models/ShippingRate");
const Customer = require("../models/Customer");
const PointsHistory = require("../models/PointsHistory");
const CustomerNotification = require("../models/CustomerNotification");
const CustomerPurchase = require("../models/CustomerPurchase");
const { completeReferral } = require("./referralController");
const { writeAuditLog } = require("../utils/auditLogger");
const {
  ensurePickupNotification,
} = require("../services/packagePickupNotificationService");

const Setting = require("../models/Setting");

const {
  ensureStorageNotice,
} = require("../services/storageNoticeService");

const {
  syncCustomerPurchaseFromPackage,
} = require("../services/customerPurchaseIntegrationService");

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
  const getJamaicaYMD = (date = new Date()) => {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Jamaica",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(date);
  };

  const makeJamaicaUtcStart = (ymd) => new Date(`${ymd}T05:00:00.000Z`);

  const addDays = (date, days) => {
    const copy = new Date(date);
    copy.setUTCDate(copy.getUTCDate() + days);
    return copy;
  };

  const jamaicaTodayYMD = getJamaicaYMD();
  let startDate = makeJamaicaUtcStart(jamaicaTodayYMD);
  let endDate = addDays(startDate, 1);
  endDate = new Date(endDate.getTime() - 1);

  switch (filter) {
    case "today":
      break;

    case "thisWeek": {
      const jamaicaNow = makeJamaicaUtcStart(jamaicaTodayYMD);
      const day = new Date(jamaicaTodayYMD + "T00:00:00").getDay();
      const diff = day === 0 ? 6 : day - 1;
      startDate = addDays(jamaicaNow, -diff);
      endDate = addDays(startDate, 7);
      endDate = new Date(endDate.getTime() - 1);
      break;
    }

    case "thisMonth": {
      const [year, month] = jamaicaTodayYMD.split("-");
      startDate = makeJamaicaUtcStart(`${year}-${month}-01`);

      const nextMonthStart = new Date(startDate);
      nextMonthStart.setUTCMonth(nextMonthStart.getUTCMonth() + 1);

      endDate = new Date(nextMonthStart.getTime() - 1);
      break;
    }

    case "thisYear": {
      const [year] = jamaicaTodayYMD.split("-");
      startDate = makeJamaicaUtcStart(`${year}-01-01`);
      endDate = makeJamaicaUtcStart(`${Number(year) + 1}-01-01`);
      endDate = new Date(endDate.getTime() - 1);
      break;
    }

    case "custom":
      if (!customStartDate || !customEndDate) {
        throw new Error("Custom start date and end date are required");
      }

      startDate = makeJamaicaUtcStart(customStartDate);
      endDate = makeJamaicaUtcStart(customEndDate);
      endDate = addDays(endDate, 1);
      endDate = new Date(endDate.getTime() - 1);
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

const createStorageNoticeIfEnabled = async (packageId) => {
  try {
    const settings = await Setting.findOne({
      settingKey: "main",
    })
      .select("storageFees")
      .lean();

    const storageSettings = settings?.storageFees;

    if (!storageSettings?.enabled) {
      return null;
    }

    const today = getJamaicaDateString();

    if (
      !storageSettings.effectiveFrom ||
      today < storageSettings.effectiveFrom
    ) {
      return null;
    }

    return await ensureStorageNotice({
      packageId,
      reason: "Ready for Pickup",
    });
  } catch (error) {
    /*
     * A storage notice problem must not prevent staff
     * from updating a package's pickup status.
     */
    console.error(
      "Storage notice could not be created:",
      error.message
    );

    return null;
  }
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

const completeReferralIfFirstWarehousePackage = async (pkg) => {
  try {
    if (!pkg) return null;
    if (pkg.status !== "At Warehouse") return null;

    const customerPackageCount = await Package.countDocuments({
      customerEkonId: pkg.customerEkonId,
      status: { $ne: "Deleted" },
    });

    if (customerPackageCount !== 1) return null;

    return await completeReferral(pkg.customerEkonId, pkg.trackingNumber);
  } catch (error) {
    console.error("Referral reward processing failed:", error.message);
    return null;
  }
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

    const packages = await Package.find({
      status: { $ne: "Deleted" },
      $or: [
        { dateReceived: { $gte: startDate, $lte: endDate } },
        { createdAt: { $gte: startDate, $lte: endDate } },
      ],
    }).sort({ dateReceived: -1, createdAt: -1 });

    const weightMap = {};

    packages.forEach((pkg) => {
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
          packages.length > 0
            ? Number(((item.packageCount / packages.length) * 100).toFixed(2))
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
        totalPackages: packages.length,
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
const packages = await Package.find({
  status: { $ne: "Deleted" },
}).sort({ dateReceived: -1, createdAt: -1 });

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

const getMyPackages = async (req, res) => {
  try {
    const customerEkonId = String(req.user?.ekonId || "")
      .trim()
      .toUpperCase();

    if (!customerEkonId) {
      return res.status(401).json({
        success: false,
        message: "Customer authentication is required.",
      });
    }

    const packages = await Package.find({
      customerEkonId,
      status: { $ne: "Deleted" },
    })
      .select(
        [
          "trackingNumber",
          "customerEkonId",
          "customerName",
          "courier",
          "weight",
          "status",
          "warehouseLocation",
          "invoiceStatus",
          "readyForPickup",
          "readyForPickupDate",
          "statusUpdatedAt",
          "dateReceived",
          "customerInvoiceUploaded",
          "customerInvoiceUploadNumber",
          "customerInvoiceNumber",
          "customerInvoiceFileName",
          "customerInvoiceFilePath",
          "customerInvoiceNotes",
          "customerInvoiceUploadedAt",
          "createdAt",
          "updatedAt",
        ].join(" ")
      )
      .sort({ dateReceived: -1, createdAt: -1 })
      .lean();

        const billedWeights = [
      ...new Set(
        packages
          .map((pkg) => {
            const weight = Number(pkg.weight);

            return Number.isFinite(weight) && weight > 0
              ? Math.ceil(weight)
              : null;
          })
          .filter((weight) => weight !== null)
      ),
    ];

    const rates = billedWeights.length
      ? await ShippingRate.find({
          weight: { $in: billedWeights },
        })
          .select("weight price")
          .lean()
      : [];

    const rateMap = new Map();

    for (const rate of rates) {
      const billedWeight = Number(rate.weight);
      const price = Number(rate.price);

      if (
        rate.price !== null &&
        rate.price !== undefined &&
        Number.isFinite(billedWeight) &&
        Number.isFinite(price) &&
        price >= 0
      ) {
        rateMap.set(billedWeight, price);
      }
    }

    const packagesWithEstimates = packages.map((pkg) => {
      const actualWeight = Number(pkg.weight);

      const chargeableWeight =
        Number.isFinite(actualWeight) && actualWeight > 0
          ? Math.ceil(actualWeight)
          : null;

      const estimatedCharge =
        chargeableWeight !== null &&
        rateMap.has(chargeableWeight)
          ? rateMap.get(chargeableWeight)
          : null;

      return {
        ...pkg,
        chargeableWeight,
        estimatedCharge,
      };
    });

    return res.json({
      success: true,
      message: "Customer packages retrieved successfully",
      totalPackages: packagesWithEstimates.length,
      data: packagesWithEstimates,
    });

  } catch (error) {
    console.error("Error getting customer packages:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to retrieve your packages",
      error: error.message,
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

    await syncCustomerPurchaseFromPackage({
      pkg: newPackage,
      user: req.user,
    });

    const pointsAwarded =
      await awardWarehousePointsIfEligible(
        customer,
        newPackage,
        req
      );

if (packageStatus === "At Warehouse") {
  await completeReferralIfFirstWarehousePackage(newPackage);
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
      const notice = await ensurePickupNotification(newPackage._id);
            await createStorageNoticeIfEnabled(newPackage._id);

      if (notice) {
        newPackage.pickupNotificationNumber = notice.notificationNumber;
        newPackage.pickupNotifiedAt = notice.notifiedAt;
      }
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

const applyPackageStatusDetails = (
  pkg,
  status,
  user = {},
    {
    source = "Staff action",
    reason = "",
    allowDeliveredCorrection = false,
  } = {}
) => {
  const previousStatus = pkg.status;

  // A repeat is not a new status event.
  if (previousStatus === status) return false;
    if (previousStatus === "Delivered" && status !== "Delivered") {
    if (
      allowDeliveredCorrection !== true ||
      typeof reason !== "string" ||
      reason.trim().length < 10 ||
      reason.trim().length > 1000
    ) {
      const error = new Error(
        "Reopening a Delivered package requires an explicit correction and a reason of 10–1000 characters."
      );
      error.statusCode = 409;
      throw error;
    }
  }

  if (["Deleted", "Deleted by KP"].includes(previousStatus)) {
    const error = new Error("A deleted package cannot receive a status update.");
    error.statusCode = 409;
    throw error;
  }

  const now = new Date();
  const actor = user || {};

  pkg.status = status;
  pkg.statusUpdatedAt = now;

  if (status === "Ready for Pickup") {
    pkg.readyForPickup = true;
    pkg.readyForPickupDate =
      pkg.pickupNotifiedAt || pkg.readyForPickupDate || now;
  } else {
    pkg.readyForPickup = false;
    pkg.readyForPickupDate = null;
  }

  if (
    status === "Delivered" &&
    previousStatus !== "Delivered" &&
    !pkg.collectedAt
  ) {
    pkg.collectedAt = now;
    pkg.collectedByUserId = String(
      actor.userId || actor._id || actor.id || ""
    );
    pkg.collectedByName =
      actor.fullName || actor.name || actor.email || "System User";
  }

  if (!pkg.statusHistory) pkg.statusHistory = [];

  pkg.statusHistory.push({
    previousStatus: previousStatus || "",
    newStatus: status,
    changedAt: now,
    changedByUserId: String(
      actor.userId || actor._id || actor.id || ""
    ),
    changedByName:
      actor.fullName || actor.name || actor.email || "System User",
    changedByRole: actor.role || "",
    source,
    reason,
  });

  return true;
};

const savePackageStatusAction = async ({
  req,
  trackingNumbers,
  status,
  bulk = false,
}) => {
  const fail = (message, statusCode = 400) => {
    const error = new Error(message);
    error.statusCode = statusCode;
    throw error;
  };

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
    fail("Invalid package status.");
  }

  if (
    !Array.isArray(trackingNumbers) ||
    !trackingNumbers.length ||
    trackingNumbers.some(
      (number) =>
        typeof number !== "string" ||
        !number.trim() ||
        number !== number.trim()
    )
  ) {
    fail("Select valid package tracking numbers.");
  }

  const requested = [...new Set(trackingNumbers)];

  const result = await mongoose.connection.transaction(async (session) => {
    const packages = await Package.find({
      trackingNumber: { $in: requested },
    }).session(session);

    const found = new Set(packages.map((pkg) => pkg.trackingNumber));
    const missing = requested.filter((number) => !found.has(number));

    if (missing.length) {
      fail(
        `Packages not found: ${missing.join(", ")}. No status changes were saved.`,
        409
      );
    }

    const blocked = packages.filter(
      (pkg) =>
        ["Deleted", "Deleted by KP"].includes(pkg.status) ||
        (bulk && pkg.status === "Delivered" && status !== "Delivered")
    );

    if (blocked.length) {
      fail(
        "This action cannot change deleted packages or reopen Delivered packages in bulk. " +
          "Use the single-package correction control where appropriate. " +
          `Affected packages: ${blocked.map((pkg) => pkg.trackingNumber).join(", ")}. ` +
          "No status changes were saved.",
        409
      );
    }

    const changed = [];
    const unchangedTrackingNumbers = [];
    const records = [];

    for (const pkg of packages) {
      if (pkg.status === status) {
        unchangedTrackingNumbers.push(pkg.trackingNumber);
        records.push(pkg.toObject());
        continue;
      }

      const previousStatus = pkg.status;
      const correction =
        previousStatus === "Delivered" && status !== "Delivered";

      const reason =
        typeof req.body?.reason === "string"
          ? req.body.reason.trim()
          : "";

      applyPackageStatusDetails(pkg, status, req.user, {
        source: correction
          ? "Packages delivery correction"
          : bulk
            ? "Packages bulk update"
            : "Packages",
        reason: correction ? reason : "",
        allowDeliveredCorrection:
          !bulk && correction && req.body?.confirmCorrection === true,
      });

      await pkg.save({ session });

      const purchase = await syncCustomerPurchaseFromPackage({
        pkg,
        user: req.user,
        session,
      });

      changed.push({
        package: pkg.toObject(),
        previousStatus,
        customerPurchaseNumber: purchase?.purchaseNumber || "",
      });

      records.push(pkg.toObject());
    }

    return { changed, unchangedTrackingNumbers, records };
  });

  // Run follow-up actions only after the status transaction commits.
  const warnings = [];
  let totalPointsAwarded = 0;

  for (const change of result.changed) {
    const pkg = change.package;
    let pointsAwarded = 0;

    const followUp = async (label, action) => {
      try {
        await action();
      } catch (error) {
        console.error(
          `Package ${pkg.trackingNumber}: ${label} failed`,
          error
        );
        warnings.push(
          `${pkg.trackingNumber}: status saved, but ${label} could not be confirmed.`
        );
      }
    };

    if (
      change.previousStatus !== "At Warehouse" &&
      status === "At Warehouse"
    ) {
      let customer = null;

      await followUp("customer lookup", async () => {
        customer = await Customer.findOne({
          ekonId: pkg.customerEkonId,
        });
      });

      if (customer) {
        await followUp("warehouse points", async () => {
          pointsAwarded = await awardWarehousePointsIfEligible(
            customer,
            pkg,
            req
          );
          totalPointsAwarded += pointsAwarded;
        });

        await followUp("referral update", async () => {
          await completeReferralIfFirstWarehousePackage(pkg);
        });

        await followUp("warehouse notification", async () => {
          await createCustomerNotification({
            customerEkonId: customer.ekonId,
            customerName: customer.name,
            title: "Package Received at Warehouse",
            message:
              `Your package ${pkg.trackingNumber} has been received at the warehouse.` +
              (pointsAwarded > 0
                ? ` You earned ${pointsAwarded} EK points.`
                : ""),
            type: "Package Update",
            referenceType: "Package",
            referenceId: pkg.trackingNumber,
          });
        });
      }
    }

    if (status === "Ready for Pickup") {
      await followUp("pickup notification", async () => {
        await ensurePickupNotification(pkg._id);
      });

      await followUp("storage notice check", async () => {
        await createStorageNoticeIfEnabled(pkg._id);
      });
    }

    await followUp("general audit log", async () => {
      await writeAuditLog({
        req,
        action: bulk
          ? "BULK_UPDATE_PACKAGE_STATUS"
          : "UPDATE_PACKAGE_STATUS",
        module: "Packages",
        description:
          `Package ${pkg.trackingNumber} status changed from ` +
          `${change.previousStatus} to ${pkg.status}`,
        targetType: "Package",
        targetId: pkg.trackingNumber,
        metadata: {
          previousStatus: change.previousStatus,
          newStatus: pkg.status,
          readyForPickup: pkg.readyForPickup,
          readyForPickupDate: pkg.readyForPickupDate,
          collectedAt: pkg.collectedAt,
          collectedByUserId: pkg.collectedByUserId,
          collectedByName: pkg.collectedByName,
          statusUpdatedAt: pkg.statusUpdatedAt,
          customerPurchaseNumber: change.customerPurchaseNumber,
          pointsAwarded,
        },
      });
    });
  }

  return {
    ...result,
    totalPointsAwarded,
    warnings,
  };
};

const updatePackageStatus = async (req, res) => {
  try {
    const result = await savePackageStatusAction({
      req,
      trackingNumbers: [req.params.trackingNumber],
      status: req.body?.status,
    });

    return res.json({
      success: true,
      message: result.changed.length
        ? "Package status updated successfully."
        : "Package already has this status. No changes made.",
      data: result.records[0],
      unchanged: result.changed.length === 0,
      pointsAwarded: result.totalPointsAwarded,
      warnings: result.warnings,
    });
  } catch (error) {
    console.error("Package status update failed:", error);

    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.statusCode
        ? error.message
        : "Could not confirm the status update. Refresh Packages before retrying.",
    });
  }
};

const bulkUpdatePackageStatus = async (req, res) => {
  try {
    const result = await savePackageStatusAction({
      req,
      trackingNumbers: req.body?.trackingNumbers,
      status: req.body?.status,
      bulk: true,
    });

    const changedTrackingNumbers = result.changed.map(
      (item) => item.package.trackingNumber
    );

    return res.json({
      success: true,
      message:
        `${changedTrackingNumbers.length} package(s) changed; ` +
        `${result.unchangedTrackingNumbers.length} already had this status.`,
      updatedCount: changedTrackingNumbers.length,
      unchangedCount: result.unchangedTrackingNumbers.length,
      changedTrackingNumbers,
      unchangedTrackingNumbers: result.unchangedTrackingNumbers,
      totalPointsAwarded: result.totalPointsAwarded,
      warnings: result.warnings,
    });
  } catch (error) {
    console.error("Bulk package status update failed:", error);

    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.statusCode
        ? error.message
        : "Could not confirm the bulk update. Refresh Packages before retrying.",
    });
  }
};

const deletePackage = async (req, res) => {
  try {
    const { trackingNumber } = req.params;

    const pkg = await Package.findOne({ trackingNumber });

    if (!pkg) {
      return res.status(404).json({
        success: false,
        message: "Package not found",
      });
    }

    pkg.status = "Deleted";
    pkg.readyForPickup = false;
    pkg.statusUpdatedAt = new Date();

    await pkg.save();

    await writeAuditLog({
      req,
      action: "DELETE_PACKAGE",
      module: "Packages",
      description: `Package ${pkg.trackingNumber} was deleted`,
      targetType: "Package",
      targetId: pkg.trackingNumber,
      metadata: {
        customerEkonId: pkg.customerEkonId,
        customerName: pkg.customerName,
        previousStatus: pkg.status,
      },
    });

    res.json({
      success: true,
      message: "Package deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting package:", error);
    res.status(500).json({
      success: false,
      message: "Failed to delete package",
      error: error.message,
    });
  }
};

module.exports = {
  getPackages,
  getMyPackages,
  getPackageWeightAnalysis,
  createPackage,
  updatePackageStatus,
  bulkUpdatePackageStatus,
  deletePackage,
  applyPackageStatusDetails,
};