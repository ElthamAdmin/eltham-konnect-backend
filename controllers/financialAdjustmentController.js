const financialAdjustmentService = require("../services/accountingEngine/financialAdjustmentService");

const {
  buildFinancialPositionReview,
} = require("../services/accountingEngine/financialPositionReviewService");

const sendAdjustmentError = (res, error, message) => {
  console.error(message, error);

  const statusCode = [400, 403, 404, 409].includes(
    error.statusCode
  )
    ? error.statusCode
    : 500;

  return res.status(statusCode).json({
    success: false,
    message:
      statusCode === 500 ? message : error.message,
  });
};

/*
|--------------------------------------------------------------------------
| Read-Only Financial Position Review
|--------------------------------------------------------------------------
*/

const previewFinancialPosition = async (req, res) => {
  try {
    const input = req.body || {};

    const review = await buildFinancialPositionReview({
      effectiveDate: input.effectiveDate,
      actualBalances:
        input.actualBalances === undefined
          ? []
          : input.actualBalances,
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
    return sendAdjustmentError(
      res,
      error,
      "Could not review financial position."
    );
  }
};

/*
|--------------------------------------------------------------------------
| Legacy Posting Paused During Read-Only Review
|--------------------------------------------------------------------------
|
| Controlled correction approval and posting will be
| connected separately. These handlers do not call the
| legacy automatic equity-offset posting functions.
|
*/

const createAdjustmentBatch = async (req, res) =>
  res.status(409).json({
    success: false,
    code: "ADJUSTMENT_REVIEW_ONLY",
    message:
      "Position Adjustments is currently review-only. Batch creation will be enabled when the controlled correction and approval workflow is ready. No adjustment was created.",
  });

const postAdjustmentBatch = async (req, res) =>
  res.status(409).json({
    success: false,
    code: "ADJUSTMENT_REVIEW_ONLY",
    message:
      "Legacy adjustment posting is unavailable during the reconciliation review. Existing drafts need review under the controlled approval workflow. No journal was posted.",
  });

/*
|--------------------------------------------------------------------------
| Existing Batch History
|--------------------------------------------------------------------------
*/

const getAdjustmentBatches = async (req, res) => {
  try {
    const batches =
      await financialAdjustmentService.getAdjustmentBatches();

    return res.json({
      success: true,
      data: batches,
    });
  } catch (error) {
    return sendAdjustmentError(
      res,
      error,
      "Could not load adjustment batches."
    );
  }
};

/*
|--------------------------------------------------------------------------
| Existing Draft Deletion
|--------------------------------------------------------------------------
*/

const deleteDraftAdjustmentBatch = async (req, res) => {
  try {
    const batch =
      await financialAdjustmentService.deleteDraftAdjustmentBatch({
        batchNumber: req.params.batchNumber,
      });

    return res.json({
      success: true,
      message:
        "Draft adjustment batch deleted successfully.",
      data: batch,
    });
  } catch (error) {
    return sendAdjustmentError(
      res,
      error,
      "Could not delete adjustment batch."
    );
  }
};

module.exports = {
  previewFinancialPosition,
  createAdjustmentBatch,
  postAdjustmentBatch,
  getAdjustmentBatches,
  deleteDraftAdjustmentBatch,
};