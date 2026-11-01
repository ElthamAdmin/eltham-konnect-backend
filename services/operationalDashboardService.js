const Package = require("../models/Package");
const Customer = require("../models/Customer");

const TIME_ZONE = "America/Jamaica";
const DAY_MS = 24 * 60 * 60 * 1000;

const jamaicaDate = (value) => {
  if (!value) return "";

  // Preserve dates that were recorded without a time.
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(value))) {
    const parsed = new Date(`${value}T12:00:00Z`);

    return Number.isFinite(parsed.getTime()) &&
      parsed.toISOString().slice(0, 10) === value
      ? value
      : "";
  }

  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";

  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const get = (type) =>
    parts.find((part) => part.type === type)?.value;

  return `${get("year")}-${get("month")}-${get("day")}`;
};

const shiftDate = (date, days) =>
  new Date(
    new Date(`${date}T12:00:00Z`).getTime() + days * DAY_MS
  ).toISOString().slice(0, 10);

const daysBetween = (from, to) =>
  Math.round(
    (new Date(`${to}T12:00:00Z`) -
      new Date(`${from}T12:00:00Z`)) /
      DAY_MS
  );

const round = (value) =>
  Math.round((value + Number.EPSILON) * 100) / 100;

const buildOperationalDashboard = async ({
  from = "",
  to = "",
} = {}) => {
  const today = jamaicaDate(new Date());
  const end = to || today;
  const start = from || shiftDate(end, -29);

  if (
    !jamaicaDate(start) ||
    !jamaicaDate(end) ||
    start > end ||
    daysBetween(start, end) > 365
  ) {
    const error = new Error(
      "Choose a valid date range of no more than 366 days."
    );
    error.status = 400;
    throw error;
  }

  const periodDays = daysBetween(start, end) + 1;
  const previousEnd = shiftDate(start, -1);
  const previousStart = shiftDate(start, -periodDays);

  const [packages, customers] = await Promise.all([
    Package.find()
      .select(
        "trackingNumber status weight dateReceived createdAt " +
          "readyForPickup readyForPickupDate collectedAt"
      )
      .lean(),
    Customer.find()
      .select("signUpDate createdAt branch")
      .lean(),
  ]);

  const activePackages = packages.filter(
    (pkg) =>
      !["deleted", "cancelled", "canceled"].includes(
        String(pkg.status || "").trim().toLowerCase()
      )
  );

  const inRange = (date, rangeStart, rangeEnd) =>
    Boolean(date && date >= rangeStart && date <= rangeEnd);

  const receivedDate = (pkg) =>
    jamaicaDate(pkg.dateReceived) || jamaicaDate(pkg.createdAt);

  const signupDate = (customer) =>
    jamaicaDate(customer.signUpDate) ||
    jamaicaDate(customer.createdAt);

  const summarise = (rangeStart, rangeEnd) => {
    const received = activePackages.filter((pkg) =>
      inRange(receivedDate(pkg), rangeStart, rangeEnd)
    );

    const collected = activePackages.filter((pkg) =>
      inRange(jamaicaDate(pkg.collectedAt), rangeStart, rangeEnd)
    );

    const collectionDays = collected.flatMap((pkg) => {
      const ready = jamaicaDate(pkg.readyForPickupDate);
      const collection = jamaicaDate(pkg.collectedAt);

      return ready && collection >= ready
        ? [daysBetween(ready, collection)]
        : [];
    });

    return {
      packagesReceived: received.length,
      packagesCollected: collected.length,
      weightReceived: round(
        received.reduce((sum, pkg) => {
          const weight = Number(pkg.weight);
          return sum + (Number.isFinite(weight) ? weight : 0);
        }, 0)
      ),
      newCustomers: customers.filter((customer) =>
        inRange(signupDate(customer), rangeStart, rangeEnd)
      ).length,
      averageDaysToCollect: collectionDays.length
        ? round(
            collectionDays.reduce((sum, days) => sum + days, 0) /
              collectionDays.length
          )
        : null,
      collectionTimeSampleSize: collectionDays.length,
    };
  };

  const daily = [];

  for (let date = start; date <= end; date = shiftDate(date, 1)) {
    daily.push({ date, received: 0, collected: 0 });
  }

  const dailyByDate = new Map(
    daily.map((item) => [item.date, item])
  );

  const pipeline = {};
  let deliveredWithoutCollectionDate = 0;

  for (const pkg of activePackages) {
    const received = receivedDate(pkg);
    const collected = jamaicaDate(pkg.collectedAt);
    const status = String(pkg.status || "Unknown").trim();

    if (dailyByDate.has(received)) {
      dailyByDate.get(received).received += 1;
    }

    if (dailyByDate.has(collected)) {
      dailyByDate.get(collected).collected += 1;
    }

    if (inRange(received, start, end)) {
      const currentStatus = collected ? "Collected" : status;
      pipeline[currentStatus] = (pipeline[currentStatus] || 0) + 1;
    }

    if (
      ["delivered", "collected"].includes(status.toLowerCase()) &&
      !collected
    ) {
      deliveredWithoutCollectionDate += 1;
    }
  }

  return {
    filters: {
      from: start,
      to: end,
      previousFrom: previousStart,
      previousTo: previousEnd,
      timeZone: TIME_ZONE,
      scope: "All stores",
    },
    current: summarise(start, end),
    previous: summarise(previousStart, previousEnd),
    daily,
    receivedPackageCurrentStatuses: Object.entries(pipeline).map(
      ([status, count]) => ({ status, count })
    ),
    dataQuality: {
      deliveredWithoutCollectionDate,
      historicalCompletenessVerified: false,
      note:
        "Figures reflect recorded EKOS data. Historical transaction " +
        "completeness remains pending review.",
    },
  };
};

module.exports = { buildOperationalDashboard };