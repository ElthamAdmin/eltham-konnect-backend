const Chart = require("../models/ChartOfAccount");
const Financial = require("../models/FinancialAccount");
const Entity = require("../models/BusinessEntity");

const service = require("../services/manualJournalService");

const handle = (action, message) => async (req, res) => {
  try {
    const entry = await action(req);

    res.json({
      success: true,
      message,
      data: entry,
    });
  } catch (error) {
    console.error("Reviewed journal action failed:", error);

    res.status(
      error.statusCode || (error.code === 11000 ? 409 : 500)
    ).json({
      success: false,
      message: error.code === 11000
        ? "A matching draft or opening already exists. Refresh the journal list before retrying."
        : error.message ||
          "The journal action could not be confirmed. Refresh before retrying.",
    });
  }
};

const getOptions = handle(async (req) => {
  const isAdmin = req.user.role === "Admin";

  const canPrepare =
    isAdmin || req.user.permissions?.includes("finance");

  const [accounts, entities, financials] = await Promise.all([
    Chart.find({ status: "Active" })
      .sort({ accountCode: 1 })
      .lean(),

    Entity.find({ lifecycleStatus: "Active" })
      .sort({ legalName: 1 })
      .select("entityCode legalName effectiveFrom effectiveTo")
      .lean(),

    Financial.find({ status: "Active" })
      .select("accountNumber linkedChartAccountCode currency accountName")
      .lean(),
  ]);

  const foreignCodes = new Set(
    financials
      .filter((account) => account.currency !== "JMD")
      .map((account) => account.linkedChartAccountCode)
  );

  return {
    capabilities: {
      canPrepare: Boolean(canPrepare),
      canAdmin: isAdmin,
    },

    entities,

    manualAccounts: canPrepare
      ? accounts.filter(
          (account) =>
            account.allowManualEntries !== false &&
            !foreignCodes.has(account.accountCode)
        )
      : [],

    openingAccounts: isAdmin
      ? accounts.map((account) => ({
          accountCode: account.accountCode,
          accountName: account.accountName,
          currency:
            financials.find(
              (financial) =>
                financial.linkedChartAccountCode ===
                account.accountCode
            )?.currency || "JMD",
        }))
      : [],

    offsetAccounts: isAdmin
      ? accounts.filter(
          (account) =>
            account.accountCategory === "Equity" &&
            account.allowManualEntries !== false
        )
      : [],
  };
}, "Journal options loaded.");

const createDraft = handle(
  (req) => service.saveDraft({
    body: req.body || {},
    user: req.user,
    req,
  }),
  "Manual draft saved. No balances have changed."
);

const previewOpening = handle(
  (req) => service.previewOpening({
    body: req.body || {},
    user: req.user,
  }),
  "Opening preview prepared. No balances have changed."
);

const createOpeningDraft = handle(
  (req) => service.saveDraft({
    body: req.body || {},
    user: req.user,
    req,
    isOpening: true,
  }),
  "Opening draft saved. Submit, approve and post it separately."
);

const submit = handle(
  (req) => service.changeStatus({
    entryNumber: req.params.entryNumber,
    user: req.user,
    req,
    action: "submit",
  }),
  "Journal submitted for approval."
);

const approve = handle(
  (req) => service.changeStatus({
    entryNumber: req.params.entryNumber,
    user: req.user,
    req,
    action: "approve",
  }),
  "Journal approved. No balances have changed."
);

const post = handle(
  (req) => service.post({
    entryNumber: req.params.entryNumber,
    user: req.user,
    req,
  }),
  "Journal posted."
);

const reverse = handle(
  (req) => service.reverse({
    entryNumber: req.params.entryNumber,
    user: req.user,
    req,
    body: req.body || {},
  }),
  "Manual journal reversed."
);

const discard = handle(
  (req) => service.discard({
    entryNumber: req.params.entryNumber,
    user: req.user,
    req,
  }),
  "Unposted draft discarded; its audit record was retained."
);

module.exports = {
  getOptions,
  createDraft,
  previewOpening,
  createOpeningDraft,
  submit,
  approve,
  post,
  reverse,
  discard,
};