const mongoose = require("mongoose");

const ShippingRateSchema = new mongoose.Schema(
{
    rateNumber: {
        type: String,
        required: true,
        unique: true
    },

    weight: {
        type: Number,
        required: true
    },

    price: {
        type: Number,
        required: true
    },

    category: {
        type: String,
        default: "Standard"
    },

    notes: {
        type: String,
        default: ""
    }
},
{ timestamps: true }
);

module.exports = mongoose.model("ShippingRate", ShippingRateSchema);