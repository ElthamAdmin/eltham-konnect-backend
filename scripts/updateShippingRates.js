require("dotenv").config();
const mongoose = require("mongoose");
const ShippingRate = require("../models/ShippingRate");

const rates = {
  1: 900, 2: 1200, 3: 1600, 4: 1900, 5: 2300,
  6: 2700, 7: 3000, 8: 3400, 9: 3800, 10: 4300,
  11: 4700, 12: 5100, 13: 5500, 14: 5900, 15: 6300,
  16: 6700, 17: 7100, 18: 7500, 19: 7900, 20: 8300,
  21: 8550, 22: 8900, 23: 9400, 24: 9900, 25: 10200,
  26: 10600, 27: 10900, 28: 11300, 29: 11600, 30: 11900,
  31: 12400, 32: 12800, 33: 13000, 34: 13500, 35: 14000,
  36: 14500, 37: 15000, 38: 15500, 39: 16000, 40: 16500,
  41: 17000, 42: 17500, 43: 18500, 44: 19000, 45: 19500,
  46: 20000, 47: 20400, 48: 20700, 49: 21000, 50: 21500,
  51: 21700, 52: 22000, 53: 22300, 54: 22600, 55: 22900,
  56: 23300, 57: 23700, 58: 24000, 59: 24200, 60: 24500,
  61: 24900, 62: 25300, 63: 25700, 64: 26000, 65: 26500,
  66: 27000, 67: 27300, 68: 27700, 69: 28100, 70: 28600,
  71: 29000, 72: 29500, 73: 30000, 74: 30300, 75: 30700,
  76: 31100, 77: 31350, 78: 31700, 79: 31950, 80: 33350,
  81: 33700, 82: 33900, 83: 34200, 84: 34400, 85: 34600,
  86: 34800, 87: 35000, 88: 35200, 89: 35400, 90: 35600,
  91: 35800, 92: 36000, 93: 36200, 94: 36400, 95: 36800,
  96: 37200, 97: 37600, 98: 38000, 99: 38400, 100: 38800,
};

async function run() {
  try {
    await mongoose.connect(process.env.MONGO_URI);

    for (const [weight, price] of Object.entries(rates)) {
      await ShippingRate.findOneAndUpdate(
        { weight: Number(weight) },
        {
          rateNumber: `RATE-${String(weight).padStart(3, "0")}`,
          weight: Number(weight),
          price: Number(price),
          category: "Standard",
        },
        { upsert: true, new: true }
      );
    }

    console.log("Shipping rates updated successfully.");
    process.exit(0);
  } catch (error) {
    console.error("Shipping rates update failed:", error);
    process.exit(1);
  }
}

run();