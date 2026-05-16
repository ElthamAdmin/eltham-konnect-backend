const FixedAsset = require("../models/FixedAsset");
const ChartOfAccount = require("../models/ChartOfAccount");

const calculateDepreciation = ({
  purchaseCost,
  salvageValue,
  usefulLifeYears,
}) => {
  const depreciableValue =
    Number(purchaseCost || 0) -
    Number(salvageValue || 0);

  const annualDepreciation =
    depreciableValue / Number(usefulLifeYears || 1);

  const monthlyDepreciation =
    annualDepreciation / 12;

  return {
    annualDepreciation,
    monthlyDepreciation,
  };
};

const getFixedAssets = async (req, res) => {
  try {
    const assets = await FixedAsset.find().sort({
      createdAt: -1,
    });

    const totalAssetCost = assets.reduce(
      (sum, asset) =>
        sum + Number(asset.purchaseCost || 0),
      0
    );

    const totalAccumulatedDepreciation =
      assets.reduce(
        (sum, asset) =>
          sum +
          Number(asset.accumulatedDepreciation || 0),
        0
      );

    const totalNetBookValue = assets.reduce(
      (sum, asset) =>
        sum + Number(asset.netBookValue || 0),
      0
    );

    res.json({
      success: true,

      summary: {
        totalAssetCost,
        totalAccumulatedDepreciation,
        totalNetBookValue,
        totalAssets: assets.length,
      },

      data: assets,
    });
  } catch (error) {
    console.error(
      "Error retrieving fixed assets:",
      error
    );

    res.status(500).json({
      success: false,
      message: "Could not retrieve fixed assets",
      error: error.message,
    });
  }
};

const createFixedAsset = async (req, res) => {
  try {
    const {
      assetName,
      assetCategory,
      purchaseDate,
      purchaseCost,
      salvageValue,
      usefulLifeYears,
      notes,
    } = req.body;

    const depreciation =
      calculateDepreciation({
        purchaseCost,
        salvageValue,
        usefulLifeYears,
      });

    const asset = await FixedAsset.create({
      assetNumber: `AST-${Date.now()}`,

      assetName,

      assetCategory,

      purchaseDate,

      purchaseCost,

      salvageValue,

      usefulLifeYears,

      annualDepreciation:
        depreciation.annualDepreciation,

      monthlyDepreciation:
        depreciation.monthlyDepreciation,

      netBookValue:
        Number(purchaseCost || 0),

      notes,
    });

    res.status(201).json({
      success: true,
      message: "Fixed asset created successfully",
      data: asset,
    });
  } catch (error) {
    console.error(
      "Error creating fixed asset:",
      error
    );

    res.status(500).json({
      success: false,
      message: "Could not create fixed asset",
      error: error.message,
    });
  }
};

const runMonthlyDepreciation = async (
  req,
  res
) => {
  try {
    const assets = await FixedAsset.find({
      status: "Active",
    });

    let depreciatedAssets = 0;

    for (const asset of assets) {
      const newAccumulated =
        Number(asset.accumulatedDepreciation || 0) +
        Number(asset.monthlyDepreciation || 0);

      const maxDepreciation =
        Number(asset.purchaseCost || 0) -
        Number(asset.salvageValue || 0);

      if (newAccumulated >= maxDepreciation) {
        asset.accumulatedDepreciation =
          maxDepreciation;

        asset.netBookValue =
          Number(asset.salvageValue || 0);

        asset.status =
          "Fully Depreciated";
      } else {
        asset.accumulatedDepreciation =
          newAccumulated;

        asset.netBookValue =
          Number(asset.purchaseCost || 0) -
          newAccumulated;
      }

      await asset.save();

      depreciatedAssets++;
    }

    res.json({
      success: true,
      message:
        "Monthly depreciation processed successfully",
      depreciatedAssets,
    });
  } catch (error) {
    console.error(
      "Error processing depreciation:",
      error
    );

    res.status(500).json({
      success: false,
      message:
        "Could not process depreciation",
      error: error.message,
    });
  }
};

module.exports = {
  getFixedAssets,
  createFixedAsset,
  runMonthlyDepreciation,
};