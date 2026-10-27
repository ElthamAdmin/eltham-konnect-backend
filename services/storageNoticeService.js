const crypto = require("crypto");
const mongoose = require("mongoose");

const Package = require("../models/Package");
const Setting = require("../models/Setting");
const CustomerNotification = require("../models/CustomerNotification");

const getJamaicaDate = (date) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Jamaica",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);

/*
 * Creates one storage notice and saves its reference
 * on the package in the same database transaction.
 *
 * This function has no route or automatic caller yet.
 */
const ensureStorageNotice = async ({
  packageId,
  reason,
}) => {
  if (!["Launch", "Ready for Pickup"].includes(reason)) {
    throw new Error("A valid storage notice reason is required.");
  }

  let result = null;

  await mongoose.connection.transaction(async (session) => {
    const settings = await Setting.findOne({
      settingKey: "main",
    }).session(session);

    const storageSettings = settings?.storageFees;

    if (!storageSettings?.enabled) {
      throw new Error("Storage fees are not enabled.");
    }

    const now = new Date();
    const today = getJamaicaDate(now);

    if (
      !storageSettings.effectiveFrom ||
      today < storageSettings.effectiveFrom
    ) {
      throw new Error(
        "Storage notices cannot start before the effective date."
      );
    }

    const pkg = await Package.findById(packageId).session(session);

    if (!pkg) {
      throw new Error("Package not found.");
    }

    if (
      pkg.status !== "Ready for Pickup" ||
      pkg.collectedAt
    ) {
      throw new Error(
        "Storage notices are only available for uncollected packages ready for pickup."
      );
    }

    if (
      pkg.storagePeriod?.noticeNumber &&
      pkg.storagePeriod?.noticeSentAt
    ) {
      result = {
        created: false,
        noticeNumber: pkg.storagePeriod.noticeNumber,
        noticeSentAt: pkg.storagePeriod.noticeSentAt,
      };

      return;
    }

    const notificationNumber = `NTF-${crypto.randomUUID()}`;

    const freeBusinessDays =
      Number(storageSettings.freeBusinessDays);

    const firstDayFee =
      Number(storageSettings.firstDayFee);

    const additionalDailyFee =
      Number(storageSettings.additionalDailyFee);

    if (
      !Number.isInteger(freeBusinessDays) ||
      freeBusinessDays < 1 ||
      !Number.isFinite(firstDayFee) ||
      firstDayFee < 0 ||
      !Number.isFinite(additionalDailyFee) ||
      additionalDailyFee < 0
    ) {
      throw new Error("Storage fee settings are invalid.");
    }

    const message =
      `Package ${pkg.trackingNumber} is ready for collection. ` +
      `You have ${freeBusinessDays} free business days after this notice. ` +
      `After that, storage is J$${firstDayFee} on the first chargeable day ` +
      `and J$${additionalDailyFee} for each additional calendar day.`;

    await CustomerNotification.create(
      [
        {
          notificationNumber,
          customerEkonId: pkg.customerEkonId,
          customerName: pkg.customerName,
          title: "Package Storage Notice",
          message,
          type: "Package Update",
          referenceType: "Package",
          referenceId: pkg.trackingNumber,
          isRead: false,
          date: today,
        },
      ],
      { session }
    );

    pkg.storagePeriod = {
      noticeNumber: notificationNumber,
      noticeSentAt: now,
      noticeReason: reason,
      policyVersion: "2027-01-01",
      freeBusinessDays,
      firstDayFee,
      additionalDailyFee,
      currency: "JMD",
    };

    await pkg.save({ session });

    result = {
      created: true,
      noticeNumber: notificationNumber,
      noticeSentAt: now,
    };
  });

  return result;
};

module.exports = {
  ensureStorageNotice,
};