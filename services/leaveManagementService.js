const LeavePolicy = require("../models/LeavePolicy");
const LeaveBalanceTransaction = require(
  "../models/LeaveBalanceTransaction"
);
const HREmployee = require("../models/HREmployee");

const YMD_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const DAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

const roundUnits = (value) =>
  Number(Number(value || 0).toFixed(4));

const roundMinutes = (value) =>
  Math.max(0, Math.round(Number(value || 0)));

const normalizeString = (value) =>
  String(value || "").trim();

const isValidYmdDate = (value) => {
  const text = normalizeString(value);

  if (!YMD_PATTERN.test(text)) {
    return false;
  }

  const date = new Date(`${text}T12:00:00.000Z`);

  return (
    !Number.isNaN(date.getTime()) &&
    date.toISOString().slice(0, 10) === text
  );
};

const getJamaicaTodayYmd = () => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Jamaica",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const values = Object.fromEntries(
    parts.map((part) => [
      part.type,
      part.value,
    ])
  );

  return `${values.year}-${values.month}-${values.day}`;
};

const getUserName = (user) =>
  user?.fullName ||
  user?.name ||
  user?.email ||
  "System User";

const getUserId = (user) =>
  user?.userId ||
  user?._id ||
  "";

const createTransactionNumber = () =>
  `LBT-${Date.now()}-${Math.floor(
    1000 + Math.random() * 9000
  )}`;

const getDateRange = (startDate, endDate) => {
  if (
    !isValidYmdDate(startDate) ||
    !isValidYmdDate(endDate)
  ) {
    throw new Error(
      "Leave dates must use valid YYYY-MM-DD values."
    );
  }

  if (endDate < startDate) {
    throw new Error(
      "Leave end date cannot be earlier than its start date."
    );
  }

  const start = new Date(
    `${startDate}T12:00:00.000Z`
  );

  const end = new Date(
    `${endDate}T12:00:00.000Z`
  );

  const dates = [];
  const cursor = new Date(start);

  while (cursor <= end) {
    dates.push(
      cursor.toISOString().slice(0, 10)
    );

    cursor.setUTCDate(
      cursor.getUTCDate() + 1
    );

    if (dates.length > 366) {
      throw new Error(
        "A single leave request cannot exceed 366 calendar days."
      );
    }
  }

  return dates;
};

const calculateScheduledMinutes = ({
  workDate,
  startTime,
  endTime,
  unpaidBreakMinutes = 0,
}) => {
  if (!startTime || !endTime) {
    return 0;
  }

  const start = new Date(
    `${workDate}T${startTime}:00-05:00`
  );

  const end = new Date(
    `${workDate}T${endTime}:00-05:00`
  );

  if (
    Number.isNaN(start.getTime()) ||
    Number.isNaN(end.getTime()) ||
    end <= start
  ) {
    return 0;
  }

  const elapsedMinutes = Math.floor(
    (end.getTime() - start.getTime()) /
      60000
  );

  return Math.max(
    0,
    elapsedMinutes -
      roundMinutes(unpaidBreakMinutes)
  );
};

const calculateServiceDays = (
  employee,
  assessmentDate
) => {
  const startDate = normalizeString(
    employee?.startDate
  );

  if (
    !isValidYmdDate(startDate) ||
    !isValidYmdDate(assessmentDate) ||
    assessmentDate < startDate
  ) {
    return 0;
  }

  const start = new Date(
    `${startDate}T12:00:00.000Z`
  );

  const end = new Date(
    `${assessmentDate}T12:00:00.000Z`
  );

  return Math.floor(
    (end.getTime() - start.getTime()) /
      86400000
  ) + 1;
};

