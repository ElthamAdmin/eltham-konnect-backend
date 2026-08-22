const HREmployee = require(
  "../models/HREmployee"
);

const LeaveRequest = require(
  "../models/LeaveRequest"
);

const LeaveBalanceTransaction = require(
  "../models/LeaveBalanceTransaction"
);

const LeavePolicy = require(
  "../models/LeavePolicy"
);

const YMD_PATTERN =
  /^\d{4}-\d{2}-\d{2}$/;

const APPROVED_STATUSES = [
  "Approved",
  "Completed",
];

const PENDING_STATUSES = [
  "Draft",
  "Pending",
  "Submitted",
  "Manager Approved",
];

const BALANCE_TYPES = [
  "Vacation",
  "Sick",
  "Emergency",
  "Other",
];

const normalizeString = (value) =>
  String(value || "").trim();

const roundNumber = (
  value,
  decimals = 2
) =>
  Number(
    Number(value || 0).toFixed(
      decimals
    )
  );

const isValidYmdDate = (value) => {
  const text =
    normalizeString(value);

  if (!YMD_PATTERN.test(text)) {
    return false;
  }

  const date = new Date(
    `${text}T12:00:00.000Z`
  );

  return (
    !Number.isNaN(date.getTime()) &&
    date.toISOString().slice(0, 10) ===
      text
  );
};

const getJamaicaTodayYmd = () => {
  const parts =
    new Intl.DateTimeFormat(
      "en-CA",
      {
        timeZone:
          "America/Jamaica",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }
    ).formatToParts(new Date());

  const values =
    Object.fromEntries(
      parts.map((part) => [
        part.type,
        part.value,
      ])
    );

  return `${values.year}-${values.month}-${values.day}`;
};

const getDefaultStartDate = (
  endDate
) => `${endDate.slice(0, 4)}-01-01`;

const getInclusiveCalendarDays = (
  startDate,
  endDate
) => {
  const start = new Date(
    `${startDate}T12:00:00.000Z`
  );

  const end = new Date(
    `${endDate}T12:00:00.000Z`
  );

  return (
    Math.floor(
      (end.getTime() -
        start.getTime()) /
        86400000
    ) + 1
  );
};

const getOverlappingCalendarDays = ({
  requestStartDate,
  requestEndDate,
  reportStartDate,
  reportEndDate,
}) => {
  const overlapStart =
    requestStartDate >
    reportStartDate
      ? requestStartDate
      : reportStartDate;

  const overlapEnd =
    requestEndDate <
    reportEndDate
      ? requestEndDate
      : reportEndDate;

  if (overlapEnd < overlapStart) {
    return 0;
  }

  return getInclusiveCalendarDays(
    overlapStart,
    overlapEnd
  );
};

const getRequestRangeMetrics = ({
  request,
  startDate,
  endDate,
}) => {
  const breakdown =
    Array.isArray(
      request.dailyBreakdown
    )
      ? request.dailyBreakdown.filter(
          (day) =>
            day.workDate >=
              startDate &&
            day.workDate <= endDate
        )
      : [];

  if (breakdown.length > 0) {
    return {
      scheduledDays:
        breakdown.filter(
          (day) =>
            day.scheduledWorkday &&
            Number(
              day.scheduledMinutes ||
                0
            ) > 0
        ).length,

      scheduledMinutes:
        breakdown.reduce(
          (sum, day) =>
            sum +
            Number(
              day.scheduledMinutes ||
                0
            ),
          0
        ),

      payableMinutes:
        breakdown.reduce(
          (sum, day) =>
            sum +
            Number(
              day.payableMinutes ||
                0
            ),
          0
        ),

      unpaidMinutes:
        breakdown.reduce(
          (sum, day) =>
            sum +
            Number(
              day.unpaidMinutes ||
                0
            ),
          0
        ),

      legacyEstimate: false,
    };
  }

  /*
   * Legacy leave records may not contain
   * a controlled daily breakdown. Their
   * totals are proportionally allocated
   * to the overlapping report period.
   */

  const totalCalendarDays =
    getInclusiveCalendarDays(
      request.startDate,
      request.endDate
    );

  const overlappingDays =
    getOverlappingCalendarDays({
      requestStartDate:
        request.startDate,
      requestEndDate:
        request.endDate,
      reportStartDate: startDate,
      reportEndDate: endDate,
    });

  const ratio =
    totalCalendarDays > 0
      ? overlappingDays /
        totalCalendarDays
      : 0;

  return {
    scheduledDays:
      roundNumber(
        Number(
          request.totalDays || 0
        ) * ratio,
        4
      ),

    scheduledMinutes:
      Math.round(
        Number(
          request.totalScheduledMinutes ||
            0
        ) * ratio
      ),

    payableMinutes:
      Math.round(
        Number(
          request.payableLeaveMinutes ||
            0
        ) * ratio
      ),

    unpaidMinutes:
      Math.round(
        Number(
          request.unpaidLeaveMinutes ||
            0
        ) * ratio
      ),

    legacyEstimate: true,
  };
};

