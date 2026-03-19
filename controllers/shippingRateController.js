const ShippingRate = require("../models/ShippingRate");

const getShippingRates = async (req, res) => {
  try {
    const rates = await ShippingRate.find().sort({ weight: 1 });

    res.json({
      success: true,
      message: "Shipping rates retrieved successfully",
      totalRates: rates.length,
      data: rates,
    });
  } catch (error) {
    console.error("Error getting shipping rates:", error);
    res.status(500).json({
      success: false,
      message: "Failed to retrieve shipping rates",
    });
  }
};

const getRateByWeight = async (req, res) => {
  try {
    const weight = Number(req.params.weight || 0);
    const roundedWeight = Math.ceil(weight);

    const rate = await ShippingRate.findOne({ weight: roundedWeight });

    if (!rate) {
      return res.status(404).json({
        success: false,
        message: "No shipping rate found for that weight",
      });
    }

    res.json({
      success: true,
      message: "Shipping rate retrieved successfully",
      data: rate,
    });
  } catch (error) {
    console.error("Error getting shipping rate by weight:", error);
    res.status(500).json({
      success: false,
      message: "Failed to retrieve shipping rate",
    });
  }
};

module.exports = {
  getShippingRates,
  getRateByWeight,
};