const resolveEffectiveLeavePolicy = async ({
  leaveType,
  assessmentDate,
  employmentType = "",
  session = null,
}) => {
  const normalizedLeaveType =
    normalizeString(leaveType);

  const normalizedDate =
    normalizeString(assessmentDate) ||
    getJamaicaTodayYmd();

  if (!normalizedLeaveType) {
    throw new Error(
      "Leave type is required to resolve a policy."
    );
  }

  if (!isValidYmdDate(normalizedDate)) {
    throw new Error(
      "Leave-policy assessment date must use YYYY-MM-DD."
    );
  }

  const query = {
    leaveType: normalizedLeaveType,
    status: "Active",
    effectiveFrom: {
      $lte: normalizedDate,
    },
    $or: [
      {
        effectiveTo: "",
      },
      {
        effectiveTo: null,
      },
      {
        effectiveTo: {
          $gte: normalizedDate,
        },
      },
    ],
  };

  if (normalizeString(employmentType)) {
    query.$and = [
      {
        $or: [
          {
            eligibleEmploymentTypes: {
              $size: 0,
            },
          },
          {
            eligibleEmploymentTypes:
              normalizeString(
                employmentType
              ),
          },
        ],
      },
    ];
  }

  let policyQuery = LeavePolicy.findOne(
    query
  ).sort({
    effectiveFrom: -1,
    createdAt: -1,
  });

  if (session) {
    policyQuery = policyQuery.session(session);
  }

  const policy = await policyQuery;

  if (!policy) {
    throw new Error(
      `No active ${normalizedLeaveType} leave policy applies on ${normalizedDate}.`
    );
  }

  return policy;
};

const validatePolicyEligibility = ({
  employee,
  policy,
  assessmentDate,
  requestedCalendarDays,
}) => {
  const serviceDays =
    calculateServiceDays(
      employee,
      assessmentDate
    );

  const requiredServiceDays =
    Math.max(
      Number(
        policy.minimumServiceDays || 0
      ),
      Number(
        policy.minimumServiceWeeks || 0
      ) * 7,
      Number(
        policy.minimumServiceMonths || 0
      ) * 30
    );

  if (serviceDays < requiredServiceDays) {
    throw new Error(
      `${employee.fullName} does not yet satisfy the minimum service requirement for ${policy.policyName}.`
    );
  }

  const calendarWeekLimit =
    policy.durationUnit ===
      "Calendar Weeks" &&
    Number(
      policy.standardDurationUnits || 0
    ) > 0
      ? Number(
          policy.standardDurationUnits
        ) * 7
      : 0;

  const maximumCalendarDays =
    calendarWeekLimit ||
    Number(
      policy.maximumConsecutiveDays ||
        0
    );

  if (
    maximumCalendarDays > 0 &&
    requestedCalendarDays >
      maximumCalendarDays
  ) {
    const durationDescription =
      policy.durationUnit ===
      "Calendar Weeks"
        ? `${policy.standardDurationUnits} calendar weeks`
        : `${maximumCalendarDays} consecutive calendar days`;

    throw new Error(
      `${policy.policyName} permits no more than ${durationDescription}.`
    );
  }
};

