const HREmployee = require("../models/HREmployee");
const PerformanceReview = require(
  "../models/PerformanceReview"
);

const YMD_PATTERN =
  /^\d{4}-\d{2}-\d{2}$/;

const normalizeString = (value) =>
  String(value || "").trim();

const normalizeUpper = (value) =>
  normalizeString(value).toUpperCase();

const isValidYmdDate = (value) => {
  const text =
    normalizeString(value);

  if (!YMD_PATTERN.test(text)) {
    return false;
  }

  const date =
    new Date(
      `${text}T12:00:00.000Z`
    );

  return (
    !Number.isNaN(
      date.getTime()
    ) &&
    date
      .toISOString()
      .slice(0, 10) === text
  );
};

const getLastDayOfMonth = (
  year,
  month
) => {
  const date =
    new Date(
      Date.UTC(
        Number(year),
        Number(month),
        0,
        12,
        0,
        0
      )
    );

  return date
    .toISOString()
    .slice(0, 10);
};

const sanitizeReferenceSegment = (
  value
) =>
  normalizeUpper(value)
    .replace(
      /[^A-Z0-9_-]/g,
      "-"
    )
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "") ||
  "UNKNOWN";

const buildLegacySourceReference = ({
  employeeId,
  legacyReviewId,
  legacyArrayIndex,
}) =>
  [
    normalizeString(
      employeeId
    ),
    normalizeString(
      legacyReviewId
    ) ||
      `INDEX-${legacyArrayIndex}`,
  ].join(":");

const buildProposedReviewNumber = ({
  employeeId,
  legacyReviewId,
  legacyArrayIndex,
}) =>
  [
    "PREV",
    "LEGACY",
    sanitizeReferenceSegment(
      employeeId
    ),
    sanitizeReferenceSegment(
      legacyReviewId ||
        `INDEX-${legacyArrayIndex}`
    ),
  ].join("-");

const mapLegacyRating = (
  rating
) => {
  const normalizedRating =
    normalizeString(rating);

  const mapping = {
    Excellent: {
      rating: "Excellent",
      score: 5,
    },

    "Very Good": {
      rating: "Very Good",
      score: 4,
    },

    Good: {
      rating: "Good",
      score: 3,
    },

    "Needs Improvement": {
      rating:
        "Needs Improvement",
      score: 2,
    },

    Unsatisfactory: {
      rating:
        "Unsatisfactory",
      score: 1,
    },
  };

  return (
    mapping[normalizedRating] || {
      rating: "Not Rated",
      score: null,
    }
  );
};

const resolveLegacyPeriod = ({
  reviewPeriod,
  reviewDate,
}) => {
  const normalizedPeriod =
    normalizeString(
      reviewPeriod
    );

  const normalizedReviewDate =
    normalizeString(
      reviewDate
    );

  const exactRangeMatch =
    normalizedPeriod.match(
      /^(\d{4}-\d{2}-\d{2})\s+(?:to|-)\s+(\d{4}-\d{2}-\d{2})$/i
    );

  if (exactRangeMatch) {
    const periodStartDate =
      exactRangeMatch[1];

    const periodEndDate =
      exactRangeMatch[2];

    if (
      isValidYmdDate(
        periodStartDate
      ) &&
      isValidYmdDate(
        periodEndDate
      ) &&
      periodEndDate >=
        periodStartDate
    ) {
      return {
        resolved: true,
        cycleCode:
          `LEGACY-${periodStartDate}-${periodEndDate}`,
        cycleName:
          normalizedPeriod,
        periodStartDate,
        periodEndDate,
        issue: "",
      };
    }
  }

  const yearMatch =
    normalizedPeriod.match(
      /^(\d{4})$/
    );

  if (yearMatch) {
    const year =
      yearMatch[1];

    return {
      resolved: true,
      cycleCode:
        `LEGACY-ANNUAL-${year}`,
      cycleName:
        `${year} Annual Review`,
      periodStartDate:
        `${year}-01-01`,
      periodEndDate:
        `${year}-12-31`,
      issue: "",
    };
  }

  const monthMatch =
    normalizedPeriod.match(
      /^(\d{4})-(\d{2})$/
    );

  if (monthMatch) {
    const year =
      monthMatch[1];

    const month =
      monthMatch[2];

    const periodStartDate =
      `${year}-${month}-01`;

    const periodEndDate =
      getLastDayOfMonth(
        year,
        month
      );

    if (
      isValidYmdDate(
        periodStartDate
      ) &&
      isValidYmdDate(
        periodEndDate
      )
    ) {
      return {
        resolved: true,
        cycleCode:
          `LEGACY-MONTH-${year}-${month}`,
        cycleName:
          normalizedPeriod,
        periodStartDate,
        periodEndDate,
        issue: "",
      };
    }
  }

  return {
    resolved: false,
    cycleCode: "",
    cycleName:
      normalizedPeriod,
    periodStartDate: "",
    periodEndDate: "",
    issue:
      normalizedPeriod
        ? "The legacy review period cannot be converted safely into controlled start and end dates."
        : "The legacy review does not contain a review period.",
    reviewDateValid:
      isValidYmdDate(
        normalizedReviewDate
      ),
  };
};

