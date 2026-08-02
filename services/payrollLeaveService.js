const AttendancePeriod = require(
  "../models/AttendancePeriod"
);

const LeaveRequest = require(
  "../models/LeaveRequest"
);

const roundMoney = (value) =>
  Math.round(
    (Number(value || 0) +
      Number.EPSILON) *
      100
  ) / 100;

const normalizeString = (value) =>
  String(value || "").trim();

const buildBaseAssessment = ({
  employeeId,
  payPeriod,
  baseGrossPay,
}) => ({
  applicable: Boolean(
    normalizeString(employeeId)
  ),

  assessmentStatus:
    "Not Assessed",

  employeeId:
    normalizeString(employeeId),

  payPeriod:
    normalizeString(payPeriod),

  attendancePeriodId: null,
  attendancePeriodNumber: "",
  attendancePeriodStatus: "",

  scheduledMinutes: 0,
  payableLeaveMinutes: 0,
  unpaidLeaveMinutes: 0,
  nisCoordinatedLeaveMinutes: 0,

  baseGrossPay:
    roundMoney(baseGrossPay),

  unpaidLeaveDeduction: 0,

  adjustedGrossPay:
    roundMoney(baseGrossPay),

  leaveRequestIds: [],
  leaveEvidence: [],

  warning: "",
  assessedAt: new Date(),
});

