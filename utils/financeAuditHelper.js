const AccountingPeriod = require("../models/AccountingPeriod");
const { writeAuditLog } = require("./auditLogger");

const resolvePeriodInfo = async (
  postingDate,
  session = null
) => {
  const date = new Date(postingDate || new Date());

  if (Number.isNaN(date.getTime())) {
    return {
      fiscalYear: null,
      accountingPeriod: "",
      periodName: "",
    };
  }

  const fiscalYear = date.getFullYear();
  const periodMonth = date.getMonth() + 1;

    const periodQuery = AccountingPeriod.findOne({
    fiscalYear,
    periodMonth,
  });

  if (session) {
    periodQuery.session(session);
  }

  const period = await periodQuery;

  return {
    fiscalYear,
    accountingPeriod: period?.periodNumber || "",
    periodName: period?.periodName || "",
  };
};

const writeFinanceAuditLog = async ({
  req = null,
  action,
  description,
  targetType = "",
  targetId = "",
  postingDate = new Date(),
  journalEntry = null,
  metadata = {},
  beforeValues = null,
  afterValues = null,
  accountNumber = "",
  accountName = "",
  status = "Success",
    performedByName = "",
  session = null,
}) => {
    const periodInfo = await resolvePeriodInfo(
    postingDate || journalEntry?.entryDate || new Date(),
    session
  );

  await writeAuditLog({
    req,
    session,
    action,
    module: "Finance",
    description,
    targetType,
    targetId,
    beforeValues,
    afterValues,
    financeReference: targetId || journalEntry?.reference || "",
    journalEntryNumber:
      journalEntry?.entryNumber || metadata?.journalEntryNumber || "",
    accountingPeriod: periodInfo.accountingPeriod,
    fiscalYear: periodInfo.fiscalYear,
    accountNumber,
    accountName,
    status,
    performedByName,
    metadata: {
      ...metadata,
      periodName: periodInfo.periodName,
    },
  });
};

module.exports = {
  writeFinanceAuditLog,
};