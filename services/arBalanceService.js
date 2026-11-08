const round = (value) =>
  Math.round((Number(value) + Number.EPSILON) * 100) / 100;

const getPostedWriteOffAmount = (invoice) => {
  const posted =
    Boolean(invoice.writeOffJournalEntryNumber) ||
    ["Written Off", "Recovered"].includes(invoice.writeOffStatus);

  return posted ? round(invoice.writeOffAmount || 0) : 0;
};

const getInvoiceExpectedBalance = (invoice) =>
  round(
    Number(invoice.finalTotal || 0) -
    Number(invoice.amountPaid || 0) -
    getPostedWriteOffAmount(invoice)
  );

const getInvoiceReportBalance = (invoice) => {
  if (["Draft", "Cancelled", "Refunded", "Written Off"].includes(invoice.status)) {
    return 0;
  }

  // Preserve a stored zero; do not replace it using a truthy fallback.
  if (
    invoice.balanceDue !== null &&
    invoice.balanceDue !== undefined &&
    Number.isFinite(Number(invoice.balanceDue))
  ) {
    return round(invoice.balanceDue);
  }

  return getInvoiceExpectedBalance(invoice);
};

const assertCollectibleBalance = (invoice) => {
  const fail = (message) => {
    const error = new Error(message);
    error.statusCode = 409;
    throw error;
  };

  if (!["Unpaid", "Partially Paid"].includes(invoice.status)) {
    fail("This invoice is not available for payment.");
  }

  const total = Number(invoice.finalTotal);
  const paid = Number(invoice.amountPaid);
  const writeOff = getPostedWriteOffAmount(invoice);
  const balance = Number(invoice.balanceDue);
  const expected = getInvoiceExpectedBalance(invoice);

  if (
    ![total, paid, writeOff, balance, expected].every(Number.isFinite) ||
    total < 0 ||
    paid < 0 ||
    writeOff < 0 ||
    expected < 0 ||
    round(balance) !== expected
  ) {
    fail(
      "The invoice balance does not agree with its payments and posted write-off. No payment was recorded."
    );
  }

  return round(balance);
};

const jamaicaToday = () => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Jamaica",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  return ["year", "month", "day"]
    .map((type) => parts.find((part) => part.type === type)?.value)
    .join("-");
};

const dateOnly = (value) => {
  if (!value) return "";

  const supplied = String(value);

  if (/^\d{4}-\d{2}-\d{2}$/.test(supplied)) {
    const date = new Date(`${supplied}T00:00:00.000Z`);

    return !Number.isNaN(date.getTime()) &&
      date.toISOString().slice(0, 10) === supplied
      ? supplied
      : "";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Jamaica",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  return ["year", "month", "day"]
    .map((type) => parts.find((part) => part.type === type)?.value)
    .join("-");
};

const daysPastDue = (value) => {
  const due = dateOnly(value);
  if (!due) return null;

  return Math.max(
    0,
    Math.round(
      (
        Date.parse(`${jamaicaToday()}T00:00:00.000Z`) -
        Date.parse(`${due}T00:00:00.000Z`)
      ) / 86400000
    )
  );
};

const getAgeBucket = (invoice) => {
  const days = daysPastDue(invoice.dueDate || invoice.createdAt);

  if (days === null) return "Unknown";
  if (days === 0) return "Current";
  if (days <= 30) return "1-30";
  if (days <= 60) return "31-60";
  if (days <= 90) return "61-90";
  return "90+";
};

module.exports = {
  getPostedWriteOffAmount,
  getInvoiceExpectedBalance,
  getInvoiceReportBalance,
  assertCollectibleBalance,
  jamaicaToday,
  dateOnly,
  daysPastDue,
  getAgeBucket,
};