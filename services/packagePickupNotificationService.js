const crypto = require("crypto");
const mongoose = require("mongoose");
const Package = require("../models/Package");
const CustomerNotification = require("../models/CustomerNotification");

const getJamaicaDate = (date) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Jamaica",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);

const ensurePickupNotification = async (packageId) => {
  let result = null;

  await mongoose.connection.transaction(async (session) => {
    const pkg = await Package.findById(packageId).session(session);

    if (!pkg) {
      throw new Error("Package not found while saving pickup notification.");
    }

    if (
      pkg.status !== "Ready for Pickup" ||
      pkg.collectedAt
    ) {
      return;
    }

    // Preserve the original notice and date on repeated requests.
    if (pkg.pickupNotificationNumber && pkg.pickupNotifiedAt) {
      result = {
        notificationNumber: pkg.pickupNotificationNumber,
        notifiedAt: pkg.pickupNotifiedAt,
      };
      return;
    }

    const now = new Date();
    const notificationNumber = `NTF-${crypto.randomUUID()}`;

    await CustomerNotification.create(
      [
        {
          notificationNumber,
          customerEkonId: pkg.customerEkonId,
          customerName: pkg.customerName,
          title: "Package Ready for Pickup",
          message:
            `Your package ${pkg.trackingNumber} is now ready for pickup.`,
          type: "Package Update",
          referenceType: "Package",
          referenceId: pkg.trackingNumber,
          isRead: false,
          date: getJamaicaDate(now),
        },
      ],
      { session }
    );

    pkg.pickupNotificationNumber = notificationNumber;
    pkg.pickupNotifiedAt = now;
    await pkg.save({ session });

    result = {
      notificationNumber,
      notifiedAt: now,
    };
  });

  return result;
};

module.exports = { ensurePickupNotification };