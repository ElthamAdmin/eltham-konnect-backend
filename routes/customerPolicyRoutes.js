const express = require("express");
const multer = require("multer");

const {
  listStaffPolicies,
  uploadPolicyDraft,
  getStaffPolicyAccess,
  publishPolicy,
  withdrawPolicy,
  listPublishedPolicies,
  getPublishedPolicyAccess,
} = require("../controllers/customerPolicyController");

const {
  protect,
  requirePermission,
} = require("../middleware/authMiddleware");

const router = express.Router();

/*
 * Published documents can be reviewed before login
 * or policy acceptance. Drafts are excluded by the
 * controller.
 */
router.get(
  "/published",
  listPublishedPolicies
);

router.get(
  "/published/:policyNumber/access",
  getPublishedPolicyAccess
);

/*
 * Everything below requires authorized staff access.
 */
router.use(
  protect,
  requirePermission("settings")
);

const policyUpload = multer({
  storage: multer.memoryStorage(),

  limits: {
    fileSize: 10 * 1024 * 1024,
    files: 1,
    fields: 4,
    fieldSize: 16 * 1024,
    parts: 5,
  },

  fileFilter: (req, file, callback) => {
    if (file.mimetype !== "application/pdf") {
      return callback(
        new Error("Only PDF policy documents are allowed.")
      );
    }

    return callback(null, true);
  },
});

const receivePolicyFile = (req, res, next) => {
  policyUpload.single("document")(req, res, (error) => {
    if (!error) {
      return next();
    }

    let message =
      error.message || "The policy upload could not be processed.";

    if (error.code === "LIMIT_FILE_SIZE") {
      message = "Policy PDFs must be 10 MB or smaller.";
    } else if (error.code === "LIMIT_UNEXPECTED_FILE") {
      message = "Choose one PDF using the document upload field.";
    } else if (
      [
        "LIMIT_FILE_COUNT",
        "LIMIT_FIELD_COUNT",
        "LIMIT_PART_COUNT",
      ].includes(error.code)
    ) {
      message =
        "Upload one PDF with its policy type, version, title and effective date.";
    }

    return res.status(400).json({
      success: false,
      message,
    });
  });
};

router.get(
  "/staff",
  listStaffPolicies
);

router.post(
  "/staff/upload",
  receivePolicyFile,
  uploadPolicyDraft
);

router.get(
  "/staff/:policyNumber/access",
  getStaffPolicyAccess
);

router.post(
  "/staff/:policyNumber/publish",
  publishPolicy
);

router.post(
  "/staff/:policyNumber/withdraw",
  withdrawPolicy
);

module.exports = router;