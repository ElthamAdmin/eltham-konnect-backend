const mongoose = require("mongoose");

const Package = require("../models/Package");
const CustomerPurchase = require("../models/CustomerPurchase");
const CustomerInvoiceUpload = require("../models/CustomerInvoiceUpload");
const Invoice = require("../models/Invoice");
const Manifest = require("../models/Manifest");
const PreAlert = require("../models/PreAlert");
const Referral = require("../models/Referral");

const { writeAuditLog } = require("../utils/auditLogger");

const fail = (message, statusCode = 400) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  throw error;
};

const getJamaicaDate = (value) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Jamaica",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));

const snapshot = (pkg) => ({
  trackingNumber: pkg.trackingNumber,
  weight: Number(pkg.weight || 0),
  courier: pkg.courier || "",
  warehouseLocation: pkg.warehouseLocation || "",
  dateReceived: pkg.dateReceived
    ? new Date(pkg.dateReceived).toISOString()
    : null,
  manualWeightOverride: Boolean(pkg.manualWeightOverride),
});

const readText = (value, label, maxLength, required = false) => {
  if (typeof value !== "string") {
    fail(`${label} must be text.`);
  }

  const result = value.trim();

  if (required && !result) {
    fail(`${label} is required.`);
  }

  if (result.length > maxLength) {
    fail(`${label} cannot exceed ${maxLength} characters.`);
  }

  return result;
};

