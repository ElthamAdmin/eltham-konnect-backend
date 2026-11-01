const crypto = require("crypto");
const mongoose = require("mongoose");

const Package = require("../models/Package");
const Setting = require("../models/Setting");
const CustomerNotification = require("../models/CustomerNotification");
const { previewPackageStorage } = require("./storagePreviewService");

const CUTOFF = new Date("2027-01-01T00:00:00-05:00");

let timer = null;
let running = false;

const jamaicaDate = (date) => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Jamaica",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  return ["year", "month", "day"]
    .map((type) => parts.find((part) => part.type === type).value)
    .join("-");
};

const processPackageReminder = async (packageId) =>
  mongoose.connection.transaction(async (session) => {
    const settings = await Setting.findOne({
      settingKey: "main",
    }).session(session);

    if (
      settings?.storageFees?.enabled !== true ||
      settings.storageFees.effectiveFrom !== "2027-01-01"
    ) {
      return;
    }

    const now = new Date();

    if (now < CUTOFF) return;

    const pkg = await Package.findById(packageId).session(session);

    if (
      !pkg ||
      pkg.status !== "Ready for Pickup" ||
      pkg.collectedAt ||
      !pkg.createdAt ||
      !Number.isFinite(new Date(pkg.createdAt).getTime()) ||
      new Date(pkg.createdAt) < CUTOFF
    ) {
      return;
    }

    const period = pkg.storagePeriod;

    if (!period?.noticeNumber || !period.noticeSentAt) return;

    const notice = await CustomerNotification.findOne({
      notificationNumber: period.noticeNumber,
      customerEkonId: pkg.customerEkonId,
      referenceType: "Package",
      referenceId: pkg.trackingNumber,
    }).session(session);

    if (
      !notice ||
      jamaicaDate(notice.createdAt) !== jamaicaDate(period.noticeSentAt)
    ) {
      throw new Error("The original storage notice needs review.");
    }

    const preview = previewPackageStorage({ pkg, asOf: now });

    if (!preview.available) return;

    const reminderDay = new Date(
      `${preview.firstChargeDate}T00:00:00.000Z`
    );
    reminderDay.setUTCDate(reminderDay.getUTCDate() - 3);

    const reminderDate = reminderDay.toISOString().slice(0, 10);
    const today = jamaicaDate(now);

    if (today < reminderDate) return;

    const digest = crypto
      .createHash("sha256")
      .update(JSON.stringify([String(pkg._id), period.noticeNumber]))
      .digest("hex");

    const notificationNumber = `NTF-STORAGE-REMINDER-${digest}`;

    const existing = await CustomerNotification.findOne({
      notificationNumber,
    }).session(session);

    if (existing) return;

    if (today >= preview.firstChargeDate) {
      throw new Error(
        "The advance reminder was missed. Review this package before billing."
      );
    }

    // Conflicts with concurrent collection or package updates,
    // causing the transaction to retry with the latest package.
    await Package.updateOne(
      { _id: pkg._id },
      { $inc: { editVersion: 1 } },
      { session }
    );

    await CustomerNotification.create(
      [
        {
          notificationNumber,
          customerEkonId: pkg.customerEkonId,
          customerName: pkg.customerName,
          title: "Storage Fee Reminder",
          message:
            `Please collect package ${pkg.trackingNumber} by ` +
            `${preview.lastFreeDate} to avoid storage fees. ` +
            `Storage fees begin on ${preview.firstChargeDate}: ` +
            `J$${period.firstDayFee} on the first chargeable day, ` +
            `then J$${period.additionalDailyFee} for each additional ` +
            `calendar day until collection.`,
          type: "Package Update",
          referenceType: "Package",
          referenceId: pkg.trackingNumber,
          isRead: false,
          date: today,
        },
      ],
      { session }
    );
  });

const runStorageReminders = async () => {
  if (running || mongoose.connection.readyState !== 1) return;

  running = true;

  try {
    const settings = await Setting.findOne({
      settingKey: "main",
    }).lean();

    if (
      settings?.storageFees?.enabled !== true ||
      settings.storageFees.effectiveFrom !== "2027-01-01" ||
      new Date() < CUTOFF
    ) {
      return;
    }

    // Ensure duplicate protection exists before sending reminders.
    await CustomerNotification.collection.createIndex(
      { notificationNumber: 1 },
      { unique: true }
    );

    const cursor = Package.find({
      createdAt: { $gte: CUTOFF },
      status: "Ready for Pickup",
      collectedAt: null,
      "storagePeriod.noticeNumber": { $exists: true, $ne: "" },
    })
      .select("_id")
      .lean()
      .cursor();

    try {
      for await (const pkg of cursor) {
        try {
          await processPackageReminder(pkg._id);
        } catch (error) {
          // Another server may have committed the same reminder.
          if (
            error.code === 11000 &&
            error.keyPattern?.notificationNumber
          ) {
            continue;
          }

          console.error(
            `Storage reminder failed for package ${pkg._id}:`,
            error.message
          );
        }
      }
    } finally {
      await cursor.close();
    }
  } catch (error) {
    console.error("Storage reminder check failed:", error.message);
  } finally {
    running = false;
  }
};

const startStorageReminderScheduler = () => {
  if (timer) return;

  void runStorageReminders();

  timer = setInterval(() => {
    void runStorageReminders();
  }, 15 * 60 * 1000);

  timer.unref();

  console.log("Storage reminder scheduler started.");
};

module.exports = {
  startStorageReminderScheduler,
};