const createEmptyBalance = () => ({
  Vacation: 0,
  Sick: 0,
  Emergency: 0,
  Other: 0,
});

const getLeaveUtilizationReport =
  async (req, res) => {
    try {
      const today =
        getJamaicaTodayYmd();

      const startDate =
        normalizeString(
          req.query.startDate
        ) ||
        getDefaultStartDate(today);

      const endDate =
        normalizeString(
          req.query.endDate
        ) || today;

      const employeeId =
        normalizeString(
          req.query.employeeId
        );

      const department =
        normalizeString(
          req.query.department
        );

      const branch =
        normalizeString(
          req.query.branch
        );

      const leaveType =
        normalizeString(
          req.query.leaveType
        );

      const status =
        normalizeString(
          req.query.status
        );

      if (
        !isValidYmdDate(
          startDate
        ) ||
        !isValidYmdDate(endDate)
      ) {
        return res
          .status(400)
          .json({
            success: false,
            message:
              "Leave report dates must use valid YYYY-MM-DD values.",
          });
      }

      if (endDate < startDate) {
        return res
          .status(400)
          .json({
            success: false,
            message:
              "Leave report end date cannot be earlier than its start date.",
          });
      }

      const employeeQuery = {};

      if (employeeId) {
        employeeQuery.employeeId =
          employeeId;
      }

      if (department) {
        employeeQuery.department =
          department;
      }

      if (branch) {
        employeeQuery.branch =
          branch;
      }

      const employees =
        await HREmployee.find(
          employeeQuery
        )
          .sort({
            fullName: 1,
            employeeId: 1,
          })
          .lean();

      const employeeIds =
        employees.map(
          (employee) =>
            employee.employeeId
        );

      const employeeMap =
        new Map(
          employees.map(
            (employee) => [
              employee.employeeId,
              employee,
            ]
          )
        );

      if (
        employeeIds.length === 0
      ) {
        return res.json({
          success: true,
          message:
            "Leave utilization report generated successfully.",
          filters: {
            startDate,
            endDate,
            employeeId,
            department,
            branch,
            leaveType,
            status,
          },
          summary: {
            totalEmployees: 0,
            employeesWithLeave: 0,
            totalRequests: 0,
            pendingRequests: 0,
            approvedRequests: 0,
            rejectedRequests: 0,
            cancelledRequests: 0,
            approvedLeaveDays: 0,
            payableLeaveHours: 0,
            unpaidLeaveHours: 0,
            balanceUnitsUsed: 0,
            currentBalanceUnits: 0,
            utilizationRate: 0,
            documentsPending: 0,
            payrollEffectsPending: 0,
            legacyEstimatedRequests: 0,
            activePolicies: 0,
          },
          leaveTypeBreakdown: [],
          statusBreakdown: [],
          employeeRegister: [],
          dailyTrend: [],
          activePolicies: [],
        });
      }

      const requestQuery = {
        employeeId: {
          $in: employeeIds,
        },
        startDate: {
          $lte: endDate,
        },
        endDate: {
          $gte: startDate,
        },
      };

      if (leaveType) {
        requestQuery.leaveType =
          leaveType;
      }

      if (status) {
        requestQuery.status =
          status;
      }

      const [
        requests,
        transactions,
        policies,
      ] = await Promise.all([
        LeaveRequest.find(
          requestQuery
        )
          .sort({
            startDate: 1,
            createdAt: 1,
          })
          .lean(),

        LeaveBalanceTransaction.find(
          {
            employeeId: {
              $in: employeeIds,
            },
            effectiveDate: {
              $lte: endDate,
            },
            status: {
              $in: [
                "Posted",
                "Reversed",
              ],
            },
          }
        )
          .sort({
            effectiveDate: 1,
            createdAt: 1,
          })
          .lean(),

        LeavePolicy.find({
          status: "Active",
          effectiveFrom: {
            $lte: endDate,
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
                $gte: startDate,
              },
            },
          ],
        })
          .sort({
            leaveType: 1,
            effectiveFrom: -1,
          })
          .lean(),
      ]);

      const statusCounts =
        new Map();

      const typeTotals =
        new Map();

      const dailyTotals =
        new Map();

      const employeeTotals =
        new Map();

      for (const employee of employees) {
        employeeTotals.set(
          employee.employeeId,
          {
            employeeId:
              employee.employeeId,

            fullName:
              employee.fullName ||
              "",

            jobTitle:
              employee.jobTitle ||
              "",

            department:
              employee.department ||
              "",

            branch:
              employee.branch ||
              "",

            employmentStatus:
              employee.employmentStatus ||
              "",

            totalRequests: 0,
            pendingRequests: 0,
            approvedRequests: 0,
            approvedLeaveDays: 0,
            payableLeaveMinutes: 0,
            unpaidLeaveMinutes: 0,
            balanceUnitsUsed: 0,
            balanceCredits: 0,
            balanceReversals: 0,
            currentBalances:
              createEmptyBalance(),
            documentsPending: 0,
            payrollEffectsPending: 0,
            legacyEstimatedRequests: 0,
          }
        );
      }

      let approvedLeaveDays = 0;
      let payableLeaveMinutes = 0;
      let unpaidLeaveMinutes = 0;
      let documentsPending = 0;
      let payrollEffectsPending = 0;
      let legacyEstimatedRequests = 0;

      for (const request of requests) {
        const employeeSummary =
          employeeTotals.get(
            request.employeeId
          );

        if (!employeeSummary) {
          continue;
        }

        const metrics =
          getRequestRangeMetrics({
            request,
            startDate,
            endDate,
          });

        const approved =
          APPROVED_STATUSES.includes(
            request.status
          );

        const pending =
          PENDING_STATUSES.includes(
            request.status
          );

        employeeSummary.totalRequests +=
          1;

        if (approved) {
          employeeSummary.approvedRequests +=
            1;
        }

        if (pending) {
          employeeSummary.pendingRequests +=
            1;
        }

        statusCounts.set(
          request.status,
          (
            statusCounts.get(
              request.status
            ) || 0
          ) + 1
        );

        const typeKey =
          request.leaveType ||
          "Unspecified";

        if (
          !typeTotals.has(typeKey)
        ) {
          typeTotals.set(
            typeKey,
            {
              leaveType: typeKey,
              totalRequests: 0,
              pendingRequests: 0,
              approvedRequests: 0,
              approvedLeaveDays: 0,
              payableLeaveMinutes: 0,
              unpaidLeaveMinutes: 0,
            }
          );
        }

        const typeSummary =
          typeTotals.get(typeKey);

        typeSummary.totalRequests +=
          1;

        if (pending) {
          typeSummary.pendingRequests +=
            1;
        }

        if (approved) {
          typeSummary.approvedRequests +=
            1;

          typeSummary.approvedLeaveDays +=
            metrics.scheduledDays;

          typeSummary.payableLeaveMinutes +=
            metrics.payableMinutes;

          typeSummary.unpaidLeaveMinutes +=
            metrics.unpaidMinutes;

          employeeSummary.approvedLeaveDays +=
            metrics.scheduledDays;

          employeeSummary.payableLeaveMinutes +=
            metrics.payableMinutes;

          employeeSummary.unpaidLeaveMinutes +=
            metrics.unpaidMinutes;

          approvedLeaveDays +=
            metrics.scheduledDays;

          payableLeaveMinutes +=
            metrics.payableMinutes;

          unpaidLeaveMinutes +=
            metrics.unpaidMinutes;

          const breakdown =
            Array.isArray(
              request.dailyBreakdown
            )
              ? request.dailyBreakdown
              : [];

          for (const day of breakdown) {
            if (
              day.workDate <
                startDate ||
              day.workDate >
                endDate
            ) {
              continue;
            }

            if (
              !dailyTotals.has(
                day.workDate
              )
            ) {
              dailyTotals.set(
                day.workDate,
                {
                  workDate:
                    day.workDate,
                  employeesOnLeave:
                    new Set(),
                  leaveDays: 0,
                  payableMinutes: 0,
                  unpaidMinutes: 0,
                }
              );
            }

            const daily =
              dailyTotals.get(
                day.workDate
              );

            if (
              day.scheduledWorkday &&
              Number(
                day.scheduledMinutes ||
                  0
              ) > 0
            ) {
              daily.leaveDays += 1;
              daily.employeesOnLeave.add(
                request.employeeId
              );
            }

            daily.payableMinutes +=
              Number(
                day.payableMinutes ||
                  0
              );

            daily.unpaidMinutes +=
              Number(
                day.unpaidMinutes ||
                  0
              );
          }
        }

        const supportingRequired =
          Boolean(
            request.supportingDocumentsRequired ||
              request.medicalCertificateRequired
          );

        const pendingDocument =
          supportingRequired &&
          ![
            "Received",
            "Verified",
            "Not Required",
          ].includes(
            request.documentStatus
          );

        if (pendingDocument) {
          documentsPending += 1;
          employeeSummary.documentsPending +=
            1;
        }

        const payrollPending =
          approved &&
          request.payrollEffect &&
          request.payrollEffect !==
            "None" &&
          request.payrollProcessingStatus !==
            "Processed";

        if (payrollPending) {
          payrollEffectsPending +=
            1;

          employeeSummary.payrollEffectsPending +=
            1;
        }

        if (
          metrics.legacyEstimate
        ) {
          legacyEstimatedRequests +=
            1;

          employeeSummary.legacyEstimatedRequests +=
            1;
        }
      }

      for (const transaction of transactions) {
        const employeeSummary =
          employeeTotals.get(
            transaction.employeeId
          );

        if (!employeeSummary) {
          continue;
        }

        const balanceType =
          BALANCE_TYPES.includes(
            transaction.balanceType
          )
            ? transaction.balanceType
            : "Other";

        employeeSummary.currentBalances[
          balanceType
        ] = roundNumber(
          employeeSummary.currentBalances[
            balanceType
          ] +
            Number(
              transaction.units || 0
            ),
          4
        );

        const inReportPeriod =
          transaction.effectiveDate >=
            startDate &&
          transaction.effectiveDate <=
            endDate;

        if (!inReportPeriod) {
          continue;
        }

        const units =
          Number(
            transaction.units || 0
          );

        if (
          transaction.status ===
            "Posted" &&
          transaction.transactionType ===
            "Approved Leave" &&
          units < 0
        ) {
          employeeSummary.balanceUnitsUsed +=
            Math.abs(units);
        }

        if (
          transaction.status ===
            "Posted" &&
          units > 0 &&
          transaction.transactionType !==
            "Reversal"
        ) {
          employeeSummary.balanceCredits +=
            units;
        }

        if (
          transaction.status ===
            "Posted" &&
          transaction.transactionType ===
            "Reversal" &&
          units > 0
        ) {
          employeeSummary.balanceReversals +=
            units;
        }
      }

      const employeeRegister =
        [...employeeTotals.values()]
          .map((employee) => ({
            ...employee,

            approvedLeaveDays:
              roundNumber(
                employee.approvedLeaveDays
              ),

            payableLeaveHours:
              roundNumber(
                employee.payableLeaveMinutes /
                  60
              ),

            unpaidLeaveHours:
              roundNumber(
                employee.unpaidLeaveMinutes /
                  60
              ),

            balanceUnitsUsed:
              roundNumber(
                employee.balanceUnitsUsed,
                4
              ),

            balanceCredits:
              roundNumber(
                employee.balanceCredits,
                4
              ),

            balanceReversals:
              roundNumber(
                employee.balanceReversals,
                4
              ),

            totalCurrentBalance:
              roundNumber(
                Object.values(
                  employee.currentBalances
                ).reduce(
                  (sum, value) =>
                    sum +
                    Number(value || 0),
                  0
                ),
                4
              ),
          }))
          .sort(
            (left, right) =>
              right.approvedLeaveDays -
                left.approvedLeaveDays ||
              left.fullName.localeCompare(
                right.fullName
              )
          );

      const totalBalanceUsed =
        employeeRegister.reduce(
          (sum, employee) =>
            sum +
            employee.balanceUnitsUsed,
          0
        );

      const totalCurrentBalance =
        employeeRegister.reduce(
          (sum, employee) =>
            sum +
            employee.totalCurrentBalance,
          0
        );

      const utilizationDenominator =
        totalBalanceUsed +
        totalCurrentBalance;

      const utilizationRate =
        utilizationDenominator > 0
          ? roundNumber(
              (
                totalBalanceUsed /
                utilizationDenominator
              ) * 100
            )
          : 0;

      const leaveTypeBreakdown =
        [...typeTotals.values()]
          .map((item) => ({
            ...item,

            approvedLeaveDays:
              roundNumber(
                item.approvedLeaveDays
              ),

            payableLeaveHours:
              roundNumber(
                item.payableLeaveMinutes /
                  60
              ),

            unpaidLeaveHours:
              roundNumber(
                item.unpaidLeaveMinutes /
                  60
              ),
          }))
          .sort(
            (left, right) =>
              right.approvedLeaveDays -
                left.approvedLeaveDays ||
              left.leaveType.localeCompare(
                right.leaveType
              )
          );

      const statusBreakdown =
        [...statusCounts.entries()]
          .map(
            ([
              requestStatus,
              count,
            ]) => ({
              status: requestStatus,
              count,
              percentage:
                requests.length > 0
                  ? roundNumber(
                      (
                        count /
                        requests.length
                      ) * 100
                    )
                  : 0,
            })
          )
          .sort(
            (left, right) =>
              right.count -
              left.count
          );

      const dailyTrend =
        [...dailyTotals.values()]
          .map((day) => ({
            workDate:
              day.workDate,

            employeesOnLeave:
              day.employeesOnLeave
                .size,

            leaveDays:
              roundNumber(
                day.leaveDays
              ),

            payableLeaveHours:
              roundNumber(
                day.payableMinutes /
                  60
              ),

            unpaidLeaveHours:
              roundNumber(
                day.unpaidMinutes /
                  60
              ),
          }))
          .sort(
            (left, right) =>
              left.workDate.localeCompare(
                right.workDate
              )
          );

      const activePolicies =
        policies.map((policy) => ({
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

          balanceTracked:
            Boolean(
              policy.balanceTracked
            ),

          balanceType:
            policy.balanceType ||
            "",

          effectiveFrom:
            policy.effectiveFrom,

          effectiveTo:
            policy.effectiveTo ||
            "",
        }));

      return res.json({
        success: true,

        message:
          "Leave utilization report generated successfully.",

        filters: {
          startDate,
          endDate,
          employeeId,
          department,
          branch,
          leaveType,
          status,
        },

        summary: {
          totalEmployees:
            employees.length,

          employeesWithLeave:
            employeeRegister.filter(
              (employee) =>
                employee.totalRequests >
                0
            ).length,

          totalRequests:
            requests.length,

          pendingRequests:
            requests.filter(
              (request) =>
                PENDING_STATUSES.includes(
                  request.status
                )
            ).length,

          approvedRequests:
            requests.filter(
              (request) =>
                APPROVED_STATUSES.includes(
                  request.status
                )
            ).length,

          rejectedRequests:
            requests.filter(
              (request) =>
                request.status ===
                "Rejected"
            ).length,

          cancelledRequests:
            requests.filter(
              (request) =>
                request.status ===
                "Cancelled"
            ).length,

          approvedLeaveDays:
            roundNumber(
              approvedLeaveDays
            ),

          payableLeaveHours:
            roundNumber(
              payableLeaveMinutes /
                60
            ),

          unpaidLeaveHours:
            roundNumber(
              unpaidLeaveMinutes /
                60
            ),

          balanceUnitsUsed:
            roundNumber(
              totalBalanceUsed,
              4
            ),

          currentBalanceUnits:
            roundNumber(
              totalCurrentBalance,
              4
            ),

          utilizationRate,
          documentsPending,
          payrollEffectsPending,
          legacyEstimatedRequests,

          activePolicies:
            activePolicies.length,
        },

        leaveTypeBreakdown,
        statusBreakdown,
        employeeRegister,
        dailyTrend,
        activePolicies,
      });
    } catch (error) {
      console.error(
        "Leave utilization report error:",
        error
      );

      return res
        .status(500)
        .json({
          success: false,
          message:
            "Failed to generate the leave utilization report.",
          error: error.message,
        });
    }
  };

module.exports = {
  getLeaveUtilizationReport,
};