const updatePackageDetails = async (req, res) => {
  let result;

  try {
    const { packageId } = req.params;
    const body = req.body || {};

    if (!mongoose.isValidObjectId(packageId)) {
      fail("The package reference is invalid.");
    }

    const allowedFields = new Set([
      "trackingNumber",
      "weight",
      "courier",
      "warehouseLocation",
      "dateReceived",
      "reason",
      "editVersion",
    ]);

    const unexpectedFields = Object.keys(body).filter(
      (field) => !allowedFields.has(field)
    );

    if (unexpectedFields.length > 0) {
      fail(
        `These fields cannot be changed here: ${unexpectedFields.join(", ")}.`
      );
    }

    const reason = readText(body.reason, "Correction reason", 1000, true);

    if (
      !Number.isInteger(body.editVersion) ||
      body.editVersion < 0
    ) {
      fail("Reload the package before making this correction.", 409);
    }

    const changes = {};

    if (body.trackingNumber !== undefined) {
      changes.trackingNumber = readText(
        body.trackingNumber,
        "Tracking number",
        200,
        true
      );

      if (/[\u0000-\u001f\u007f]/.test(changes.trackingNumber)) {
        fail("Tracking number contains unsupported control characters.");
      }
    }

    if (body.weight !== undefined) {
      if (
        typeof body.weight !== "number" ||
        !Number.isFinite(body.weight) ||
        body.weight < 0
      ) {
        fail("Weight must be a valid number of zero or greater.");
      }

      changes.weight = body.weight;
    }

    if (body.courier !== undefined) {
      changes.courier = readText(body.courier, "Courier", 200);
    }

    if (body.warehouseLocation !== undefined) {
      changes.warehouseLocation = readText(
        body.warehouseLocation,
        "Warehouse location",
        300
      );
    }

    if (body.dateReceived !== undefined) {
      const dateText = readText(
        body.dateReceived,
        "Date received",
        10,
        true
      );

      if (!/^\d{4}-\d{2}-\d{2}$/.test(dateText)) {
        fail("Date received must use YYYY-MM-DD.");
      }

      const receivedDate = new Date(`${dateText}T05:00:00.000Z`);

      if (
        Number.isNaN(receivedDate.getTime()) ||
        getJamaicaDate(receivedDate) !== dateText
      ) {
        fail("Date received is not a valid calendar date.");
      }

      changes.dateReceived = receivedDate;
    }

    if (Object.keys(changes).length === 0) {
      fail("No package details were supplied.");
    }

    await mongoose.connection.transaction(async (session) => {
      const pkg = await Package.findById(packageId).session(session);

      if (!pkg) {
        fail("Package not found.", 404);
      }

      if (["Deleted", "Deleted by KP"].includes(pkg.status)) {
        fail("A deleted package cannot be edited.", 409);
      }

      if (Number(pkg.editVersion || 0) !== body.editVersion) {
        fail(
          "Another staff member changed this package. Reload it and try again.",
          409
        );
      }

      const beforeValues = snapshot(pkg);
      const oldTracking = pkg.trackingNumber;
      const newTracking = changes.trackingNumber || oldTracking;

      const trackingChanged = newTracking !== oldTracking;

      const weightChanged =
        changes.weight !== undefined &&
        changes.weight !== Number(pkg.weight || 0);

      if (trackingChanged) {
        const duplicate = await Package.findOne({
          _id: { $ne: pkg._id },
          $or: [
            { trackingNumber: newTracking },
            { trackingNumberAliases: newTracking },
          ],
        }).session(session);

        if (duplicate) {
          fail(
            "That tracking number is already used by another package or its correction history.",
            409
          );
        }

        const conflictingManifest = await Manifest.findOne({
          packages: { $all: [oldTracking, newTracking] },
        }).session(session);

        if (conflictingManifest) {
          fail(
            `Manifest ${conflictingManifest.manifestNumber} already contains both tracking references. Review it before correcting this package.`,
            409
          );
        }

        const conflictingPreAlert = await PreAlert.findOne({
          customerEkonId: pkg.customerEkonId,
          trackingNumber: newTracking,
        }).session(session);

        const previousPreAlert = await PreAlert.findOne({
          customerEkonId: pkg.customerEkonId,
          trackingNumber: oldTracking,
        }).session(session);

        if (conflictingPreAlert && previousPreAlert) {
          fail(
            "This customer has pre-alerts for both tracking numbers. Review those records before applying the correction.",
            409
          );
        }
      }

      const purchaseReferences = [
        { packageId: pkg._id },
        {
          customerEkonId: pkg.customerEkonId,
          trackingNumber: oldTracking,
        },
      ];

      if (pkg.customerPurchaseId) {
        purchaseReferences.push({ _id: pkg.customerPurchaseId });
      }

      if (pkg.customerPurchaseNumber) {
        purchaseReferences.push({
          purchaseNumber: pkg.customerPurchaseNumber,
        });
      }

      const purchases = await CustomerPurchase.find({
        $or: purchaseReferences,
      }).session(session);

      for (const purchase of purchases) {
        if (purchase.customerEkonId !== pkg.customerEkonId) {
          fail(
            "A linked purchase belongs to another customer. Review the purchase link before editing.",
            409
          );
        }

        if (
          purchase.packageId &&
          String(purchase.packageId) !== String(pkg._id)
        ) {
          fail(
            `Purchase ${purchase.purchaseNumber} is linked to another package. Review that link first.`,
            409
          );
        }
      }

      const invoices = await Invoice.find({
        customerEkonId: pkg.customerEkonId,
        $or: [
          { "packages.trackingNumber": oldTracking },
          { "customerPurchases.trackingNumber": oldTracking },
        ],
      }).session(session);

      if (changes.dateReceived) {
        const existingDate = pkg.dateReceived
          ? getJamaicaDate(pkg.dateReceived)
          : "";

        if (existingDate === body.dateReceived) {
          delete changes.dateReceived;
        }
      }

      for (const [field, value] of Object.entries(changes)) {
        pkg[field] = value;
      }

      if (trackingChanged) {
        pkg.trackingNumberAliases = [
          ...new Set([
            ...(pkg.trackingNumberAliases || []),
            oldTracking,
          ]),
        ].filter((tracking) => tracking !== newTracking);
      }

      if (weightChanged) {
        pkg.manualWeightOverride = true;
      }

      const afterValues = snapshot(pkg);

      if (JSON.stringify(beforeValues) === JSON.stringify(afterValues)) {
        fail("No package details have changed.");
      }

      const now = new Date();
      const user = req.user || {};

      const editedByUserId = String(
        user.userId || user._id || user.id || ""
      );

      const editedByName =
        user.fullName || user.name || user.email || "System User";

      const warnings = [];

      for (const purchase of purchases) {
        purchase.packageId = pkg._id;
        purchase.trackingNumber = pkg.trackingNumber;
        purchase.weight = Number(pkg.weight || 0);

        if (weightChanged) {
          purchase.chargeableWeight =
            pkg.weight > 0 ? Math.ceil(pkg.weight) : 0;
        }

        if (changes.warehouseLocation !== undefined) {
          purchase.warehouse = pkg.warehouseLocation;
        }

        if (changes.dateReceived) {
          purchase.packageReceivedDate = pkg.dateReceived;
        }

        purchase.lastPackageSyncAt = now;
        purchase.updatedBy = editedByName;

        const closedPurchase = [
          "Cancelled",
          "Refunded",
          "Reversed",
          "Recovered",
        ].includes(purchase.status);

        if (weightChanged && !purchase.invoiceNumber && !closedPurchase) {
          purchase.invoiceReady = false;

          if (
            ["Recovery Calculated", "Ready to Invoice"].includes(
              purchase.status
            )
          ) {
            purchase.status = "At Warehouse";
          }

          purchase.notes = [
            purchase.notes,
            `[${now.toISOString()}] Package weight corrected from ${
              beforeValues.weight
            } to ${pkg.weight} lb. Review recovery charges before invoicing.`,
          ]
            .filter(Boolean)
            .join("\n");

          warnings.push(
            `Review recovery charges for purchase ${purchase.purchaseNumber} before invoicing.`
          );
        }

        await purchase.save({ session });
      }

      if (trackingChanged) {
        for (const invoice of invoices) {
          for (const line of invoice.packages || []) {
            if (line.trackingNumber === oldTracking) {
              line.trackingNumber = newTracking;
            }
          }

          for (const line of invoice.customerPurchases || []) {
            if (line.trackingNumber === oldTracking) {
              line.trackingNumber = newTracking;
            }
          }

          await invoice.save({ session });
        }

        await Manifest.updateMany(
          { packages: oldTracking },
          { $set: { "packages.$[tracking]": newTracking } },
          {
            session,
            arrayFilters: [{ tracking: oldTracking }],
          }
        );

        await CustomerInvoiceUpload.updateMany(
          {
            customerEkonId: pkg.customerEkonId,
            trackingNumber: oldTracking,
          },
          { $set: { trackingNumber: newTracking } },
          { session }
        );

        await PreAlert.updateMany(
          {
            customerEkonId: pkg.customerEkonId,
            trackingNumber: oldTracking,
          },
          { $set: { trackingNumber: newTracking } },
          { session }
        );

        await Referral.updateMany(
          {
            refereeEkonId: pkg.customerEkonId,
            firstPackageTrackingNumber: oldTracking,
          },
          { $set: { firstPackageTrackingNumber: newTracking } },
          { session }
        );
      }

      if (weightChanged && invoices.length > 0) {
        warnings.push(
          "Existing invoice weights, charges, payments, and accounting totals were retained. Review billing separately if an adjustment is required."
        );
      }

      pkg.editVersion = Number(pkg.editVersion || 0) + 1;
      pkg.lastEditedAt = now;
      pkg.lastEditedByUserId = editedByUserId;
      pkg.lastEditedByName = editedByName;

      pkg.editHistory.push({
        editedAt: now,
        editedByUserId,
        editedByName,
        editedByRole: user.role || "",
        reason,
        beforeValues: {
          ...beforeValues,
          relatedInvoiceNumbers: invoices.map(
            (invoice) => invoice.invoiceNumber
          ),
        },
        afterValues: {
          ...afterValues,
          relatedInvoiceNumbers: invoices.map(
            (invoice) => invoice.invoiceNumber
          ),
          warnings,
        },
      });

      await pkg.save({ session });

      result = {
        package: pkg.toObject(),
        beforeValues,
        afterValues,
        warnings: [...new Set(warnings)],
      };
    });

    await writeAuditLog({
      req,
      action: "EDIT_PACKAGE_DETAILS",
      module: "Packages",
      description: `Package ${result.package.trackingNumber} corrected: ${reason}`,
      targetType: "Package",
      targetId: String(result.package._id),
      beforeValues: result.beforeValues,
      afterValues: result.afterValues,
      metadata: {
        reason,
        editVersion: result.package.editVersion,
        warnings: result.warnings,
      },
    });

    return res.json({
      success: true,
      message: "Package details updated successfully.",
      data: result.package,
      warnings: result.warnings,
    });
  } catch (error) {
    console.error("Package correction error:", error);

    let statusCode = error.statusCode || 500;
    let message = error.message || "Package details could not be updated.";

    if (error.code === 11000) {
      statusCode = 409;
      message = "That tracking number is already in use. Reload and try again.";
    }

    if (
      error.code === 20 ||
      /Transaction numbers are only allowed|does not support retryable writes/i.test(
        error.message || ""
      )
    ) {
      message =
        "The database must support transactions before linked package corrections can be enabled.";
    }

    return res.status(statusCode).json({
      success: false,
      message,
    });
  }
};

module.exports = {
  updatePackageDetails,
};