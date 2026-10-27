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
  calendar = getJamaicaHolidayCalendar(),
}) => {
  if (!pkg) {
    throw new Error("A package is required.");
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

  if (!Array.isArray(calendar?.holidays)) {
    throw new Error("A valid holiday calendar is required.");
  }

  const calculation = calculateStorageFee({
    noticeDate,
    asOfDate: calculationDate,
    holidayDates: calendar.holidays.map((holiday) => holiday.date),
    coveredYears: calendar.coveredYears,
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