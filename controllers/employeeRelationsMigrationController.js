const HREmployee = require(
  "../models/HREmployee"
);

const EmployeeRelationsCase = require(
  "../models/EmployeeRelationsCase"
);

const normalizeString = (value) =>
  String(value || "").trim();

const normalizeLegacyId = (
  record,
  index
) =>
  normalizeString(
    record?.recordId ||
      record?._id
  ) ||
  `INDEX-${index}`;

const createProposedCaseNumber = (
  employeeId,
  legacyId
) =>
  `ERC-LEGACY-${employeeId}-${legacyId}`
    .replace(
      /[^A-Z0-9-]/gi,
      "-"
    )
    .toUpperCase();

const mapDisciplineCategory = (
  disciplineType
) => {
  const normalized =
    normalizeString(
      disciplineType
    ).toLowerCase();

  if (
    normalized.includes(
      "attendance"
    )
  ) {
    return "Attendance";
  }

  if (
    normalized.includes(
      "performance"
    )
  ) {
    return "Performance";
  }

  if (
    normalized.includes(
      "safety"
    )
  ) {
    return "Safety";
  }

  if (
    normalized.includes(
      "property"
    )
  ) {
    return "Property";
  }

  if (
    normalized.includes(
      "confidential"
    )
  ) {
    return "Confidentiality";
  }

  if (
    normalized.includes(
      "insubordination"
    )
  ) {
    return "Insubordination";
  }

  if (
    normalized.includes(
      "policy"
    )
  ) {
    return "Policy Breach";
  }

  if (
    normalized === "other"
  ) {
    return "Other";
  }

  return "Conduct";
};

const previewLegacyDisciplineMigration =
  async (req, res) => {
    try {
      const employees =
        await HREmployee
          .find()
          .select(
            [
              "employeeId",
              "fullName",
              "jobTitle",
              "department",
              "branch",
              "employmentStatus",
              "linkedUserId",
              "disciplineRecords",
            ].join(" ")
          )
          .sort({
            employeeId: 1,
          });

      const existingCases =
        await EmployeeRelationsCase
          .find({
            "legacyReference.employeeId":
              {
                $ne: "",
              },
          })
          .select(
            [
              "caseNumber",
              "status",
              "legacyReference.employeeId",
              "legacyReference.disciplineRecordId",
            ].join(" ")
          );

      const existingByReference =
        new Map(
          existingCases.map(
            (record) => [
              `${
                record
                  .legacyReference
                  ?.employeeId
              }::${
                record
                  .legacyReference
                  ?.disciplineRecordId
              }`,
              record,
            ]
          )
        );

      const data = [];
      let employeesWithRecords = 0;

      for (
        const employee
        of employees
      ) {
        const records =
          Array.isArray(
            employee
              .disciplineRecords
          )
            ? employee
                .disciplineRecords
            : [];

        if (
          records.length > 0
        ) {
          employeesWithRecords +=
            1;
        }

        records.forEach(
          (record, index) => {
            const legacyRecordId =
              normalizeLegacyId(
                record,
                index
              );

            const referenceKey =
              `${employee.employeeId}::${legacyRecordId}`;

            const existing =
              existingByReference.get(
                referenceKey
              );

            const missingFields =
              [];

            if (
              !normalizeString(
                record
                  .disciplineType
              )
            ) {
              missingFields.push(
                "disciplineType"
              );
            }

            if (
              !normalizeString(
                record.subject
              )
            ) {
              missingFields.push(
                "subject"
              );
            }

            if (
              !normalizeString(
                record.details
              )
            ) {
              missingFields.push(
                "details"
              );
            }

            let migrationStatus =
              "Ready";

            let issue = "";

            if (existing) {
              migrationStatus =
                "Already Migrated";

              issue =
                "A controlled case already exists for this legacy record.";
            } else if (
              missingFields.length >
              0
            ) {
              migrationStatus =
                "Requires Review";

              issue =
                `Missing required legacy field(s): ${missingFields.join(
                  ", "
                )}.`;
            }

            data.push({
              employeeId:
                employee
                  .employeeId,

              employeeName:
                employee.fullName,

              employmentStatus:
                employee
                  .employmentStatus,

              linkedUserId:
                employee
                  .linkedUserId ||
                "",

              legacyRecordId,

              legacyArrayIndex:
                index,

              disciplineType:
                record
                  .disciplineType ||
                "",

              subject:
                record.subject ||
                "",

              details:
                record.details ||
                "",

              actionTaken:
                record
                  .actionTaken ||
                "",

              incidentDate:
                record
                  .incidentDate ||
                "",

              issuedDate:
                record
                  .issuedDate ||
                "",

              issuedBy:
                record.issuedBy ||
                "",

              legacyEmployeeAcknowledged:
                Boolean(
                  record
                    .employeeAcknowledged
                ),

              proposedCaseNumber:
                createProposedCaseNumber(
                  employee
                    .employeeId,
                  legacyRecordId
                ),

              proposedCaseType:
                "Discipline",

              proposedCategory:
                mapDisciplineCategory(
                  record
                    .disciplineType
                ),

              proposedStatus:
                "Closed",

              proposedAcknowledgementStatus:
                record
                  .employeeAcknowledged
                  ? "Requires Authenticated Employee Reconfirmation"
                  : "Not Acknowledged",

              migrationStatus,
              issue,

              existingCaseNumber:
                existing
                  ?.caseNumber ||
                "",

              existingCaseStatus:
                existing
                  ?.status ||
                "",
            });
          }
        );
      }

      const summary = {
        employeeCount:
          employees.length,

        employeesWithRecords,

        legacyRecordCount:
          data.length,

        readyCount:
          data.filter(
            (item) =>
              item
                .migrationStatus ===
              "Ready"
          ).length,

        alreadyMigratedCount:
          data.filter(
            (item) =>
              item
                .migrationStatus ===
              "Already Migrated"
          ).length,

        requiresReviewCount:
          data.filter(
            (item) =>
              item
                .migrationStatus ===
              "Requires Review"
          ).length,

        legacyAcknowledgementReconfirmationCount:
          data.filter(
            (item) =>
              item
                .legacyEmployeeAcknowledged
          ).length,

        recordsCreated: 0,
      };

      return res.json({
        success: true,

        message:
          "Legacy discipline-case migration preview generated successfully. No cases or employee records were changed.",

        summary,
        data,
      });
    } catch (error) {
      console.error(
        "Legacy discipline migration preview error:",
        error
      );

      return res
        .status(500)
        .json({
          success: false,

          message:
            "Failed to generate the legacy discipline-case migration preview.",

          error:
            error.message,
        });
    }
  };

module.exports = {
  previewLegacyDisciplineMigration,
};