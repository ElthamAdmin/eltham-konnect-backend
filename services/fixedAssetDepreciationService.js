const crypto = require("crypto");

const POLICY = "SL_PRORATA_V1";

const fail = (message, statusCode = 409) => {
  throw Object.assign(new Error(message), { statusCode });
};

const hash = (value) =>
  crypto
    .createHash("sha256")
    .update(JSON.stringify(value))
    .digest("hex");

const today = () => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Jamaica",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  return ["year", "month", "day"]
    .map((key) => parts.find((part) => part.type === key).value)
    .join("-");
};

const dateOnly = (value, label) => {
  const day = String(value ?? "").trim();
  const parsed = new Date(`${day}T00:00:00Z`);

  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(day) ||
    Number.isNaN(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== day
  ) {
    fail(`${label} must be a valid YYYY-MM-DD date.`, 400);
  }

  return day;
};

const amountCents = (value, label) => {
  if (
    !["string", "number"].includes(typeof value) ||
    String(value).trim() === ""
  ) {
    fail(`${label} is required.`, 400);
  }

  const number = Number(value);
  const result = Math.round(number * 100);

  if (
    !Number.isFinite(number) ||
    number < 0 ||
    !Number.isSafeInteger(result)
  ) {
    fail(
      `${label} must be a valid non-negative amount.`,
      400
    );
  }

  return result;
};

const monthIndex = (period) => {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) {
    fail("Select a valid YYYY-MM depreciation period.", 400);
  }

  return (
    Number(period.slice(0, 4)) * 12 +
    Number(period.slice(5)) -
    1
  );
};

const periodAt = (index) =>
  `${String(Math.floor(index / 12)).padStart(4, "0")}-${String(
    index % 12 + 1
  ).padStart(2, "0")}`;

const lastDay = (period) => {
  monthIndex(period);

  const day = new Date(`${period}-01T00:00:00Z`);

  day.setUTCMonth(day.getUTCMonth() + 1);
  day.setUTCDate(0);

  return day.toISOString().slice(0, 10);
};

const terms = (asset) => {
  const cost = amountCents(
    asset.purchaseCost,
    "Purchase cost"
  );

  const salvage = amountCents(
    asset.salvageValue,
    "Salvage value"
  );

  const months = Math.round(
    Number(asset.usefulLifeYears) * 12
  );

  if (cost <= 0 || salvage > cost) {
    fail(
      "Purchase cost must be positive and salvage cannot exceed cost.",
      400
    );
  }

  if (
    !Number.isFinite(Number(asset.usefulLifeYears)) ||
    !Number.isSafeInteger(months) ||
    months < 1 ||
    months > 1200 ||
    Math.abs(
      Number(asset.usefulLifeYears) * 12 - months
    ) > 0.0000001
  ) {
    fail(
      "Useful life must represent 1–1200 whole months.",
      400
    );
  }

  const purchase = dateOnly(
    asset.purchaseDate,
    "Purchase date"
  );

  const ready = dateOnly(
    asset.inServiceDate,
    "Ready-for-use date"
  );

  if (
    purchase > today() ||
    ready > today() ||
    ready < purchase
  ) {
    fail(
      "Dates cannot be in the future, and ready-for-use cannot precede purchase.",
      400
    );
  }

  const firstPeriod = ready.slice(0, 7);
  const days = Number(lastDay(firstPeriod).slice(8));
  const firstDays = days - Number(ready.slice(8)) + 1;

  return {
    cost,
    salvage,
    months,
    firstPeriod,
    days,
    firstDays,
  };
};

const cumulativeCents = (term, offset) => {
  if (offset < 0) return 0;

  const denominator =
    BigInt(term.months) * BigInt(term.days);

  const elapsed =
    BigInt(term.firstDays) +
    BigInt(offset) * BigInt(term.days);

  const numerator =
    BigInt(term.cost - term.salvage) *
    (
      elapsed > denominator
        ? denominator
        : elapsed
    );

  return Number(
    (2n * numerator + denominator) /
      (2n * denominator)
  );
};

const calculatePeriod = (asset, period) => {
  if (
    asset.policyVersion !== POLICY ||
    asset.currency !== "JMD"
  ) {
    fail(
      "This asset requires a reviewed historical baseline before controlled depreciation."
    );
  }

  const term = terms(asset);
  const history = asset.depreciationHistory || [];
  const count = Number(asset.appliedPeriods || 0);

  if (
    !Number.isSafeInteger(count) ||
    count < 0 ||
    count !== history.length
  ) {
    fail("Asset depreciation history requires review.");
  }

  const first = monthIndex(term.firstPeriod);

  for (let index = 0; index < history.length; index++) {
    if (
      history[index].period !== periodAt(first + index) ||
      amountCents(
        history[index].amount,
        "History charge"
      ) !==
        cumulativeCents(term, index) -
          cumulativeCents(term, index - 1)
    ) {
      fail(
        "Recorded depreciation periods/charges require review."
      );
    }
  }

  const before = cumulativeCents(term, count - 1);

  if (
    amountCents(
      asset.accumulatedDepreciation,
      "Accumulated depreciation"
    ) !== before ||
    amountCents(
      asset.netBookValue,
      "Net book value"
    ) !== term.cost - before
  ) {
    fail(
      "Cost, depreciation and carrying value do not agree."
    );
  }

  const offset = monthIndex(period) - first;

  const existing = history.find(
    (record) => record.period === period
  );

  if (existing) {
    return {
      amount:
        amountCents(existing.amount, "Recorded charge") /
        100,

      before:
        cumulativeCents(term, offset - 1) / 100,

      after:
        cumulativeCents(term, offset) / 100,

      net:
        (
          term.cost -
          cumulativeCents(term, offset)
        ) / 100,

      alreadyPosted: true,
      journalEntryNumber:
        existing.journalEntryNumber || "",
    };
  }

  if (
    asset.status !== "Active" ||
    before === term.cost - term.salvage
  ) {
    fail("This asset has no further depreciation available.");
  }

  if (offset !== count) {
    fail(
      `Post periods sequentially. The next period for ${
        asset.assetNumber
      } is ${periodAt(first + count)}.`
    );
  }

  const after = cumulativeCents(term, offset);

  return {
    amount: (after - before) / 100,
    before: before / 100,
    after: after / 100,
    net: (term.cost - after) / 100,
    alreadyPosted: false,
    fullyDepreciated:
      after === term.cost - term.salvage,
  };
};

module.exports = {
  POLICY,
  fail,
  hash,
  today,
  dateOnly,
  amountCents,
  monthIndex,
  lastDay,
  terms,
  calculatePeriod,
};