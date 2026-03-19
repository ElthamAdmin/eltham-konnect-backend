const mongoose = require("mongoose");
const XLSX = require("xlsx");
require("dotenv").config();

const ShippingRate = require("./models/ShippingRate");

mongoose.connect(process.env.MONGO_URI);

const importRates = async () => {
  try {
    const workbook = XLSX.readFile("./uploads/Eltham Konnect Rate Sheet.xlsx");
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet);

    console.log("Excel rows found:", rows);

    let imported = 0;
    let skipped = 0;

    await ShippingRate.deleteMany({});

    for (const row of rows) {
      const weight = Number(row["Weight (lb)"]);
      const price = Number(row["Rate (JMD)"]);

      if (!weight || !price || Number.isNaN(weight) || Number.isNaN(price)) {
        skipped++;
        continue;
      }

      await ShippingRate.create({
        rateNumber: `RATE-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        weight,
        price,
        category: "Standard",
        notes: "",
      });

      imported++;
    }

    console.log(`Shipping rates imported successfully. Imported: ${imported}, Skipped: ${skipped}`);
    process.exit();
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
};

importRates();