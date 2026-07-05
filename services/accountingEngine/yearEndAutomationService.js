const FiscalYear = require("../../models/FiscalYear");

const fiscalYearService = require("./fiscalYearService");
const yearEndService = require("./yearEndService");

const getUserName = (user) =>
  user?.fullName || user?.name || user?.email || "System User";

const runEnterpriseYearEnd = async ({ fiscalYear, user = null }) => {
  const completedSteps = [];

  const year = await FiscalYear.findOne({
    fiscalYear: Number(fiscalYear),
  });

  if (!year) {
    throw new Error("Fiscal year not found.");
  }

  if (year.status === "Locked") {
    throw new Error("Fiscal year is already locked.");
  }

  const validation = await fiscalYearService.validateFiscalYear({
    fiscalYear,
    user,
    mode: "yearEndClose",
  });

  completedSteps.push("Fiscal year validation completed");

  if (!validation.passed) {
    return {
      success: false,
      failedStep: "Validation",
      message: "Fiscal year validation failed.",
      completedSteps,
      errors: validation.errors,
      warnings: validation.warnings,
      validation,
    };
  }

  const yearEndClose = await yearEndService.executeYearEndClose({
    fiscalYear,
    user,
  });

  completedSteps.push("Year-end close completed");

  const nextYear = await fiscalYearService.createNextFiscalYear({
    fiscalYear,
    user,
  });

  completedSteps.push(`Next fiscal year ${nextYear.fiscalYear} created`);

  const openingBalances = await yearEndService.generateOpeningBalances({
    fiscalYear,
    user,
  });

  completedSteps.push("Opening balances generated");

  await FiscalYear.updateMany({}, { isCurrentYear: false });

  const previousYear = await FiscalYear.findOne({
    fiscalYear: Number(fiscalYear),
  });

  previousYear.status = "Locked";
  previousYear.allowPosting = false;
  previousYear.isCurrentYear = false;
  previousYear.lockedBy = getUserName(user);
  previousYear.lockedAt = new Date();
  previousYear.nextFiscalYear = nextYear.fiscalYear;
  await previousYear.save();

  completedSteps.push(`Previous fiscal year ${fiscalYear} locked`);

  nextYear.isCurrentYear = true;
  nextYear.previousFiscalYear = Number(fiscalYear);
  await nextYear.save();

  completedSteps.push(`Fiscal year ${nextYear.fiscalYear} set as current`);

  return {
    success: true,
    message: "Enterprise year-end automation completed successfully.",
    previousFiscalYear: previousYear,
    currentFiscalYear: nextYear,
    validation,
    yearEndClose,
    openingBalances,
    completedSteps,
  };
};

module.exports = {
  runEnterpriseYearEnd,
};