const calculateLeaveRequestTreatment =
  async ({
    employeeId,
    leaveType,
    startDate,
    endDate,
    session = null,
  }) => {
    const normalizedEmployeeId =
      normalizeString(employeeId);

    if (!normalizedEmployeeId) {
      throw new Error(
        "Employee is required for leave calculation."
      );
    }

    let employeeQuery =
      HREmployee.findOne({
        employeeId:
          normalizedEmployeeId,
      });

    if (session) {
      employeeQuery =
        employeeQuery.session(session);
    }

    const employee =
      await employeeQuery;

    if (!employee) {
      throw new Error(
        "The selected employee was not found."
      );
    }

    const dates = getDateRange(
      startDate,
      endDate
    );

    const policy =
      await resolveEffectiveLeavePolicy({
        leaveType,
        assessmentDate: startDate,
        employmentType:
          employee.employmentType,
        session,
      });

    validatePolicyEligibility({
      employee,
      policy,
      assessmentDate: startDate,
      requestedCalendarDays:
        dates.length,
    });

    const weeklySchedule =
      Array.isArray(
        employee.weeklySchedule
      )
        ? employee.weeklySchedule
        : [];

    if (!weeklySchedule.length) {
      throw new Error(
        "The employee master does not contain a controlled weekly schedule."
      );
    }

    const scheduleByDay =
      new Map(
        weeklySchedule.map(
          (schedule) => [
            schedule.dayName,
            schedule,
          ]
        )
      );

    const dailyBreakdown = [];
    let totalScheduledMinutes = 0;
    let payableLeaveMinutes = 0;
    let unpaidLeaveMinutes = 0;
    let scheduledLeaveDays = 0;

        for (
      const [
        dateIndex,
        workDate,
      ] of dates.entries()
    ) {
      const date = new Date(
        `${workDate}T12:00:00.000Z`
      );

      const dayName =
        DAY_NAMES[date.getUTCDay()];

      const schedule =
        scheduleByDay.get(dayName);

      const scheduledWorkday =
        Boolean(
          schedule?.requiredWorkday
        );

      const scheduledMinutes =
        scheduledWorkday
          ? calculateScheduledMinutes({
              workDate,
              startTime:
                schedule.startTime,
              endTime:
                schedule.endTime,
              unpaidBreakMinutes:
                schedule.unpaidBreakMinutes,
            })
          : 0;

      if (
        scheduledWorkday &&
        scheduledMinutes > 0
      ) {
        scheduledLeaveDays += 1;
      }

      let payableMinutes = 0;
      let unpaidMinutes = 0;

      if (
        policy.payTreatment === "Paid"
      ) {
        payableMinutes =
          scheduledMinutes;
      } else if (
        policy.payTreatment ===
        "Unpaid"
      ) {
        unpaidMinutes =
          scheduledMinutes;
            } else if (
        policy.payTreatment === "Mixed"
      ) {
        const usesCalendarWeeks =
          policy.durationUnit ===
            "Calendar Weeks" &&
          Number(
            policy.standardDurationUnits ||
              0
          ) > 0;

        if (usesCalendarWeeks) {
          const paidCalendarDays =
            Math.max(
              0,
              Number(
                policy
                  .employerPaidDurationUnits ||
                  0
              ) * 7
            );

          /*
           * The calendar position determines the paid and
           * unpaid portions. The employee's own schedule
           * determines how many payable minutes occur on
           * each date.
           */
          if (
            dateIndex <
            paidCalendarDays
          ) {
            payableMinutes =
              scheduledMinutes;
          } else {
            unpaidMinutes =
              scheduledMinutes;
          }
        } else {
          payableMinutes =
            roundMinutes(
              scheduledMinutes *
                (
                  Number(
                    policy.payPercentage ||
                      0
                  ) / 100
                )
            );

          unpaidMinutes = Math.max(
            0,
            scheduledMinutes -
              payableMinutes
          );
        }
      } else if (
        policy.payTreatment ===
        "NIS-Coordinated"
      ) {
        /*
         * Preserve scheduled payable time for attendance,
         * while payroll separately reviews NIS coordination.
         */
        payableMinutes =
          scheduledMinutes;
      }

      totalScheduledMinutes +=
        scheduledMinutes;

      payableLeaveMinutes +=
        payableMinutes;

      unpaidLeaveMinutes +=
        unpaidMinutes;

      dailyBreakdown.push({
        workDate,
        dayName,
        scheduledWorkday,
        scheduledMinutes,
        payableMinutes,
        unpaidMinutes,
        payTreatment:
          policy.payTreatment,
        notes:
          scheduledWorkday
            ? `${policy.policyName} applied.`
            : "Not a required workday.",
      });
    }

    return {
      employee,
      policy,
      treatment: {
        totalCalendarDays:
          dates.length,
        totalDays: scheduledLeaveDays,
        totalScheduledMinutes,
        payableLeaveMinutes,
        unpaidLeaveMinutes,
        dailyBreakdown,
        legalClassification:
          policy.legalClassification,
        payTreatment:
          policy.payTreatment,
                payrollEffect:
          policy.payrollEffect,
        durationUnit:
          policy.durationUnit ||
          "Scheduled Days",
        standardDurationUnits:
          Number(
            policy.standardDurationUnits ||
              0
          ),
        employerPaidDurationUnits:
          Number(
            policy
              .employerPaidDurationUnits ||
              0
          ),
        maximumExtensionUnits:
          Number(
            policy.maximumExtensionUnits ||
              0
          ),
        countsAsPayableAttendance:
          policy.countsAsPayableAttendance,
        balanceTracked:
          policy.balanceTracked,
        balanceType:
          policy.balanceType,
        balanceEffect:
          policy.balanceTracked
            ? "Deduct"
            : "No Deduction",
        balanceUnits:
          policy.balanceTracked
            ? scheduledLeaveDays
            : 0,
        supportingDocumentsRequired:
          policy.supportingDocumentsRequired,
        medicalCertificateRequired:
          policy.medicalCertificateRequired &&
          dates.length >=
            Number(
              policy
                .medicalCertificateRequiredAfterDays ||
                1
            ),
        documentStatus:
          policy.supportingDocumentsRequired
            ? "Pending"
            : "Not Required",
      },
    };
  };

