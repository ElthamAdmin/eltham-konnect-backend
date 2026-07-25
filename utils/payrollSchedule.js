const PAY_PERIOD_PATTERN =
  /^\d{4}-(0[1-9]|1[0-2])$/;

const validatePayPeriod = (
  payPeriod
) => {
  const normalizedPeriod =
    String(payPeriod || "").trim();

  if (
    !PAY_PERIOD_PATTERN.test(
      normalizedPeriod
    )
  ) {
    throw new Error(
      "Pay period must use the YYYY-MM format."
    );
  }

  return normalizedPeriod;
};

const shiftYmdDate = (
  ymdDate,
  days
) => {
  const date = new Date(
    `${ymdDate}T12:00:00.000Z`
  );

  if (Number.isNaN(date.getTime())) {
    throw new Error(
      "A valid YYYY-MM-DD date is required."
    );
  }

  date.setUTCDate(
    date.getUTCDate() +
      Number(days || 0)
  );

  return date
    .toISOString()
    .slice(0, 10);
};

const getScheduledMonthlyPayDate = (
  payPeriod
) => {
  const normalizedPeriod =
    validatePayPeriod(payPeriod);

  const [yearValue, monthValue] =
    normalizedPeriod.split("-");

  const scheduledDate = new Date(
    Date.UTC(
      Number(yearValue),
      Number(monthValue) - 1,
      25
    )
  );

  const scheduledDay =
    scheduledDate.getUTCDay();

  /*
   * When the 25th falls on Saturday,
   * Sunday or Monday, use the preceding
   * Thursday.
   */
  if ([0, 1, 6].includes(scheduledDay)) {
    while (
      scheduledDate.getUTCDay() !== 4
    ) {
      scheduledDate.setUTCDate(
        scheduledDate.getUTCDate() - 1
      );
    }
  }

  return scheduledDate
    .toISOString()
    .slice(0, 10);
};

const getMonthlyAttendanceCutoffDate = (
  payPeriod
) =>
  shiftYmdDate(
    getScheduledMonthlyPayDate(
      payPeriod
    ),
    -1
  );

module.exports = {
  validatePayPeriod,
  shiftYmdDate,
  getScheduledMonthlyPayDate,
  getMonthlyAttendanceCutoffDate,
};