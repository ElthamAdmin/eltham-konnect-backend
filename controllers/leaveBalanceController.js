const HREmployee = require("../models/HREmployee");
const LeaveBalanceTransaction = require(
  "../models/LeaveBalanceTransaction"
);

const {
  getEmployeeLeaveBalances,
  postLeaveBalanceTransaction,
} = require("../services/leaveManagementService");

const {
  writeAuditLog,
} = require("../utils/auditLogger");

const YMD_PATTERN =
  /^\d{4}-\d{2}-\d{2}$/;

const LEGACY_BALANCE_FIELDS = [
  {
    balanceType: "Vacation",
    employeeField:
      "leaveBalanceVacation",
  },
  {
    balanceType: "Sick",
    employeeField:
      "leaveBalanceSick",
  },
];

const normalizeString = (value) =>
  String(value || "").trim();

const isValidYmdDate = (value) => {
  const text = normalizeString(value);

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
    new Intl.DateTimeFormat("en-CA", {
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

const getMigrationEmployees =
  async (employeeIds = []) => {
    const normalizedIds = Array.isArray(
      employeeIds
    )
      ? employeeIds
          .map(normalizeString)
          .filter(Boolean)
      : [];

    const query = normalizedIds.length
      ? {
          employeeId: {
            $in: normalizedIds,
          },
        }
      : {};

    return HREmployee.find(query).sort({
      employeeId: 1,
    });
  };

const buildMigrationPreview = async ({
  employeeIds = [],
  effectiveDate,
}) => {
  const employees =
    await getMigrationEmployees(
      employeeIds
    );

  const rows = [];

  for (const employee of employees) {
    const balanceResult =
      await getEmployeeLeaveBalances({
        employeeId:
          employee.employeeId,
        asOfDate: effectiveDate,
      });

    for (
      const mapping of
      LEGACY_BALANCE_FIELDS
    ) {
      const legacyUnits = Number(
        employee[
          mapping.employeeField
        ] || 0
      );

      const ledgerUnits = Number(
        balanceResult.balances[
          mapping.balanceType
        ] || 0
      );

      const existingOpening =
        await LeaveBalanceTransaction.findOne(
          {
            employeeId:
              employee.employeeId,
            balanceType:
              mapping.balanceType,
            transactionType:
              "Opening Balance",
            sourceType:
              "Employee Master Migration",
            status: {
              $in: [
                "Posted",
                "Reversed",
              ],
            },
          }
        )
          .sort({
            createdAt: -1,
          })
          .lean();

      let migrationStatus =
        "Ready";
      let issue = "";

      if (existingOpening) {
        migrationStatus =
          existingOpening.status ===
          "Posted"
            ? "Already Migrated"
            : "Requires Review";

        issue =
          existingOpening.status ===
          "Posted"
            ? "A posted opening balance already exists."
            : "The prior opening balance was reversed and requires HR review.";
      } else if (ledgerUnits !== 0) {
        migrationStatus =
          "Requires Review";
        issue =
          "The controlled ledger already contains a non-zero balance without an opening migration transaction.";
      } else if (legacyUnits <= 0) {
        migrationStatus =
          "Nothing to Migrate";
        issue =
          "The employee master balance is zero.";
      }

      rows.push({
        employeeId:
          employee.employeeId,
        employeeName:
          employee.fullName,
        employmentStatus:
          employee.employmentStatus,
        balanceType:
          mapping.balanceType,
        employeeField:
          mapping.employeeField,
        legacyUnits,
        currentLedgerUnits:
          ledgerUnits,
        effectiveDate,
        migrationStatus,
        issue,
        existingTransactionNumber:
          existingOpening
            ?.transactionNumber || "",
      });
    }
  }

  return rows;
};

const previewLegacyLeaveBalanceMigration =
  async (req, res) => {
    try {
      const effectiveDate =
        normalizeString(
          req.query.effectiveDate
        ) || getJamaicaTodayYmd();

      if (
        !isValidYmdDate(
          effectiveDate
        )
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Migration effective date must use YYYY-MM-DD.",
        });
      }

      const employeeIds =
        normalizeString(
          req.query.employeeIds
        )
          ? normalizeString(
              req.query.employeeIds
            )
              .split(",")
              .map(normalizeString)
              .filter(Boolean)
          : [];

      const rows =
        await buildMigrationPreview({
          employeeIds,
          effectiveDate,
        });

      return res.json({
        success: true,
        message:
          "Legacy leave-balance migration preview generated successfully. No balances were changed.",
        summary: {
          employeeCount:
            new Set(
              rows.map(
                (row) =>
                  row.employeeId
              )
            ).size,
          readyCount: rows.filter(
            (row) =>
              row.migrationStatus ===
              "Ready"
          ).length,
          alreadyMigratedCount:
            rows.filter(
              (row) =>
                row.migrationStatus ===
                "Already Migrated"
            ).length,
          requiresReviewCount:
            rows.filter(
              (row) =>
                row.migrationStatus ===
                "Requires Review"
            ).length,
          nothingToMigrateCount:
            rows.filter(
              (row) =>
                row.migrationStatus ===
                "Nothing to Migrate"
            ).length,
          recordsCreated: 0,
        },
        data: rows,
      });
    } catch (error) {
      console.error(
        "Preview legacy leave balances error:",
        error
      );

      return res.status(400).json({
        success: false,
        message:
          error.message ||
          "Could not preview legacy leave-balance migration.",
      });
    }
  };

const migrateLegacyLeaveBalances =
  async (req, res) => {
    try {
      const effectiveDate =
        normalizeString(
          req.body.effectiveDate
        );

      const employeeIds =
        Array.isArray(
          req.body.employeeIds
        )
          ? req.body.employeeIds
              .map(normalizeString)
              .filter(Boolean)
          : [];

      if (
        !isValidYmdDate(
          effectiveDate
        )
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Migration effective date is required and must use YYYY-MM-DD.",
        });
      }

      if (!employeeIds.length) {
        return res.status(400).json({
          success: false,
          message:
            "At least one employee ID must be explicitly selected for migration.",
        });
      }

      const previewRows =
        await buildMigrationPreview({
          employeeIds,
          effectiveDate,
        });

      const reviewRows =
        previewRows.filter(
          (row) =>
            row.migrationStatus ===
            "Requires Review"
        );

      if (reviewRows.length) {
        return res.status(409).json({
          success: false,
          message:
            "Migration is blocked because one or more selected balances require review.",
          data: reviewRows,
        });
      }

      const readyRows =
        previewRows.filter(
          (row) =>
            row.migrationStatus ===
            "Ready"
        );

      const employees =
        await getMigrationEmployees(
          employeeIds
        );

      const employeeMap = new Map(
        employees.map((employee) => [
          employee.employeeId,
          employee,
        ])
      );

      const transactions = [];

      for (const row of readyRows) {
        const employee =
          employeeMap.get(
            row.employeeId
          );

        if (!employee) {
          continue;
        }

        const transaction =
          await postLeaveBalanceTransaction({
            employee,
            balanceType:
              row.balanceType,
            transactionType:
              "Opening Balance",
            units: row.legacyUnits,
            effectiveDate,
            sourceType:
              "Employee Master Migration",
            sourceReference:
              row.employeeField,
            reason:
              "Opening controlled leave balance migrated from the employee master.",
            notes:
              `Preserves the legacy ${row.balanceType} balance of ${row.legacyUnits} days without changing the employee master snapshot.`,
            user: req.user,
          });

        transactions.push(
          transaction
        );
      }

      await writeAuditLog({
        req,
        action:
          "MIGRATE_LEAVE_OPENING_BALANCES",
        module: "HR",
        description:
          `${transactions.length} controlled leave opening-balance transaction(s) posted.`,
        targetType:
          "LeaveBalanceTransaction",
        targetId:
          transactions
            .map(
              (transaction) =>
                transaction
                  .transactionNumber
            )
            .join(","),
        afterValues:
          transactions.map(
            (transaction) =>
              transaction.toObject()
          ),
        metadata: {
          effectiveDate,
          employeeIds,
        },
      });

      return res.status(201).json({
        success: true,
        message:
          "Legacy leave opening balances migrated successfully",
        summary: {
          selectedEmployees:
            employeeIds.length,
          recordsCreated:
            transactions.length,
          skippedRecords:
            previewRows.length -
            transactions.length,
        },
        data: transactions,
      });
    } catch (error) {
      console.error(
        "Migrate legacy leave balances error:",
        error
      );

      return res.status(400).json({
        success: false,
        message:
          error.message ||
          "Could not migrate legacy leave balances.",
      });
    }
  };

const getEmployeeLeaveBalanceLedger =
  async (req, res) => {
    try {
      const employeeId =
        normalizeString(
          req.params.employeeId
        );

      const asOfDate =
        normalizeString(
          req.query.asOfDate
        ) || getJamaicaTodayYmd();

      const result =
        await getEmployeeLeaveBalances({
          employeeId,
          asOfDate,
        });

      return res.json({
        success: true,
        message:
          "Employee leave balances retrieved successfully",
        data: result,
      });
    } catch (error) {
      console.error(
        "Get leave balance ledger error:",
        error
      );

      return res.status(400).json({
        success: false,
        message:
          error.message ||
          "Could not retrieve employee leave balances.",
      });
    }
  };

module.exports = {
  previewLegacyLeaveBalanceMigration,
  migrateLegacyLeaveBalances,
  getEmployeeLeaveBalanceLedger,
};