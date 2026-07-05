const financialAdjustmentService = require("../services/accountingEngine/financialAdjustmentService");

const previewFinancialPosition = async (req, res) => {
  try {
    const preview = await financialAdjustmentService.buildPositionPreview({
      actualBalances: req.body.actualBalances || [],
    });

    res.json({
      success: true,
      data: preview,
    });
  } catch (error) {
    console.error("Preview financial position error:", error);
    res.status(500).json({
      success: false,
      message: "Could not preview financial position adjustments",
      error: error.message,
    });
  }
};

const createAdjustmentBatch = async (req, res) => {
  try {
    const batch = await financialAdjustmentService.createAdjustmentBatch({
      effectiveDate: req.body.effectiveDate,
      description: req.body.description,
      adjustmentReason: req.body.adjustmentReason,
      actualBalances: req.body.actualBalances || [],
      user: req.user,
    });

    res.status(201).json({
      success: true,
      message: "Financial adjustment batch created successfully",
      data: batch,
    });
  } catch (error) {
    console.error("Create adjustment batch error:", error);
    res.status(500).json({
      success: false,
      message: "Could not create adjustment batch",
      error: error.message,
    });
  }
};

const postAdjustmentBatch = async (req, res) => {
  try {
    const result = await financialAdjustmentService.postAdjustmentBatch({
      batchNumber: req.params.batchNumber,
      user: req.user,
      req,
    });

    res.json({
      success: true,
      message: "Financial adjustment batch posted successfully",
      data: result,
    });
  } catch (error) {
    console.error("Post adjustment batch error:", error);
    res.status(500).json({
      success: false,
      message: "Could not post adjustment batch",
      error: error.message,
    });
  }
};

const getAdjustmentBatches = async (req, res) => {
  try {
    const batches = await financialAdjustmentService.getAdjustmentBatches();

    res.json({
      success: true,
      data: batches,
    });
  } catch (error) {
    console.error("Get adjustment batches error:", error);
    res.status(500).json({
      success: false,
      message: "Could not load adjustment batches",
      error: error.message,
    });
  }
};

const deleteDraftAdjustmentBatch = async (req, res) => {
  try {
    const batch = await financialAdjustmentService.deleteDraftAdjustmentBatch({
      batchNumber: req.params.batchNumber,
    });

    res.json({
      success: true,
      message: "Draft adjustment batch deleted successfully",
      data: batch,
    });
  } catch (error) {
    console.error("Delete adjustment batch error:", error);
    res.status(500).json({
      success: false,
      message: "Could not delete adjustment batch",
      error: error.message,
    });
  }
};

module.exports = {
  previewFinancialPosition,
  createAdjustmentBatch,
  postAdjustmentBatch,
  getAdjustmentBatches,
  deleteDraftAdjustmentBatch,
};