const getEmployeeLeaveBalances =
  async ({
    employeeId,
    asOfDate = "",
    session = null,
  }) => {
    const normalizedEmployeeId =
      normalizeString(employeeId);

    const normalizedDate =
      normalizeString(asOfDate) ||
      getJamaicaTodayYmd();

    if (!normalizedEmployeeId) {
      throw new Error(
        "Employee is required to retrieve leave balances."
      );
    }

    if (!isValidYmdDate(normalizedDate)) {
      throw new Error(
        "Leave-balance date must use YYYY-MM-DD."
      );
    }

    let query =
      LeaveBalanceTransaction.find({
        employeeId:
          normalizedEmployeeId,
        status: "Posted",
        effectiveDate: {
          $lte: normalizedDate,
        },
      }).sort({
        effectiveDate: 1,
        createdAt: 1,
      });

    if (session) {
      query = query.session(session);
    }

    const transactions = await query;

    const balances = {
      Vacation: 0,
      Sick: 0,
      Emergency: 0,
      Other: 0,
    };

    for (const transaction of transactions) {
      balances[
        transaction.balanceType
      ] = roundUnits(
        balances[
          transaction.balanceType
        ] +
          Number(
            transaction.units || 0
          )
      );
    }

    return {
      employeeId:
        normalizedEmployeeId,
      asOfDate: normalizedDate,
      balances,
      transactions,
    };
  };

