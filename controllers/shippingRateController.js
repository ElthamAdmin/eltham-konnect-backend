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

const updateShippingRate = async (req, res) => {
  try {
    const { weight } = req.params;
    const { price } = req.body;

    if (!weight || price === undefined || price === "") {
      return res.status(400).json({
        success: false,
        message: "Weight and price are required",
      });
    }

    const rate = await ShippingRate.findOneAndUpdate(
      { weight: Number(weight) },
      {
        weight: Number(weight),
        price: Number(price),
      },
      { new: true, upsert: true }
    );

    res.json({
      success: true,
      message: "Shipping rate updated successfully",
      data: rate,
    });
  } catch (error) {
    console.error("Error updating shipping rate:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update shipping rate",
      error: error.message,
    });
  }
};

module.exports = {
  getShippingRates,
  getRateByWeight,
  updateShippingRate,
};