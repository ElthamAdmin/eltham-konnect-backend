const service = require("../services/accountingEngine/financialAdjustmentService");

const {
  buildFinancialPositionReview,
} = require("../services/accountingEngine/financialPositionReviewService");

const BusinessEntity = require("../models/BusinessEntity");
const ChartOfAccount = require("../models/ChartOfAccount");
const FinancialAccount = require("../models/FinancialAccount");

const requireAdmin = (req, res) => {
  if (!req.user || req.user.role !== "Admin") {
    res.status(403).json({
      success: false,
      message: "Owner/Admin access is required.",
    });

    return false;
  }

  return true;
};

const sendError = (res, error, fallback) => {
  console.error(fallback, error);

  const status =
    error.code === 11000 || error.name === "VersionError"
      ? 409
      : [400, 403, 404, 409].includes(error.statusCode)
      ? error.statusCode
      : 500;

  const message =
    error.code === 11000
      ? "A conflicting record already exists. Reload and inspect the batch before retrying."
      : error.name === "VersionError"
      ? "The batch changed. Reload before continuing."
      : status === 500
      ? fallback
      : error.message;

  return res.status(status).json({
    success: false,
    message,
  });
};

const action = (
  message,
  operation,
  status = 200
) => async (req, res) => {
  if (!requireAdmin(req, res)) return;

  try {
    const data = await operation(req);

    return res.status(status).json({
      success: true,
      message,
      data,
    });
  } catch (error) {
    return sendError(
      res,
      error,
      "Could not complete the financial adjustment request."
    );
  }
};

const previewFinancialPosition = async (req, res) => {
  if (!requireAdmin(req, res)) return;

  try {
    const review = await buildFinancialPositionReview({
      effectiveDate: req.body?.effectiveDate,
      actualBalances:
        req.body?.actualBalances === undefined
          ? []
          : req.body.actualBalances,
    });

    return res.json({
      success: true,
      data: review.rows,

      reviewMeta: {
        effectiveDate: review.effectiveDate,
        generatedAt: review.generatedAt,
        readOnly: review.readOnly,
        canPost: review.canPost,
        balanceBasis: review.balanceBasis,
        entityBasis: review.entityBasis,
        accountBasis: review.accountBasis,
        accountsWithIssues: review.accountsWithIssues,
      },
    });
  } catch (error) {
    return sendError(
      res,
      error,
      "Could not preview the financial position."
    );
  }
};

const getFinancialAdjustmentOptions = action(
  "Adjustment options retrieved.",
  async () => {
    const linkedCodes = await FinancialAccount.distinct(
      "linkedChartAccountCode"
    );

    const entities = await BusinessEntity.find({
      lifecycleStatus: "Active",
    })
      .select(
        "entityCode legalName entityType effectiveFrom effectiveTo"
      )
      .sort({ entityCode: 1 })
      .lean();

    const offsetAccounts = await ChartOfAccount.find({
      status: "Active",
      allowManualEntries: true,

      accountCode: {
        $nin: linkedCodes.filter(Boolean),
      },
    })
      .select(
        "accountCode accountName accountCategory normalBalance"
      )
      .sort({ accountCode: 1 })
      .lean();

        return {
      entities,
      offsetAccounts,
      postingEnabled:
        process.env.FINANCIAL_ADJUSTMENT_POSTING_ENABLED === "true",
    };
  }
);

const getAdjustmentBatches = action(
  "Adjustment batches retrieved.",
  () => service.getAdjustmentBatches()
);

const createAdjustmentBatch = action(
  "Adjustment draft created. No journal was posted.",
  (req) =>
    service.createAdjustmentBatch({
      effectiveDate: req.body?.effectiveDate,
      description: req.body?.description,
      adjustmentReason: req.body?.adjustmentReason,
      businessEntityCode: req.body?.businessEntityCode,
      evidenceReferences: req.body?.evidenceReferences,
      actualBalances: req.body?.actualBalances,
      user: req.user,
    }),
  201
);

const submitAdjustmentBatch = action(
  "Adjustment batch submitted for review.",
  (req) =>
    service.submitAdjustmentBatch({
      batchNumber: req.params.batchNumber,
      user: req.user,
    })
);

const approveAdjustmentBatch = action(
  "Adjustment batch approved. No journal was posted.",
  (req) =>
    service.approveAdjustmentBatch({
      batchNumber: req.params.batchNumber,
      expectedContentHash: req.body?.expectedContentHash,
      evidenceReviewed: req.body?.evidenceReviewed,
      ownershipReview: req.body?.ownershipReview,
      notes: req.body?.notes,
      user: req.user,
    })
);

const rejectAdjustmentBatch = action(
  "Adjustment batch rejected.",
  (req) =>
    service.rejectAdjustmentBatch({
      batchNumber: req.params.batchNumber,
      reason: req.body?.reason,
      user: req.user,
    })
);

const cancelAdjustmentBatch = action(
  "Adjustment draft cancelled; history retained.",
  (req) =>
    service.cancelAdjustmentBatch({
      batchNumber: req.params.batchNumber,
      reason: req.body?.reason,
      user: req.user,
    })
);

const postAdjustmentBatch = action(
  "Adjustment posting request completed.",
  (req) => {
    if (
      process.env.FINANCIAL_ADJUSTMENT_POSTING_ENABLED !==
      "true"
    ) {
      const error = new Error(
        "Adjustment posting is not enabled. Draft preparation and review remain available."
      );

      error.statusCode = 409;
      throw error;
    }

    return service.postAdjustmentBatch({
      batchNumber: req.params.batchNumber,
      expectedApprovedContentHash:
        req.body?.expectedApprovedContentHash,
      user: req.user,
      req,
    });
  }
);

const deleteDraftAdjustmentBatch = action(
  "",
  () => service.deleteDraftAdjustmentBatch()
);

module.exports = {
  previewFinancialPosition,
  getFinancialAdjustmentOptions,
  getAdjustmentBatches,
  createAdjustmentBatch,
  submitAdjustmentBatch,
  approveAdjustmentBatch,
  rejectAdjustmentBatch,
  cancelAdjustmentBatch,
  postAdjustmentBatch,
  deleteDraftAdjustmentBatch,
};