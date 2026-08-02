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

module.exports = {
  resolvePayrollLeaveAssessment,
};