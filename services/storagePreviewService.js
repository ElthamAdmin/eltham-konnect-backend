const {
  calculateStorageFee,
} = require("./storageCalculationService");

const {
  getJamaicaHolidayCalendar,
} = require("./jamaicaHolidayCalendar");

const formatJamaicaDate = (value) => {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    throw new Error("A valid date is required.");
  }

  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Jamaica",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;

  if (!year || !month || !day) {
    throw new Error("Could not determine the Jamaica calendar date.");
  }

  return `${year}-${month}-${day}`;
};

/*
 * Produces an estimate only.
 *
 * It does not create StorageCharge records, update packages,
 * create invoices, post journals, or send notifications.
 */
const previewPackageStorage = ({
  pkg,
  asOf = new Date(),
  calendar = null,
  additionalClosures = [],
}) => {
  if (!pkg) {
    throw new Error("A package is required.");
  }

    const packageCreatedAt = pkg.createdAt
    ? new Date(pkg.createdAt)
    : null;

  if (
    !packageCreatedAt ||
    !Number.isFinite(packageCreatedAt.getTime())
  ) {
    return {
      available: false,
      reason:
        "The package date added is missing or invalid. " +
        "Review it before calculating storage fees.",
    };
  }

  // Midnight on 1 January 2027 in Jamaica.
  const storagePackageCutoff = new Date(
    "2027-01-01T00:00:00-05:00"
  );

  if (packageCreatedAt < storagePackageCutoff) {
    return {
      available: false,
      exempt: true,
      reason:
        "This package was added before 1 January 2027 " +
        "and is exempt from storage fees.",
    };
  }

  const period = pkg.storagePeriod;

  if (!period?.noticeNumber || !period?.noticeSentAt) {
    return {
      available: false,
      reason: "No storage notice has been recorded for this package.",
    };
  }

  const noticeDate = formatJamaicaDate(period.noticeSentAt);

  if (noticeDate < "2027-01-01") {
    throw new Error(
      "A storage notice date cannot be before January 1, 2027."
    );
  }

  let calculationDate = formatJamaicaDate(asOf);

  if (pkg.collectedAt) {
    const collectionDate = formatJamaicaDate(pkg.collectedAt);

    if (collectionDate < noticeDate) {
      throw new Error(
        "The collection date is before the storage notice date."
      );
    }

    if (collectionDate < calculationDate) {
      calculationDate = collectionDate;
    }
  }

    const storageCalendar = calendar ?? getJamaicaHolidayCalendar({
    endYear:
      Math.max(
        Number(noticeDate.slice(0, 4)),
        Number(calculationDate.slice(0, 4))
      ) + 2,
    additionalClosures,
  });

  if (
    !Array.isArray(storageCalendar?.holidays) ||
    !Array.isArray(storageCalendar?.coveredYears)
  ) {
    throw new Error("A valid holiday calendar is required.");
  }

  const calculation = calculateStorageFee({
    noticeDate,
    asOfDate: calculationDate,
        holidayDates: storageCalendar.holidays.map((holiday) => holiday.date),
    coveredYears: storageCalendar.coveredYears,
    freeBusinessDays: period.freeBusinessDays,
    firstDayFee: period.firstDayFee,
    additionalDailyFee: period.additionalDailyFee,
  });

  return {
    available: true,
    trackingNumber: pkg.trackingNumber,
    noticeNumber: period.noticeNumber,
    collected: Boolean(pkg.collectedAt),
    ...calculation,
  };
};

module.exports = {
  previewPackageStorage,
};