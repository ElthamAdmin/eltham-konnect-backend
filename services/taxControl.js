const crypto = require("crypto");

const fail = (message, statusCode = 400) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  throw error;
};

const text = (
  value,
  label,
  required = true
) => {
  if (
    (value === undefined || value === null) &&
    !required
  ) {
    return "";
  }

  if (
    typeof value !== "string" ||
    value.length > 1000 ||
    (required && !value.trim())
  ) {
    fail(`${label} must be valid text.`);
  }

  return value.trim();
};

const date = (
  value,
  label = "Date"
) => {
  const normalized = text(value, label);

  const parsed = new Date(
    `${normalized}T12:00:00.000Z`
  );

  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(normalized) ||
    normalized.startsWith("0000") ||
    !Number.isFinite(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !==
      normalized
  ) {
    fail(
      `${label} must be a real YYYY-MM-DD date.`
    );
  }

  return normalized;
};

const period = (value) => {
  const normalized = text(value, "Period");

  if (
    !/^\d{4}-(0[1-9]|1[0-2])$/.test(
      normalized
    )
  ) {
    fail(
      "Period must use YYYY-MM with a valid month."
    );
  }

  date(`${normalized}-01`);

  return normalized;
};

const today = () => {
  const parts = new Intl.DateTimeFormat(
    "en-CA",
    {
      timeZone: "America/Jamaica",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }
  ).formatToParts(new Date());

  return ["year", "month", "day"]
    .map(
      (key) =>
        parts.find(
          (part) => part.type === key
        ).value
    )
    .join("-");
};

const amount = (
  value,
  label = "Amount",
  positive = false
) => {
  if (
    !["number", "string"].includes(
      typeof value
    ) ||
    (typeof value === "string" &&
      !value.trim()) ||
    !Number.isFinite(Number(value)) ||
    Number(value) < 0
  ) {
    fail(
      `${label} must be a finite non-negative amount.`
    );
  }

  const cents = Math.round(
    Number(value) * 100
  );

  if (
    !Number.isSafeInteger(cents) ||
    (positive && cents <= 0)
  ) {
    fail(
      `${label} must be a valid ${
        positive ? "positive " : ""
      }amount.`
    );
  }

  return cents / 100;
};

const round = (value) =>
  Math.round(
    (Number(value) + Number.EPSILON) * 100
  ) / 100;

const number = (prefix) =>
  `${prefix}-${crypto.randomUUID()}`;

const actor = (req) =>
  req.user?.fullName ||
  req.user?.email ||
  req.user?.userId ||
  "System User";

const canonical = (taxType) =>
  ({
    "Individual Income Tax": "Income Tax",
    "Company Income Tax": "Company Tax",
  })[taxType] || taxType;

const map = {
  PAYE: "2100",
  NIS: "2110",
  NHT: "2120",
  "Education Tax": "2130",
  Pension: "2140",
  HEART: "2150",
  GCT: "2160",
  "Income Tax": "2170",
  "Company Tax": "2180",
};

const variants = (taxType) => {
  if (taxType === "Income Tax") {
    return [
      "Income Tax",
      "Individual Income Tax",
    ];
  }

  if (taxType === "Company Tax") {
    return [
      "Company Tax",
      "Company Income Tax",
    ];
  }

  return [taxType];
};

const handler = (controller) =>
  async (req, res) => {
    res.set("Cache-Control", "no-store");

    try {
      await controller(req, res);
    } catch (error) {
      console.error(
        "Tax Center:",
        error
      );

      const statusCode =
        error.statusCode ||
        (error.code === 11000
          ? 409
          : error.name === "ValidationError"
            ? 400
            : 500);

      return res.status(statusCode).json({
        success: false,
        message:
          statusCode === 500
            ? "Could not complete the tax operation. Refresh and check its status before retrying."
            : error.message,
      });
    }
  };

module.exports = {
  fail,
  text,
  date,
  period,
  today,
  amount,
  round,
  number,
  actor,
  canonical,
  map,
  variants,
  handler,
};