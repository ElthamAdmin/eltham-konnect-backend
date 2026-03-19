const Package = require("../models/Package");
const Customer = require("../models/Customer");
const PointsHistory = require("../models/PointsHistory");
const { writeAuditLog } = require("../utils/auditLogger");

const getPackages = async (req, res) => {
  try {
    const packages = await Package.find().sort({ dateReceived: -1 });

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

    const customer = await Customer.findOne({ ekonId: customerEkonId });

    if (!customer) {
      return res.status(404).json({
        success: false,
        message: "Customer not found",
      });
    }

    const packageStatus = status || "At Warehouse";

    const newPackage = new Package({
      trackingNumber,
      customerEkonId,
      customerName,
      courier,
      weight,
      status: packageStatus,
      warehouseLocation,
      invoiceStatus: invoiceStatus || "Pending",
      readyForPickup: readyForPickup || false,
      dateReceived,
    });

    await newPackage.save();

    let pointsAwarded = 0;

    if (packageStatus === "At Warehouse") {
      const oldPoints = Number(customer.points || 0);
      const newPoints = Math.min(oldPoints + 100, 1500);
      pointsAwarded = newPoints - oldPoints;

      customer.points = newPoints;
      customer.lastActivityDate = new Date().toISOString().split("T")[0];
      await customer.save();

      if (pointsAwarded > 0) {
        await PointsHistory.create({
          customerEkonId: customer.ekonId,
          customerName: customer.name,
          action: "Package marked At Warehouse",
          points: pointsAwarded,
          date: new Date().toISOString().split("T")[0],
        });
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
      customerPointsBalance: customer.points,
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

    console.log("UPDATE PACKAGE STATUS BODY:", req.body, "STATUS:", status);

    const validStatuses = [
      "At Warehouse",
      "Manifest Assigned",
      "In Transit",
      "Cleared Customs",
      "Ready for Pickup",
      "Delivered",
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
    pkg.status = status;

    if (status === "Ready for Pickup") {
      pkg.readyForPickup = true;
    } else {
      pkg.readyForPickup = false;
    }

    if (status === "Delivered") {
      pkg.readyForPickup = false;
    }

    await pkg.save();

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
      },
    });

    res.json({
      success: true,
      message: "Package status updated successfully",
      data: pkg,
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

module.exports = {
  getPackages,
  createPackage,
  updatePackageStatus,
};