const resolvePayrollLeaveAssessment =
  async ({
    employeeId,
    payPeriod,
    baseGrossPay,
    attendancePeriodNumber = "",
    session = null,
  }) => {
    const assessment =
      buildBaseAssessment({
        employeeId,
        payPeriod,
        baseGrossPay,
      });

    /*
     * Manual and legacy payroll without an employee ID
     * does not use controlled HR leave.
     */
    if (!assessment.applicable) {
      assessment.assessmentStatus =
        "Not Applicable";

      return assessment;
    }

    const attendanceQuery = {
      employeeId:
        assessment.employeeId,

      periodKey:
        assessment.payPeriod,

      status: {
        $in: [
          "Payroll Ready",
          "Locked",
        ],
      },
    };

    const requestedPeriodNumber =
      normalizeString(
        attendancePeriodNumber
      );

    if (requestedPeriodNumber) {
      attendanceQuery.periodNumber =
        requestedPeriodNumber;
    }

    let attendanceLookup =
      AttendancePeriod.findOne(
        attendanceQuery
      ).sort({
        payrollReadyAt: -1,
        updatedAt: -1,
      });

    if (session) {
      attendanceLookup =
        attendanceLookup.session(
          session
        );
    }

    const attendancePeriod =
      await attendanceLookup;

    if (!attendancePeriod) {
      assessment.assessmentStatus =
        "Review Required";

      assessment.warning =
        `A Payroll Ready attendance period is required for ` +
        `${assessment.employeeId}, period ${assessment.payPeriod}, ` +
        `before leave payroll effects can be confirmed.`;

      return assessment;
    }

    assessment.attendancePeriodId =
      attendancePeriod._id;

    assessment.attendancePeriodNumber =
      attendancePeriod.periodNumber;

    assessment.attendancePeriodStatus =
      attendancePeriod.status;

    assessment.scheduledMinutes =
      Math.max(
        0,
        Number(
          attendancePeriod.totals
            ?.scheduledMinutes || 0
        )
      );

    assessment.payableLeaveMinutes =
      Math.max(
        0,
        Number(
          attendancePeriod.totals
            ?.payableLeaveMinutes || 0
        )
      );

    assessment.unpaidLeaveMinutes =
      Math.max(
        0,
        Number(
          attendancePeriod.totals
            ?.unpaidLeaveMinutes || 0
        )
      );

    assessment
      .nisCoordinatedLeaveMinutes =
      Math.max(
        0,
        Number(
          attendancePeriod.totals
            ?.nisCoordinatedLeaveMinutes ||
            0
        )
      );

    const leaveEntries = (
      attendancePeriod.dailyEntries ||
      []
    ).filter(
      (entry) =>
        entry.approvedLeave === true &&
        normalizeString(
          entry.leaveRequestNumber
        )
    );

    assessment.leaveRequestIds =
      Array.from(
        new Set(
          leaveEntries.map((entry) =>
            normalizeString(
              entry.leaveRequestNumber
            )
          )
        )
      );

    /*
     * Payroll Ready attendance can legitimately contain
     * no approved leave.
     */
    if (
      assessment.leaveRequestIds
        .length === 0
    ) {
      assessment.assessmentStatus =
        "No Leave";

      return assessment;
    }

    let leaveLookup =
      LeaveRequest.find({
        leaveRequestId: {
          $in:
            assessment.leaveRequestIds,
        },

        employeeId:
          assessment.employeeId,

        status: "Approved",
      });

    if (session) {
      leaveLookup =
        leaveLookup.session(session);
    }

    const leaveRequests =
      await leaveLookup;

    const leaveById = new Map(
      leaveRequests.map(
        (leaveRequest) => [
          leaveRequest.leaveRequestId,
          leaveRequest,
        ]
      )
    );

    const missingLeaveRequestIds =
      assessment.leaveRequestIds.filter(
        (leaveRequestId) =>
          !leaveById.has(
            leaveRequestId
          )
      );

    if (
      missingLeaveRequestIds.length >
      0
    ) {
      assessment.assessmentStatus =
        "Review Required";

      assessment.warning =
        `Approved leave references no longer resolve correctly: ` +
        `${missingLeaveRequestIds.join(
          ", "
        )}.`;

      return assessment;
    }

    assessment.leaveEvidence =
      assessment.leaveRequestIds.map(
        (leaveRequestId) => {
          const leaveRequest =
            leaveById.get(
              leaveRequestId
            );

          const relatedEntries =
            leaveEntries.filter(
              (entry) =>
                normalizeString(
                  entry
                    .leaveRequestNumber
                ) === leaveRequestId
            );

          return {
            leaveRequestId,

            leaveType:
              leaveRequest.leaveType,

            policyCode:
              leaveRequest.policyCode ||
              "",

            payTreatment:
              leaveRequest.payTreatment,

            payrollEffect:
              leaveRequest.payrollEffect,

            payableMinutes:
              relatedEntries.reduce(
                (total, entry) =>
                  total +
                  Number(
                    entry
                      .leavePayableMinutes ||
                      0
                  ),
                0
              ),

            unpaidMinutes:
              relatedEntries.reduce(
                (total, entry) =>
                  total +
                  Number(
                    entry
                      .leaveUnpaidMinutes ||
                      0
                  ),
                0
              ),

            nisCoordinatedMinutes:
              relatedEntries.reduce(
                (total, entry) =>
                  total +
                  Number(
                    entry
                      .leaveNisCoordinatedMinutes ||
                      0
                  ),
                0
              ),

            nisCoordinationStatus:
              leaveRequest
                .nisCoordination
                ?.status ||
              "Not Required",

            nisDecisionReference:
              leaveRequest
                .nisCoordination
                ?.benefitDecisionReference ||
              "",

            nisApprovedBenefitAmount:
              Number(
                leaveRequest
                  .nisCoordination
                  ?.approvedBenefitAmount ||
                  0
              ),
          };
        }
      );

    /*
     * Mixed and NIS-coordinated leave must already have
     * a completed decision in controlled attendance.
     */
    const reviewEntries =
      leaveEntries.filter(
        (entry) =>
          entry
            .leaveRequiresPayrollReview ===
          true
      );

    if (reviewEntries.length > 0) {
      assessment.assessmentStatus =
        "Review Required";

      assessment.warning =
        "Mixed or NIS-coordinated leave requires a completed controlled payroll decision before payroll can be created or approved.";

      return assessment;
    }

    if (
      assessment.scheduledMinutes <=
        0 &&
      assessment.unpaidLeaveMinutes >
        0
    ) {
      assessment.assessmentStatus =
        "Review Required";

      assessment.warning =
        "Unpaid leave cannot be prorated because the Payroll Ready attendance period has no scheduled minutes.";

      return assessment;
    }

    /*
     * Paid leave remains in scheduled gross pay.
     * Only controlled unpaid leave reduces gross pay.
     */
    assessment.unpaidLeaveDeduction =
      assessment.scheduledMinutes > 0
        ? roundMoney(
            assessment.baseGrossPay *
              (
                assessment
                  .unpaidLeaveMinutes /
                assessment
                  .scheduledMinutes
              )
          )
        : 0;

    assessment.unpaidLeaveDeduction =
      Math.min(
        assessment.baseGrossPay,
        assessment
          .unpaidLeaveDeduction
      );

    assessment.adjustedGrossPay =
      roundMoney(
        assessment.baseGrossPay -
          assessment
            .unpaidLeaveDeduction
      );

    assessment.assessmentStatus =
      "Ready";

        return assessment;
  };

/*
 * Confirms approved leave against an approved payroll.
 *
 * This function must always be called inside the same
 * MongoDB transaction that approves the Payroll record.
 */
