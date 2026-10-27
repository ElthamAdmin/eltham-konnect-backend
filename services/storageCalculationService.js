const DAY_MS = 24 * 60 * 60 * 1000;

const parseDateOnly = (value, label) => {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(value)
  ) {
    throw new Error(`${label} must use YYYY-MM-DD format.`);
  }

  const date = new Date(`${value}T00:00:00.000Z`);

  if (
    Number.isNaN(date.getTime()) ||
    date.toISOString().slice(0, 10) !== value
  ) {
    throw new Error(`${label} is not a valid date.`);
  }

  return date;
};

const formatDateOnly = (date) =>
  date.toISOString().slice(0, 10);

const addCalendarDays = (date, numberOfDays) =>
  new Date(date.getTime() + numberOfDays * DAY_MS);

/**
 * Dates are Jamaica calendar dates supplied as YYYY-MM-DD strings.
 * The notice date itself is excluded from the free-business-day count.
 *
 * holidayDates must contain the observed Jamaican public holidays.
 * coveredYears identifies years for which that list is complete.
 */
const calculateStorageFee = ({
  noticeDate,
  asOfDate,
  holidayDates,
  coveredYears,
  freeBusinessDays = 7,
  firstDayFee = 150,
  additionalDailyFee = 50,
}) => {
  const notice = parseDateOnly(noticeDate, "Notice date");
  const asOf = parseDateOnly(asOfDate, "Calculation date");

  if (asOf < notice) {
    throw new Error(
      "Calculation date cannot be before the notice date."
    );
  }

  if (!Array.isArray(holidayDates) || !Array.isArray(coveredYears)) {
    throw new Error(
      "Holiday dates and covered calendar years are required."
    );
  }

  if (
    !Number.isInteger(freeBusinessDays) ||
    freeBusinessDays < 1 ||
    freeBusinessDays > 366
  ) {
    throw new Error("Free business days must be between 1 and 366.");
  }

  if (
    !Number.isFinite(firstDayFee) ||
    firstDayFee < 0 ||
    !Number.isFinite(additionalDailyFee) ||
    additionalDailyFee < 0
  ) {
    throw new Error("Storage fee amounts must be valid non-negative numbers.");
  }

  const holidays = new Set();

  for (const holiday of holidayDates) {
    const date = parseDateOnly(holiday, "Holiday date");
    holidays.add(formatDateOnly(date));
  }

  const years = new Set(coveredYears.map(Number));

  const requireCoveredYear = (date) => {
    const year = date.getUTCFullYear();

    if (!years.has(year)) {
      throw new Error(
        `The Jamaican holiday calendar for ${year} has not been confirmed.`
      );
    }
  };

  let day = notice;
  let countedDays = 0;
  let lastFreeDate = null;

  // Seven free business days: Monday–Saturday, excluding holidays.
  while (countedDays < freeBusinessDays) {
    day = addCalendarDays(day, 1);
    requireCoveredYear(day);

    const isSunday = day.getUTCDay() === 0;
    const isHoliday = holidays.has(formatDateOnly(day));

    if (!isSunday && !isHoliday) {
      countedDays += 1;
      lastFreeDate = day;
    }
  }

  // The first chargeable day is the calendar day after the
  // final free business day, even if that day is a closure.
  const firstChargeDate = addCalendarDays(lastFreeDate, 1);

  let chargeableDays = 0;
  let amount = 0;

  if (asOf >= firstChargeDate) {
    chargeableDays =
      Math.floor((asOf.getTime() - firstChargeDate.getTime()) / DAY_MS) + 1;

    amount =
      firstDayFee +
      (chargeableDays - 1) * additionalDailyFee;

    amount = Math.round((amount + Number.EPSILON) * 100) / 100;
  }

  return {
    noticeDate,
    asOfDate,
    lastFreeDate: formatDateOnly(lastFreeDate),
    firstChargeDate: formatDateOnly(firstChargeDate),
    chargeableDays,
    amount,
    currency: "JMD",
  };
};

module.exports = {
  calculateStorageFee,
};