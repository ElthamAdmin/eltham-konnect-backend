const FiscalYear = require("../../models/FiscalYear");
const fiscalYearService = require("./fiscalYearService");

const generateOpeningBalances = async ({ fiscalYear }) => {
  const value = Number(fiscalYear);

  if (
    !/^\d{4}$/.test(String(fiscalYear)) ||
    !Number.isInteger(value) ||
    value < 2000 ||
    value > 2100
  ) {
    const error = new Error("Enter a fiscal year from 2000 to 2100.");
    error.statusCode = 400;
    throw error;
  }

  const year = await FiscalYear.findOne({ fiscalYear: value });

  if (!year) {
    const error = new Error("Fiscal year not found.");
    error.statusCode = 404;
    throw error;
  }

  return {
    created: false,
    openingJournalEntry: null,
    existingOpeningJournalEntry: year.openingJournalEntry || "",
    message:
      "No opening journal was created. Existing balances continue automatically through the cumulative ledger. Existing historical journals require separate review.",
  };
};

// Compatibility endpoint: annual posting closure only.
const executeYearEndClose = async (options) => {
  const year = await fiscalYearService.closeFiscalYear(options);

  return {
    year,
    journalsCreated: 0,
    message:
      "Annual posting closed. No balances were reposted and no current-year selection was changed. Other year-end work is not marked completed.",
  };
};

module.exports = {
  executeYearEndClose,
  generateOpeningBalances,
};