const buildLegacyReviewPreview = ({
  employee,
  review,
  legacyArrayIndex,
  existingRecord,
}) => {
  const reviewObject =
    typeof review?.toObject ===
    "function"
      ? review.toObject()
      : review || {};

  const legacyReviewId =
    normalizeString(
      reviewObject.reviewId ||
        reviewObject._id
    );

  const sourceReference =
    buildLegacySourceReference({
      employeeId:
        employee.employeeId,

      legacyReviewId,
      legacyArrayIndex,
    });

  const proposedReviewNumber =
    buildProposedReviewNumber({
      employeeId:
        employee.employeeId,

      legacyReviewId,
      legacyArrayIndex,
    });

  const period =
    resolveLegacyPeriod({
      reviewPeriod:
        reviewObject.reviewPeriod,

      reviewDate:
        reviewObject.reviewDate,
    });

  const rating =
    mapLegacyRating(
      reviewObject.rating
    );

  const reviewDate =
    normalizeString(
      reviewObject.reviewDate
    );

  const issues = [];

  if (!period.resolved) {
    issues.push(period.issue);
  }

  if (
    reviewDate &&
    !isValidYmdDate(
      reviewDate
    )
  ) {
    issues.push(
      "The legacy review date is not a valid YYYY-MM-DD date."
    );
  }

  if (
    rating.rating ===
    "Not Rated"
  ) {
    issues.push(
      "The legacy rating cannot be mapped to the controlled H8 rating scale."
    );
  }

  if (
    !normalizeString(
      reviewObject.reviewedBy
    )
  ) {
    issues.push(
      "The legacy review does not identify its reviewer."
    );
  }

  let migrationStatus =
    "Ready";

  if (existingRecord) {
    migrationStatus =
      "Already Migrated";
  } else if (
    issues.length > 0
  ) {
    migrationStatus =
      "Requires Review";
  }

  const legacyAcknowledged =
    Boolean(
      reviewObject
        .employeeAcknowledged
    );

  return {
    employeeId:
      employee.employeeId,

    employeeName:
      employee.fullName,

    employmentStatus:
      employee.employmentStatus,

    linkedUserId:
      employee.linkedUserId || "",

    legacyReviewId,
    legacyArrayIndex,

    reviewPeriod:
      normalizeString(
        reviewObject.reviewPeriod
      ),

    reviewDate,

    legacyRating:
      normalizeString(
        reviewObject.rating
      ),

    proposedFinalRating:
      rating.rating,

    proposedFinalScore:
      rating.score,

    reviewedBy:
      normalizeString(
        reviewObject.reviewedBy
      ),

    legacyAcknowledged,

    legacyAcknowledgedAt:
      reviewObject
        .employeeAcknowledgedAt ||
      null,

    acknowledgementReconfirmationRequired:
      legacyAcknowledged,

    proposedReviewNumber,
    proposedCycleCode:
      period.cycleCode,

    proposedCycleName:
      period.cycleName,

    proposedPeriodStartDate:
      period.periodStartDate,

    proposedPeriodEndDate:
      period.periodEndDate,

    sourceReference,

    migrationStatus,

    issue:
      existingRecord
        ? "A controlled performance review already exists for this legacy review."
        : issues.join(" "),

    existingReviewNumber:
      existingRecord
        ?.reviewNumber || "",

    existingReviewStatus:
      existingRecord
        ?.status || "",
  };
};