const postLeaveBalanceTransaction =
  async ({
    employee,
    balanceType,
    transactionType,
    units,
    effectiveDate,
    policy = null,
    leaveRequestId = "",
    relatedTransactionNumber = "",
    sourceType = "Other",
    sourceReference = "",
    reason,
    notes = "",
    supportingDocumentReference = "",
    user = null,
    session = null,
  }) => {
    if (!employee?.employeeId) {
      throw new Error(
        "Employee is required to post a leave-balance transaction."
      );
    }

    const numericUnits =
      roundUnits(units);

    if (numericUnits === 0) {
      throw new Error(
        "Leave-balance transaction units cannot be zero."
      );
    }

    const balanceResult =
      await getEmployeeLeaveBalances({
        employeeId:
          employee.employeeId,
        asOfDate: effectiveDate,
        session,
      });

    const balanceBefore =
      roundUnits(
        balanceResult.balances[
          balanceType
        ] || 0
      );

    const balanceAfter =
      roundUnits(
        balanceBefore +
          numericUnits
      );

    if (balanceAfter < 0) {
      throw new Error(
        `${employee.fullName} does not have enough ${balanceType.toLowerCase()} leave balance.`
      );
    }

    const transaction =
      new LeaveBalanceTransaction({
        transactionNumber:
          createTransactionNumber(),

        employeeId:
          employee.employeeId,

        employeeSnapshot: {
          fullName:
            employee.fullName,
          jobTitle:
            employee.jobTitle || "",
          department:
            employee.department || "",
          branch:
            employee.branch || "",
          employmentStatus:
            employee.employmentStatus ||
            "",
        },

        balanceType,
        transactionType,
        unitType: "Days",
        units: numericUnits,
        balanceBefore,
        balanceAfter,
        effectiveDate,
        periodKey:
          effectiveDate.slice(0, 7),

        policyCode:
          policy?.policyCode || "",

        policySnapshot: policy
          ? {
              policyCode:
                policy.policyCode,
              policyName:
                policy.policyName,
              leaveType:
                policy.leaveType,
              legalClassification:
                policy.legalClassification,
              payTreatment:
                policy.payTreatment,
              effectiveFrom:
                policy.effectiveFrom,
              effectiveTo:
                policy.effectiveTo,
            }
          : null,

        leaveRequestId:
          normalizeString(
            leaveRequestId
          ),

        relatedTransactionNumber:
          normalizeString(
            relatedTransactionNumber
          ),

        sourceType,
        sourceReference:
          normalizeString(
            sourceReference
          ),

        reason:
          normalizeString(reason),

        notes:
          normalizeString(notes),

        supportingDocumentReference:
          normalizeString(
            supportingDocumentReference
          ),

        status: "Posted",
        postedBy: getUserName(user),
        postedByUserId:
          getUserId(user),
        postedAt: new Date(),
        createdBy: getUserName(user),
        updatedBy: getUserName(user),
      });

    await transaction.save({
      session,
    });

    return transaction;
  };

const reverseLeaveBalanceTransaction =
  async ({
    transactionNumber,
    reversalReason,
    user = null,
    session = null,
  }) => {
    const normalizedNumber =
      normalizeString(
        transactionNumber
      );

    if (!normalizedNumber) {
      throw new Error(
        "Leave-balance transaction number is required."
      );
    }

    if (!normalizeString(reversalReason)) {
      throw new Error(
        "A reversal reason is required."
      );
    }

    let originalQuery =
      LeaveBalanceTransaction.findOne({
        transactionNumber:
          normalizedNumber,
      });

    if (session) {
      originalQuery =
        originalQuery.session(session);
    }

    const original =
      await originalQuery;

    if (!original) {
      throw new Error(
        "Leave-balance transaction was not found."
      );
    }

    if (original.status !== "Posted") {
      throw new Error(
        "Only a posted leave-balance transaction can be reversed."
      );
    }

    const employee =
      await HREmployee.findOne({
        employeeId:
          original.employeeId,
      }).session(session || null);

    if (!employee) {
      throw new Error(
        "The related employee was not found."
      );
    }

    const reversal =
      await postLeaveBalanceTransaction({
        employee,
        balanceType:
          original.balanceType,
        transactionType:
          "Reversal",
        units:
          Number(original.units) * -1,
        effectiveDate:
          getJamaicaTodayYmd(),
        leaveRequestId:
          original.leaveRequestId,
        relatedTransactionNumber:
          original.transactionNumber,
        sourceType:
          "System Reversal",
        sourceReference:
          original.transactionNumber,
        reason: reversalReason,
        notes:
          `Reverses ${original.transactionNumber}.`,
        user,
        session,
      });

    original.status = "Reversed";
    original.reversedBy =
      getUserName(user);
    original.reversedByUserId =
      getUserId(user);
    original.reversedAt =
      new Date();
    original.reversalReason =
      normalizeString(
        reversalReason
      );
    original.updatedBy =
      getUserName(user);

    await original.save({
      session,
    });

    return {
      original,
      reversal,
    };
  };

module.exports = {
  resolveEffectiveLeavePolicy,
  calculateLeaveRequestTreatment,
  getEmployeeLeaveBalances,
  postLeaveBalanceTransaction,
  reverseLeaveBalanceTransaction,
};