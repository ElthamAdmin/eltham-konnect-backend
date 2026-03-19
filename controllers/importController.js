const XLSX = require("xlsx");
const Customer = require("../models/Customer");
const ShippingRate = require("../models/ShippingRate");

const importCustomers = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "Excel file required",
      });
    }

    const workbook = XLSX.readFile(req.file.path);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet);

    let imported = 0;
    let updated = 0;
    let skipped = 0;

    for (const row of rows) {
      const fullName = row["Full Name"];
      const email = row["Email"];
      const phone = row["Phone Number"] || "";
      const ekonId = row["EKON ID"];
      const address = row["Address"] || "";
      const signUpDate = row["Sign-Up Date"]
        ? String(row["Sign-Up Date"])
        : "";
      const importedPoints = Number(row["EK Points Available"] || 0);
      const branch = row["Branch"] || "Eltham Park";

      if (!fullName || !email) {
        skipped++;
        continue;
      }

      const safePoints = Math.min(importedPoints, 1500);

      const existingCustomer = await Customer.findOne({
        $or: [
          ...(ekonId ? [{ ekonId }] : []),
          { email },
        ],
      });

      if (existingCustomer) {
        existingCustomer.name = fullName;
        existingCustomer.email = email;
        existingCustomer.phone = phone;
        existingCustomer.branch = branch;
        existingCustomer.address = address;
        existingCustomer.pointsBalance = safePoints;
        existingCustomer.signUpDate = signUpDate;
        existingCustomer.status = "Active";

        await existingCustomer.save();
        updated++;
      } else {
        await Customer.create({
          ekonId:
            ekonId ||
            `EKON${Date.now()}${Math.floor(Math.random() * 1000)}`,
          name: fullName,
          email,
          phone,
          branch,
          address,
          pointsBalance: safePoints,
          signUpDate,
          lastActivityDate: signUpDate,
          status: "Active",
        });

        imported++;
      }
    }

    res.json({
      success: true,
      message: "Customer import completed",
      summary: {
        totalRows: rows.length,
        imported,
        updated,
        skipped,
      },
    });
  } catch (error) {
    console.error("Customer import error:", error);

    res.status(500).json({
      success: false,
      message: "Customer import failed",
      error: error.message,
    });
  }
};

const importRates = async (req,res)=>{
try{

if(!req.file){
return res.status(400).json({
success:false,
message:"Excel file required"
});
}

const workbook = XLSX.readFile(req.file.path);
const sheet = workbook.Sheets[workbook.SheetNames[0]];
const rows = XLSX.utils.sheet_to_json(sheet);

let imported = 0;

for(const row of rows){

if(!row["Weight (lb)"] || !row["Rate (JMD)"]) continue;

await ShippingRate.create({

rateNumber:`RATE-${Date.now()}-${Math.floor(Math.random()*1000)}`,

weight: row["Weight (lb)"],

price: row["Rate (JMD)"],

category:"Standard"

});

imported++;

}
res.json({
success:true,
message:`${imported} rates imported`,
totalRows:rows.length
});

}catch(error){

console.error(error);

res.status(500).json({
success:false,
message:"Rate import failed"
});
}
};

module.exports = {
importCustomers,
importRates
};