const crypto = require("crypto");
const mongoose = require("mongoose");

const Package = require("../models/Package");
const Setting = require("../models/Setting");
const CustomerNotification = require("../models/CustomerNotification");

const getJamaicaDate = (date) => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Jamaica",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  return ["year", "month", "day"]
    .map((type) =>
      parts.find((part) => part.type === type).value
    )
    .join("-");
};

/*
 * Creates one storage notice and saves its reference
 * on the package in the same database transaction.
 * Repeated calls preserve the original notice and date.
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

        if (
      pkg.storagePeriod?.noticeNumber ||
      pkg.storagePeriod?.noticeSentAt
    ) {
      throw new Error(
        "This package has an incomplete storage notice reference. Review it before creating another notice."
      );
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

const previewStorageLaunch = async () => {
  const [settings, packages] = await Promise.all([
    Setting.findOne({
      settingKey: "main",
    }).lean(),

    Package.find({
      status: "Ready for Pickup",
      collectedAt: null,
    })
      .select(
        "trackingNumber customerEkonId customerName storagePeriod"
      )
      .lean(),
  ]);

  const storage = settings?.storageFees;
  const today = getJamaicaDate(new Date());

  const counts = {
    uncollectedReadyPackages: packages.length,
    alreadyHaveNoticeReference: 0,
    needFreshNotice: 0,
    needReview: 0,
  };

  const sample = [];
  const reviewSample = [];

  for (const pkg of packages) {
    const period = pkg.storagePeriod;

    const hasNumber = Boolean(
      String(period?.noticeNumber || "").trim()
    );

    const hasDate = Boolean(period?.noticeSentAt);

    const validDate =
      hasDate &&
      Number.isFinite(
        new Date(period.noticeSentAt).getTime()
      );

    const row = {
      packageId: String(pkg._id),
      trackingNumber: pkg.trackingNumber,
      customerEkonId: pkg.customerEkonId,
      customerName: pkg.customerName,
    };

    if (hasNumber && validDate) {
      counts.alreadyHaveNoticeReference += 1;
    } else if (!hasNumber && !hasDate) {
      counts.needFreshNotice += 1;

      if (sample.length < 25) {
        sample.push(row);
      }
    } else {
      counts.needReview += 1;

      if (reviewSample.length < 25) {
        reviewSample.push(row);
      }
    }
  }

  const conditions = [];

  if (!storage?.enabled) {
    conditions.push("Storage charging is disabled.");
  }

  if (today < "2027-01-01") {
    conditions.push(
      "The 1 January 2027 start date has not been reached."
    );
  }

  if (
    storage?.effectiveFrom !== "2027-01-01" ||
    Number(storage?.freeBusinessDays) !== 7 ||
    Number(storage?.firstDayFee) !== 150 ||
    Number(storage?.additionalDailyFee) !== 50 ||
    storage?.currency !== "JMD"
  ) {
    conditions.push(
      "Storage settings do not match the agreed launch rules."
    );
  }

  if (counts.needReview) {
    conditions.push(
      "Some packages have incomplete notice references and need review."
    );
  }

  return {
    previewOnly: true,
    today,
    effectiveFrom: storage?.effectiveFrom || "",
    storageEnabled: Boolean(storage?.enabled),
    counts,
    sample,
    reviewSample,
    conditions,
    message:
      "Read-only preview. No notices were sent, " +
      "no dates were changed, and no charges were created. " +
      "Calendar, policy and activation checks are still " +
      "required before sending launch notices.",
  };
};

module.exports = {
  ensureStorageNotice,
  previewStorageLaunch,
};