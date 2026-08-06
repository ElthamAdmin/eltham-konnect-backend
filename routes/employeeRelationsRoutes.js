const express = require("express");
const multer = require("multer");

const router = express.Router();

const {
  getEmployeeRelationsCases,
  getMyEmployeeRelationsCases,
  getEmployeeRelationsCaseByNumber,
  createDisciplineCaseDraft,
  submitGrievanceCase,
} = require(
  "../controllers/employeeRelationsController"
);

const {
  previewLegacyDisciplineMigration,
} = require(
  "../controllers/employeeRelationsMigrationController"
);

const {
  submitDisciplineCase,
  startCaseInvestigation,
  scheduleCaseHearing,
  completeCaseHearing,
} = require(
  "../controllers/employeeRelationsWorkflowController"
);

const {
  issueCaseDecision,
  acknowledgeCaseDecision,
} = require(
  "../controllers/employeeRelationsDecisionController"
);

const {
  submitCaseAppeal,
  decideCaseAppeal,
  withdrawGrievanceCase,
  closeEmployeeRelationsCase,
} = require(
  "../controllers/employeeRelationsAppealController"
);

const {
  uploadCaseEvidence,
  downloadCaseEvidence,
  reviewCaseEvidence,
} = require(
  "../controllers/employeeRelationsEvidenceController"
);

const {
  protect,
  requirePermission,
  requireAnyPermission,
} = require(
  "../middleware/authMiddleware"
);

const canUseEmployeeRelationsSelfService =
  requireAnyPermission([
    "hr",
    "hrSelfService",
  ]);

const ALLOWED_EVIDENCE_MIME_TYPES =
  new Set([
    "application/pdf",

    "image/jpeg",
    "image/png",
    "image/webp",

    "text/plain",
    "text/csv",

    "message/rfc822",

    "application/msword",

    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",

    "application/vnd.ms-excel",

    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ]);

const evidenceUpload =
  multer({
    storage:
      multer.memoryStorage(),

    limits: {
      files: 1,

      fileSize:
        10 * 1024 * 1024,
    },

    fileFilter: (
      req,
      file,
      callback
    ) => {
      if (
        !ALLOWED_EVIDENCE_MIME_TYPES
          .has(file.mimetype)
      ) {
        callback(
          new Error(
            "Only PDF, JPG, PNG, WEBP, TXT, CSV, EML, DOC, DOCX, XLS and XLSX evidence files are allowed."
          )
        );

        return;
      }

      callback(
        null,
        true
      );
    },
  });

const uploadEvidenceFile = (
  req,
  res,
  next
) => {
  evidenceUpload.single("file")(
    req,
    res,
    (error) => {
      if (!error) {
        next();
        return;
      }

      if (
        error instanceof
          multer.MulterError &&
        error.code ===
          "LIMIT_FILE_SIZE"
      ) {
        return res
          .status(413)
          .json({
            success: false,
            message:
              "The employee-relations evidence file cannot exceed 10 MB.",
          });
      }

      if (
        error instanceof
        multer.MulterError
      ) {
        return res
          .status(400)
          .json({
            success: false,
            message:
              `Evidence upload failed: ${error.message}`,
          });
      }

      return res
        .status(400)
        .json({
          success: false,
          message:
            error.message ||
            "The employee-relations evidence file could not be accepted.",
        });
    }
  );
};

/*
 * Employee-owned routes must remain above
 * the generic /:caseNumber route.
 */

router.get(
  "/legacy-migration-preview",
  protect,
  requirePermission("hr"),
  previewLegacyDisciplineMigration
);

router.get(
  "/me",
  protect,
  canUseEmployeeRelationsSelfService,
  getMyEmployeeRelationsCases
);

router.post(
  "/grievances",
  protect,
  canUseEmployeeRelationsSelfService,
  submitGrievanceCase
);

/*
 * HR case-management routes.
 */

router.get(
  "/",
  protect,
  requirePermission("hr"),
  getEmployeeRelationsCases
);

router.post(
  "/discipline",
  protect,
  requirePermission("hr"),
  createDisciplineCaseDraft
);

/*
 * H7 controlled workflow transitions.
 *
 * All action routes must remain above
 * the generic GET /:caseNumber route.
 */

router.post(
  "/:caseNumber/submit",
  protect,
  requirePermission("hr"),
  submitDisciplineCase
);

router.post(
  "/:caseNumber/investigation",
  protect,
  requirePermission("hr"),
  startCaseInvestigation
);

router.post(
  "/:caseNumber/hearings",
  protect,
  requirePermission("hr"),
  scheduleCaseHearing
);

router.post(
  "/:caseNumber/hearings/:hearingNumber/complete",
  protect,
  requirePermission("hr"),
  completeCaseHearing
);

router.post(
  "/:caseNumber/decision",
  protect,
  requirePermission("hr"),
  issueCaseDecision
);

router.post(
  "/:caseNumber/acknowledge",
  protect,
  canUseEmployeeRelationsSelfService,
  acknowledgeCaseDecision
);

router.post(
  "/:caseNumber/appeals",
  protect,
  canUseEmployeeRelationsSelfService,
  submitCaseAppeal
);

router.post(
  "/:caseNumber/appeals/:appealNumber/decision",
  protect,
  requirePermission("hr"),
  decideCaseAppeal
);

router.post(
  "/:caseNumber/withdraw",
  protect,
  canUseEmployeeRelationsSelfService,
  withdrawGrievanceCase
);

router.post(
  "/:caseNumber/close",
  protect,
  requirePermission("hr"),
  closeEmployeeRelationsCase
);

/*
 * H7 controlled evidence.
 *
 * Files remain in memory only until they
 * are transferred to authenticated
 * Cloudinary storage.
 *
 * These routes must remain above the
 * generic GET /:caseNumber route.
 */

router.post(
  "/:caseNumber/evidence",
  protect,
  canUseEmployeeRelationsSelfService,
  uploadEvidenceFile,
  uploadCaseEvidence
);

router.get(
  "/:caseNumber/evidence/:evidenceNumber/download",
  protect,
  canUseEmployeeRelationsSelfService,
  downloadCaseEvidence
);

router.post(
  "/:caseNumber/evidence/:evidenceNumber/review",
  protect,
  requirePermission("hr"),
  reviewCaseEvidence
);

/*
 * Generic case route must remain last.
 * The controller performs an additional
 * participant-ownership access check.
 */

router.get(
  "/:caseNumber",
  protect,
  canUseEmployeeRelationsSelfService,
  getEmployeeRelationsCaseByNumber
);

module.exports = router;