const previewLegacyPerformanceReviewMigration =
  async (req, res) => {
    try {
      const employees =
        await HREmployee.find({
          "performanceReviews.0": {
            $exists: true,
          },
        })
          .select(
            [
              "employeeId",
              "fullName",
              "jobTitle",
              "department",
              "branch",
              "employmentStatus",
              "linkedUserId",
              "reportsToEmployeeId",
              "reportsToName",
              "performanceReviews",
            ].join(" ")
          )
          .sort({
            employeeId: 1,
          });

      const sourceReferences = [];

      for (
        const employee of
        employees
      ) {
        const reviews =
          Array.from(
            employee.performanceReviews ||
              []
          );

        reviews.forEach(
          (
            review,
            legacyArrayIndex
          ) => {
            const reviewObject =
              typeof review?.toObject ===
              "function"
                ? review.toObject()
                : review || {};

            sourceReferences.push(
              buildLegacySourceReference({
                employeeId:
                  employee.employeeId,

                legacyReviewId:
                  normalizeString(
                    reviewObject.reviewId ||
                      reviewObject._id
                  ),

                legacyArrayIndex,
              })
            );
          }
        );
      }

      const existingRecords =
        sourceReferences.length > 0
          ? await PerformanceReview.find({
              sourceType:
                "Legacy Employee Record",

              sourceReference: {
                $in:
                  sourceReferences,
              },
            }).select(
              [
                "reviewNumber",
                "sourceReference",
                "status",
              ].join(" ")
            )
          : [];

      const existingByReference =
        new Map(
          existingRecords.map(
            (record) => [
              record.sourceReference,
              record,
            ]
          )
        );

      const data = [];

      for (
        const employee of
        employees
      ) {
        const reviews =
          Array.from(
            employee.performanceReviews ||
              []
          );

        reviews.forEach(
          (
            review,
            legacyArrayIndex
          ) => {
            const reviewObject =
              typeof review?.toObject ===
              "function"
                ? review.toObject()
                : review || {};

            const legacyReviewId =
              normalizeString(
                reviewObject.reviewId ||
                  reviewObject._id
              );

            const sourceReference =
              buildLegacySourceReference({
                employeeId:
                  employee.employeeId,

                legacyReviewId,
                legacyArrayIndex,
              });

            data.push(
              buildLegacyReviewPreview({
                employee,
                review,
                legacyArrayIndex,
                existingRecord:
                  existingByReference.get(
                    sourceReference
                  ) || null,
              })
            );
          }
        );
      }

      const readyCount =
        data.filter(
          (item) =>
            item.migrationStatus ===
            "Ready"
        ).length;

      const alreadyMigratedCount =
        data.filter(
          (item) =>
            item.migrationStatus ===
            "Already Migrated"
        ).length;

      const requiresReviewCount =
        data.filter(
          (item) =>
            item.migrationStatus ===
            "Requires Review"
        ).length;

      const legacyAcknowledgementReconfirmationCount =
        data.filter(
          (item) =>
            item
              .acknowledgementReconfirmationRequired
        ).length;

      return res.json({
        success: true,

        message:
          "Legacy performance-review migration preview generated successfully. No reviews or employee records were changed.",

        summary: {
          employeeCount:
            employees.length,

          employeesWithReviews:
            employees.length,

          legacyReviewCount:
            data.length,

          readyCount,

          alreadyMigratedCount,

          requiresReviewCount,

          legacyAcknowledgementReconfirmationCount,

          recordsCreated: 0,
        },

        data,
      });
    } catch (error) {
      console.error(
        "Legacy performance-review migration preview error:",
        error
      );

      return res
        .status(500)
        .json({
          success: false,

          message:
            "Failed to generate the legacy performance-review migration preview.",

          error:
            error.message,
        });
    }
  };

module.exports = {
  previewLegacyPerformanceReviewMigration,
};