/*
 * Recurring Jamaican holidays are calculated automatically.
 * Approved company closures are included separately.
 *
 * Special government declarations must be added explicitly.
 * December 27 is not automatically treated as a substitute
 * when Christmas falls on Saturday.
 */

const formatDate = (date) => date.toISOString().slice(0, 10);

const addDays = (date, days) => {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
};

const easterSunday = (year) => {
  // Gregorian Easter calculation.
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;

  return new Date(Date.UTC(year, month - 1, day));
};

const buildYear = (year) => {
  const holidays = [];

  const add = (date, name) => {
    holidays.push({
      date: formatDate(date),
      name,
    });
  };

  const addObserved = (
    month,
    day,
    name,
    moveSaturday = false
  ) => {
    let date = new Date(Date.UTC(year, month - 1, day));
    const weekday = date.getUTCDay();

    if (weekday === 0) {
      date = addDays(date, 1);
    } else if (moveSaturday && weekday === 6) {
      date = addDays(date, 2);
    }

    add(date, name);
  };

  const easter = easterSunday(year);

  addObserved(1, 1, "New Year's Day");
  add(addDays(easter, -46), "Ash Wednesday");
  add(addDays(easter, -2), "Good Friday");
  add(addDays(easter, 1), "Easter Monday");

  // Labour Day moves to Monday if May 23 is Saturday or Sunday.
  addObserved(5, 23, "Labour Day", true);

  // These holidays move to Monday only when they fall on Sunday.
  addObserved(8, 1, "Emancipation Day");
  addObserved(8, 6, "Independence Day");

  const octoberFirst = new Date(Date.UTC(year, 9, 1));
  const firstMondayOffset =
    (1 - octoberFirst.getUTCDay() + 7) % 7;

  add(
    addDays(octoberFirst, firstMondayOffset + 14),
    "National Heroes' Day"
  );

  const christmas = new Date(Date.UTC(year, 11, 25));

  add(christmas, "Christmas Day");

  if (christmas.getUTCDay() === 0) {
    add(addDays(christmas, 1), "Christmas Day observed");
    add(addDays(christmas, 2), "Boxing Day observed");
  } else {
    add(addDays(christmas, 1), "Boxing Day");
  }

  return holidays;
};

const approvedCompanyClosures = [
  {
    date: "2027-12-27",
    name: "Eltham Konnect collection closure",
    companyClosure: true,
  },
];

const getJamaicaHolidayCalendar = ({
  startYear = 2027,
  endYear = Math.max(2028, new Date().getUTCFullYear() + 2),
  additionalClosures = [],
} = {}) => {
  if (
    !Number.isInteger(startYear) ||
    !Number.isInteger(endYear) ||
    startYear < 2027 ||
    endYear < startYear ||
    endYear > 9999
  ) {
    throw new Error("Invalid storage calendar year range.");
  }

  if (!Array.isArray(additionalClosures)) {
    throw new Error("Additional closures must be a list.");
  }

  const holidays = [];
  const coveredYears = [];

  for (let year = startYear; year <= endYear; year += 1) {
    holidays.push(...buildYear(year));
    coveredYears.push(year);
  }

  for (const closure of [
    ...approvedCompanyClosures,
    ...additionalClosures,
  ]) {
    const value = closure?.date;

    if (
      typeof value !== "string" ||
      !/^\d{4}-\d{2}-\d{2}$/.test(value)
    ) {
      throw new Error("Closure dates must use YYYY-MM-DD.");
    }

    const parsed = new Date(`${value}T00:00:00.000Z`);

    if (
      !Number.isFinite(parsed.getTime()) ||
      formatDate(parsed) !== value
    ) {
      throw new Error("A closure date is invalid.");
    }

    const year = parsed.getUTCFullYear();

    if (year >= startYear && year <= endYear) {
      holidays.push({
        ...closure,
        date: value,
        name: closure.name || "Additional collection closure",
      });
    }
  }

  return {
    holidays: holidays.sort((a, b) => a.date.localeCompare(b.date)),
    coveredYears,
  };
};

module.exports = {
  getJamaicaHolidayCalendar,
};