const periodService = require("../services/accountingEngine/periodService");

const closeAccountingPeriod = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");

  try {
    const {
      fiscalYear,
      periodMonth,
      notes = "",
      confirmReviewed,
    } = req.body || {};

    const year = Number(fiscalYear);
    const month = Number(periodMonth);

    const validSelection =
      ["string", "number"].includes(typeof fiscalYear) &&
      ["string", "number"].includes(typeof periodMonth) &&
      /^\d{4}$/.test(String(fiscalYear)) &&
      Number.isInteger(year) &&
      year >= 2000 &&
      year <= 2100 &&
      Number.isInteger(month) &&
      month >= 1 &&
      month <= 12;

    if (!validSelection) {
      return res.status(400).json({
        success: false,
        message: "Select a valid fiscal year and accounting month.",
      });
    }

    if (confirmReviewed !== true) {
      return res.status(400).json({
        success: false,
        message: "Confirm the period review before closing.",
      });
    }

    if (typeof notes !== "string" || notes.length > 2000) {
      return res.status(400).json({
        success: false,
        message: "Closing notes must contain no more than 2,000 characters.",
      });
    }

    const period = await periodService.closePeriod({
      periodNumber: `PER-${year}-${String(month).padStart(2, "0")}`,
      notes: [
        "Admin confirmed the closing review.",
        notes.trim(),
      ].filter(Boolean).join(" "),
      user: req.user,
    });

    return res.json({
      success: true,
      message:
        "Monthly posting closed for all businesses and branches. No closing journal was created.",
      data: {
        period,
        journalsCreated: 0,
      },
    });
  } catch (error) {
    console.error("Close accounting period error:", error);

    const status =
      error.name === "ValidationError"
        ? 400
        : [400, 404, 409].includes(error.statusCode)
          ? error.statusCode
          : 500;

    return res.status(status).json({
      success: false,
      message:
        status === 500
          ? "Could not close the accounting period."
          : error.message,
    });
  }
};

module.exports = {
  closeAccountingPeriod,
};