const confirmPayrollLeaveEffects =
  async ({
    payroll,
    user,
    session,
  }) => {
    const assessment =
      payroll.leavePayrollAssessment ||
      {};

    const leaveRequestIds =
      Array.from(
        new Set(
          (
            assessment.leaveRequestIds ||
            []
          )
            .map(normalizeString)
            .filter(Boolean)
        )
      );

    /*
     * A payroll without leave has no LeaveRequest
     * records to update.
     */
    if (leaveRequestIds.length === 0) {
      return {
        confirmedLeaveRequestIds: [],
        alreadyConfirmedLeaveRequestIds:
          [],
      };
    }

    if (
      assessment.assessmentStatus !==
      "Ready"
    ) {
      const error = new Error(
        "Leave payroll effects must have Ready status before they can be confirmed."
      );

      error.statusCode = 409;
      error.data = assessment;

      throw error;
    }

    const leaveRequests =
      await LeaveRequest.find({
        leaveRequestId: {
          $in: leaveRequestIds,
        },

        employeeId:
          payroll.employeeId,

        status: "Approved",
      }).session(session);

    const foundIds = new Set(
      leaveRequests.map(
        (leaveRequest) =>
          leaveRequest.leaveRequestId
      )
    );

    const missingLeaveRequestIds =
      leaveRequestIds.filter(
        (leaveRequestId) =>
          !foundIds.has(
            leaveRequestId
          )
      );

    if (
      missingLeaveRequestIds.length >
      0
    ) {
      const error = new Error(
        "One or more approved leave requests changed after payroll creation. Cancel and recreate the payroll."
      );

      error.statusCode = 409;
      error.data = {
        payrollNumber:
          payroll.payrollNumber,
        missingLeaveRequestIds,
      };

      throw error;
    }

    const userName =
      user?.fullName ||
      user?.name ||
      user?.email ||
      "System User";

    const userId = String(
      user?.userId ||
        user?._id ||
        ""
    );

    const confirmedLeaveRequestIds =
      [];

    const alreadyConfirmedLeaveRequestIds =
      [];

    for (
      const leaveRequest of
      leaveRequests
    ) {
      const existingPayrollNumber =
        normalizeString(
          leaveRequest.payrollNumber
        );

      const alreadyConfirmed =
        leaveRequest.payrollProcessed ===
          true &&
        leaveRequest.payrollProcessing
          ?.status === "Applied" &&
        existingPayrollNumber ===
          payroll.payrollNumber;

      /*
       * Repeated approval processing must not add another
       * workflow entry or change the original evidence.
       */
      if (alreadyConfirmed) {
        alreadyConfirmedLeaveRequestIds.push(
          leaveRequest.leaveRequestId
        );

        continue;
      }

      /*
       * One approved leave request must not be linked to
       * two different payroll records.
       */
      if (
        leaveRequest.payrollProcessing
          ?.status === "Applied" ||
        (
          leaveRequest.payrollProcessed ===
            true &&
          existingPayrollNumber &&
          existingPayrollNumber !==
            payroll.payrollNumber
        )
      ) {
        const error = new Error(
          `${leaveRequest.leaveRequestId} is already linked to payroll ${existingPayrollNumber || "another payroll"}.`
        );

        error.statusCode = 409;
        throw error;
      }

      const confirmedAt = new Date();

      leaveRequest.payrollProcessing = {
        status: "Applied",
        processedBy: userName,
        processedByUserId: userId,
        processedAt: confirmedAt,
        errorMessage: "",
      };

      leaveRequest.payrollProcessed =
        true;

      leaveRequest.payrollNumber =
        payroll.payrollNumber;

      leaveRequest.payrollProcessedAt =
        confirmedAt;

      leaveRequest.updatedBy =
        userName;

      const workflowAlreadyRecorded =
        (
          leaveRequest.workflowHistory ||
          []
        ).some(
          (entry) =>
            entry.action ===
              "Payroll Effect Confirmed" &&
            normalizeString(
              entry.notes
            ).includes(
              payroll.payrollNumber
            )
        );

      if (!workflowAlreadyRecorded) {
        leaveRequest.workflowHistory.push({
          action:
            "Payroll Effect Confirmed",

          fromStatus:
            leaveRequest.status,

          toStatus:
            leaveRequest.status,

          notes:
            `Payroll effect confirmed in ${payroll.payrollNumber} for ${payroll.payPeriod}.`,

          performedBy:
            userName,

          performedByUserId:
            userId,

          performedAt:
            confirmedAt,
        });
      }

      await leaveRequest.save({
        session,
      });

      confirmedLeaveRequestIds.push(
        leaveRequest.leaveRequestId
      );
    }

    return {
      confirmedLeaveRequestIds,
      alreadyConfirmedLeaveRequestIds,
    };
  };

  const reversePayrollLeaveEffects =
  async ({
    payroll,
    user,
    reversalReason,
    session,
  }) => {
    const assessment =
      payroll.leavePayrollAssessment ||
      {};

    const leaveRequestIds =
      Array.from(
        new Set(
          (
            assessment.leaveRequestIds ||
            []
          )
            .map(normalizeString)
            .filter(Boolean)
        )
      );

    if (leaveRequestIds.length === 0) {
      return {
        reversedLeaveRequestIds: [],
        alreadyReversedLeaveRequestIds:
          [],
        notAppliedLeaveRequestIds: [],
      };
    }

    const leaveRequests =
      await LeaveRequest.find({
        leaveRequestId: {
          $in: leaveRequestIds,
        },
        employeeId:
          payroll.employeeId,
        status: "Approved",
      }).session(session);

    const foundIds = new Set(
      leaveRequests.map(
        (leaveRequest) =>
          leaveRequest.leaveRequestId
      )
    );

    const missingLeaveRequestIds =
      leaveRequestIds.filter(
        (leaveRequestId) =>
          !foundIds.has(leaveRequestId)
      );

    if (
      missingLeaveRequestIds.length > 0
    ) {
      const error = new Error(
        "One or more linked leave requests could not be found in Approved status. Payroll cancellation requires controlled review."
      );

      error.statusCode = 409;
      error.data = {
        payrollNumber:
          payroll.payrollNumber,
        missingLeaveRequestIds,
      };

      throw error;
    }

    const userName =
      user?.fullName ||
      user?.name ||
      user?.email ||
      "System User";

    const userId = String(
      user?.userId || user?._id || ""
    );

    const reversedLeaveRequestIds = [];
    const alreadyReversedLeaveRequestIds =
      [];
    const notAppliedLeaveRequestIds = [];

    for (const leaveRequest of leaveRequests) {
      const linkedPayrollNumber =
        normalizeString(
          leaveRequest.payrollNumber
        );

      const alreadyReversed =
        leaveRequest.payrollProcessing
          ?.status === "Reversed" &&
        linkedPayrollNumber ===
          payroll.payrollNumber;

      if (alreadyReversed) {
        alreadyReversedLeaveRequestIds.push(
          leaveRequest.leaveRequestId
        );
        continue;
      }

      const effectWasApplied =
        leaveRequest.payrollProcessed ===
          true &&
        leaveRequest.payrollProcessing
          ?.status === "Applied";

      if (!effectWasApplied) {
        if (
          linkedPayrollNumber &&
          linkedPayrollNumber !==
            payroll.payrollNumber
        ) {
          const error = new Error(
            `${leaveRequest.leaveRequestId} is linked to payroll ${linkedPayrollNumber}, not ${payroll.payrollNumber}.`
          );

          error.statusCode = 409;
          throw error;
        }

        notAppliedLeaveRequestIds.push(
          leaveRequest.leaveRequestId
        );
        continue;
      }

      if (
        linkedPayrollNumber !==
        payroll.payrollNumber
      ) {
        const error = new Error(
          `${leaveRequest.leaveRequestId} payroll evidence does not match ${payroll.payrollNumber}.`
        );

        error.statusCode = 409;
        throw error;
      }

      const reversedAt = new Date();

      leaveRequest.payrollProcessing = {
        status: "Reversed",
        processedBy: userName,
        processedByUserId: userId,
        processedAt: reversedAt,
        errorMessage: "",
      };

      /*
       * Keep payrollNumber and payrollProcessedAt
       * as historical evidence. The active applied
       * flag is removed.
       */
      leaveRequest.payrollProcessed =
        false;
      leaveRequest.updatedBy = userName;

      const workflowAlreadyRecorded =
        (
          leaveRequest.workflowHistory ||
          []
        ).some(
          (entry) =>
            entry.action ===
              "Payroll Effect Reversed" &&
            normalizeString(
              entry.notes
            ).includes(
              payroll.payrollNumber
            )
        );

      if (!workflowAlreadyRecorded) {
        leaveRequest.workflowHistory.push({
          action:
            "Payroll Effect Reversed",
          fromStatus:
            leaveRequest.status,
          toStatus:
            leaveRequest.status,
          notes:
            `Payroll effect from ${payroll.payrollNumber} reversed because the payroll was cancelled. Reason: ${normalizeString(
              reversalReason
            )}`,
          performedBy: userName,
          performedByUserId: userId,
          performedAt: reversedAt,
        });
      }

      await leaveRequest.save({
        session,
      });

      reversedLeaveRequestIds.push(
        leaveRequest.leaveRequestId
      );
    }

    return {
      reversedLeaveRequestIds,
      alreadyReversedLeaveRequestIds,
      notAppliedLeaveRequestIds,
    };
  };

module.exports = {
  resolvePayrollLeaveAssessment,
  confirmPayrollLeaveEffects,
  reversePayrollLeaveEffects,
};