const crypto = require("crypto");
const mongoose = require("mongoose");

const Journal = require("../models/JournalEntry");
const Ledger = require("../models/GeneralLedgerTransaction");
const Chart = require("../models/ChartOfAccount");
const Financial = require("../models/FinancialAccount");
const Entity = require("../models/BusinessEntity");

const {
  buildEntitySnapshot,
} = require("./entityPostingContextService");

const {
  postJournalEntry,
  postApprovedJournalEntry,
  validateAccountingPeriodOpen,
} = require("./accountingEngine/journalService");

const { writeAuditLog } = require("../utils/auditLogger");

const fail = (message, statusCode = 409) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  throw error;
};

const who = (user) =>
  user?.fullName ||
  user?.name ||
  user?.email ||
  "System User";

const admin = (user) => {
  if (user?.role !== "Admin") {
    fail("Only an administrator can perform this action.", 403);
  }
};

const finance = (user) => {
  if (
    user?.role !== "Admin" &&
    !user?.permissions?.includes("finance")
  ) {
    fail("Finance permission is required.", 403);
  }
};

const today = () => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Jamaica",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  return ["year", "month", "day"]
    .map((type) => parts.find((part) => part.type === type).value)
    .join("-");
};

const date = (value) => {
  const text = String(value || "").trim();
  const parsed = new Date(`${text}T00:00:00Z`);

  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(text) ||
    Number.isNaN(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== text ||
    text > today()
  ) {
    fail(
      "Enter a valid posting date that is not in the future.",
      400
    );
  }

  return text;
};

const amount = (value) => {
  const number = Number(value);
  const minor = Math.round(number * 100);

  if (
    !Number.isFinite(number) ||
    !Number.isSafeInteger(minor)
  ) {
    fail("Enter valid monetary amounts.", 400);
  }

  return minor / 100;
};

const branch = (value) => {
  const text = String(value || "").trim();

  if (
    ![
      "",
      "Eltham Park Mainstore",
      "Brown's Town Square",
    ].includes(text)
  ) {
    fail("Select a valid branch.", 400);
  }

  return text;
};

const manual = (entry) =>
  entry?.entryKind === "Manual" ||
  (!entry?.entryKind && entry?.sourceModule === "Manual");

const opening = (entry) =>
  entry?.entryKind === "Opening Balance";

const checkKind = (entry, user) => {
  if (!entry) {
    fail("Journal entry not found.", 404);
  }

  if (opening(entry)) {
    admin(user);
  } else {
    finance(user);

    if (!manual(entry)) {
      fail(
        "This journal belongs to a business workflow and cannot be processed through manual-journal actions."
      );
    }
  }
};

const context = async (code, postingDate, session) => {
  const entity = await Entity.findOne({
    entityCode: String(code || "").trim(),
  }).session(session);

  if (!entity || entity.lifecycleStatus !== "Active") {
    fail(
      "Select an active business. Planned companies cannot receive posted openings."
    );
  }

  if (
    postingDate < entity.effectiveFrom ||
    (entity.effectiveTo && postingDate > entity.effectiveTo)
  ) {
    fail(
      "The posting date is outside this business's effective dates."
    );
  }

  return {
    entityId: entity._id,
    entityCode: entity.entityCode,
    entitySnapshot: buildEntitySnapshot(entity),
  };
};

const validateLines = async (
  input,
  session,
  allowOpening = false
) => {
  if (
    !Array.isArray(input) ||
    input.length < 2 ||
    input.length > 100
  ) {
    fail("Enter 2–100 journal lines.", 400);
  }

  const lines = [];
  let debitTotal = 0;
  let creditTotal = 0;

  for (const raw of input) {
    const debit = amount(raw.debit ?? 0);
    const credit = amount(raw.credit ?? 0);

    if (
      debit < 0 ||
      credit < 0 ||
      (debit > 0) === (credit > 0)
    ) {
      fail(
        "Each line needs either a positive debit or a positive credit, not both.",
        400
      );
    }

    const account = await Chart.findOne({
      accountCode: String(raw.accountCode || "").trim(),
      status: "Active",
    }).session(session);

    if (
      !account ||
      (!allowOpening && account.allowManualEntries === false)
    ) {
      fail(
        "A selected account is unavailable for ordinary manual journals."
      );
    }

    if (
      !allowOpening &&
      await Financial.findOne({
        linkedChartAccountCode: account.accountCode,
        currency: { $ne: "JMD" },
      }).session(session)
    ) {
      fail(
        "Foreign-currency financial accounts require a native-currency workflow, not an ordinary manual journal."
      );
    }

    lines.push({
      accountCode: account.accountCode,
      accountName: account.accountName,
      debit,
      credit,
      description: String(raw.description || "").trim(),
    });

    debitTotal += Math.round(debit * 100);
    creditTotal += Math.round(credit * 100);
  }

  if (
    !Number.isSafeInteger(debitTotal) ||
    debitTotal !== creditTotal ||
    debitTotal <= 0
  ) {
    fail(
      "Debits and credits must be equal and greater than zero.",
      400
    );
  }

  return {
    lines,
    totalDebit: debitTotal / 100,
    totalCredit: creditTotal / 100,
  };
};

const cleanDraft = (body) => ({
  entryDate: date(body.entryDate),
  entityCode: String(body.entityCode || "").trim(),
  memo: String(body.memo || "").trim(),
  reference: String(body.reference || "").trim(),
  branch: branch(body.branch),
});

const openingPlan = async (
  body,
  session,
  ownEntryNumber = ""
) => {
  const draft = cleanDraft(body);

  if (!draft.memo) {
    fail("An explanation is required.", 400);
  }

  const attribution = await context(
    draft.entityCode,
    draft.entryDate,
    session
  );

  await validateAccountingPeriodOpen(
    draft.entryDate,
    session
  );

  const accountCode = String(body.accountCode || "").trim();

  const account = await Chart.findOne({
    accountCode,
    status: "Active",
  }).session(session);

  const offset = await Chart.findOne({
    accountCode: String(body.offsetAccountCode || "").trim(),
    status: "Active",
  }).session(session);

  if (
    !account ||
    !offset ||
    account.accountCode === offset.accountCode ||
    offset.accountCategory !== "Equity" ||
    offset.allowManualEntries === false
  ) {
    fail(
      "Select an active target account and a different, permitted equity offset account."
    );
  }

  const claim = await Journal.findOne({
    openingAccountCode: accountCode,
  }).session(session);

  if (claim && claim.entryNumber !== ownEntryNumber) {
    fail(
      `This account already has opening entry ${claim.entryNumber}. Review it rather than creating another.`
    );
  }

  if (
    await Ledger.findOne({ accountCode }).session(session)
  ) {
    fail(
      "This account already has ledger activity. Use a reviewed correction, not a new opening balance."
    );
  }

  if (
    amount(account.currentBalance) !== 0 ||
    amount(account.openingBalance) !== 0
  ) {
    fail(
      "This account already has a recorded balance and needs reconciliation before an opening entry."
    );
  }

  const financials = await Financial.find({
    linkedChartAccountCode: accountCode,
  }).session(session);

  if (financials.length > 1) {
    fail(
      "Multiple financial accounts share this chart code. Review their links first."
    );
  }

  const financial = financials[0] || null;

  const currency = financial
    ? String(financial.currency || "JMD").toUpperCase()
    : "JMD";

  if (
    financial &&
    String(financial.baseCurrency || "JMD").toUpperCase() !== "JMD"
  ) {
    fail(
      "This account does not use the JMD base currency and needs review."
    );
  }

  if (!["JMD", "USD"].includes(currency)) {
    fail("This opening workflow supports JMD and USD accounts.");
  }

  if (
    financial &&
    (
      financial.status !== "Active" ||
      [
        financial.openingBalance,
        financial.currentBalance,
        financial.baseCurrencyOpeningBalance,
        financial.baseCurrencyBalance,
      ].some((value) => amount(value ?? 0) !== 0)
    )
  ) {
    fail(
      "The financial account must have zero native and base-currency balances before its first opening."
    );
  }

  const nativeBalance = amount(body.nativeBalance);

  const exchangeRate = currency === "JMD"
    ? 1
    : Number(body.exchangeRate);

  if (
    !nativeBalance ||
    !Number.isFinite(exchangeRate) ||
    exchangeRate <= 0
  ) {
    fail(
      "Enter a nonzero native balance and a positive exchange rate.",
      400
    );
  }

  const baseBalance = amount(nativeBalance * exchangeRate);

  if (!baseBalance) {
    fail("The JMD equivalent must not round to zero.", 400);
  }

  const targetDebit =
    (account.normalBalance === "Debit") === (baseBalance > 0);

  const value = Math.abs(baseBalance);

  const prepared = await validateLines(
    [
      {
        accountCode: account.accountCode,
        debit: targetDebit ? value : 0,
        credit: targetDebit ? 0 : value,
        description:
          `${currency} opening balance; JMD rate ${exchangeRate}`,
      },
      {
        accountCode: offset.accountCode,
        debit: targetDebit ? 0 : value,
        credit: targetDebit ? value : 0,
        description: draft.memo,
      },
    ],
    session,
    true
  );

  return {
    ...draft,
    ...attribution,
    ...prepared,
    financial,
    openingDetails: {
      accountCode,
      accountNumber: financial?.accountNumber || "",
      offsetAccountCode: offset.accountCode,
      currency,
      nativeBalance,
      exchangeRate,
      baseBalance,
    },
  };
};

const audit = (req, session, action, entry) =>
  writeAuditLog({
    req,
    session,
    action,
    module: "Journal Entries",
    description: `${action}: ${entry.entryNumber}`,
    targetType: "JournalEntry",
    targetId: entry.entryNumber,
    metadata: {
      entryKind: entry.entryKind,
      entityCode: entry.entityCode,
    },
  });

let indexReady;

const ensureDraftIndexes = async () => {
  if (!indexReady) {
    indexReady = (async () => {
      await Journal.collection.createIndex(
        { manualRequestId: 1 },
        {
          name: "unique_reviewed_journal_request",
          unique: true,
          partialFilterExpression: {
            manualRequestId: { $type: "string" },
          },
        }
      );

      await Journal.collection.createIndex(
        { openingAccountCode: 1 },
        {
          name: "unique_account_opening_entry",
          unique: true,
          partialFilterExpression: {
            openingAccountCode: { $type: "string" },
          },
        }
      );
    })().catch((error) => {
      indexReady = null;
      throw error;
    });
  }

  await indexReady;
};

const previewOpening = async ({ body, user }) => {
  admin(user);

  const plan = await mongoose.connection.transaction(
    (session) => openingPlan(body, session)
  );

  const { financial, ...preview } = plan;
  return preview;
};

const saveDraft = async ({
  body,
  user,
  req,
  isOpening = false,
}) => {
  if (isOpening) admin(user);
  else finance(user);

  const requestId = String(body.manualRequestId || "").trim();

  if (!/^[A-Za-z0-9-]{16,128}$/.test(requestId)) {
    fail(
      "A valid journal request ID is required. Refresh the page and retry.",
      400
    );
  }

  if (
    !isOpening &&
    body.sourceModule &&
    body.sourceModule !== "Manual"
  ) {
    fail("Ordinary drafts use the Manual source.", 400);
  }

  await ensureDraftIndexes();

  if (!isOpening && !Array.isArray(body.lines)) {
    fail("Journal lines must be an array.", 400);
  }

  const payload = {
    ...cleanDraft(body),
    entryKind: isOpening ? "Opening Balance" : "Manual",
  };

  if (!payload.memo) {
    fail("A memo is required.", 400);
  }

  if (isOpening) {
    Object.assign(payload, {
      accountCode: String(body.accountCode || "").trim(),
      offsetAccountCode:
        String(body.offsetAccountCode || "").trim(),
      nativeBalance: amount(body.nativeBalance),
      exchangeRate: Number(body.exchangeRate),
    });
  } else {
    payload.lines = body.lines.map((line) => ({
      accountCode: String(line.accountCode || "").trim(),
      debit: amount(line.debit ?? 0),
      credit: amount(line.credit ?? 0),
      description: String(line.description || "").trim(),
    }));
  }

  const hash = crypto
    .createHash("sha256")
    .update(JSON.stringify(payload))
    .digest("hex");

  return mongoose.connection.transaction(async (session) => {
    const previous = await Journal.findOne({
      manualRequestId: requestId,
    }).session(session);

    if (previous) {
      if (previous.manualRequestHash !== hash) {
        fail(
          "This request ID already belongs to a different draft. Refresh before starting a new draft."
        );
      }

      return previous;
    }

    const plan = isOpening
      ? await openingPlan(body, session)
      : {
          ...await context(
            payload.entityCode,
            payload.entryDate,
            session
          ),
          ...await validateLines(payload.lines, session),
        };

    const [entry] = await Journal.create(
      [
        {
          entryNumber: `JE-DRAFT-${crypto.randomUUID()}`,
          entryDate: payload.entryDate,
          memo: payload.memo,
          reference: payload.reference,
          sourceModule: isOpening ? "Opening Balance" : "Manual",
          entryKind: payload.entryKind,
          branch: payload.branch,
          entityId: plan.entityId,
          entityCode: plan.entityCode,
          entitySnapshot: plan.entitySnapshot,
          lines: plan.lines,
          totalDebit: plan.totalDebit,
          totalCredit: plan.totalCredit,
          status: "Draft",
          locked: false,
          createdBy: who(user),
          manualRequestId: requestId,
          manualRequestHash: hash,
          ...(
            isOpening
              ? {
                  openingAccountCode:
                    plan.openingDetails.accountCode,
                  openingDetails: plan.openingDetails,
                  sourceDocumentType: plan.financial
                    ? "FinancialAccount"
                    : "ChartOfAccount",
                  sourceDocumentNumber:
                    plan.openingDetails.accountNumber ||
                    plan.openingDetails.accountCode,
                }
              : {}
          ),
        },
      ],
      { session }
    );

    await audit(
      req,
      session,
      "SAVE_JOURNAL_DRAFT",
      entry
    );

    return entry;
  });
};

const validateEntry = async (entry, user, session) => {
  checkKind(entry, user);

  const resolved = await context(
    entry.entityCode,
    date(entry.entryDate),
    session
  );

  if (
    String(entry.entityId || "") !==
    String(resolved.entityId)
  ) {
    fail(
      "This journal's business identity needs review before posting."
    );
  }

  if (opening(entry)) {
    const plan = await openingPlan(
      {
        ...entry.openingDetails,
        entityCode: entry.entityCode,
        entryDate: entry.entryDate,
        memo: entry.memo,
        reference: entry.reference,
        branch: entry.branch,
      },
      session,
      entry.entryNumber
    );

    const storedLines = entry.lines.map((line) => ({
      accountCode: line.accountCode,
      accountName: line.accountName,
      debit: line.debit,
      credit: line.credit,
      description: line.description,
    }));

    if (
      JSON.stringify(plan.lines) !== JSON.stringify(storedLines)
    ) {
      fail(
        "The opening preview changed. Review the account configuration before proceeding."
      );
    }

    return plan;
  }

  return validateLines(entry.lines, session);
};

const changeStatus = async ({
  entryNumber,
  user,
  req,
  action,
}) =>
  mongoose.connection.transaction(async (session) => {
    if (action !== "submit") admin(user);
    else finance(user);

    const entry = await Journal.findOne({
      entryNumber,
    }).session(session);

    checkKind(entry, user);

    const target = action === "submit"
      ? "Pending Approval"
      : "Approved";

    if (entry.status === target) return entry;

    const expected = action === "submit"
      ? "Draft"
      : "Pending Approval";

    if (entry.status !== expected || entry.locked) {
      fail(`Only ${expected} entries can receive this action.`);
    }

    const prepared = await validateEntry(entry, user, session);

    entry.totalDebit = prepared.totalDebit;
    entry.totalCredit = prepared.totalCredit;
    entry.status = target;

    if (action === "approve") {
      entry.approvedBy = who(user);
      entry.approvedAt = new Date();
    }

    await entry.save({ session });

    await audit(
      req,
      session,
      action === "submit" ? "SUBMIT_JOURNAL" : "APPROVE_JOURNAL",
      entry
    );

    return entry;
  });

const post = async ({ entryNumber, user, req }) =>
  mongoose.connection.transaction(async (session) => {
    admin(user);

    const entry = await Journal.findOne({
      entryNumber,
    }).session(session);

    checkKind(entry, user);

    if (entry.status === "Posted") return entry;

    if (
      entry.status !== "Approved" ||
      !entry.approvedBy ||
      !entry.approvedAt
    ) {
      fail("Approve this journal before posting it.");
    }

    const plan = await validateEntry(entry, user, session);

    const result = await postApprovedJournalEntry({
      entryNumber,
      postedBy: who(user),
      session,
      skipFinancialSyncForCodes: opening(entry)
        ? [entry.openingAccountCode]
        : [],
    });

    if (opening(entry)) {
      const details = entry.openingDetails;

      await Chart.updateOne(
        { accountCode: details.accountCode },
        { $set: { openingBalance: details.baseBalance } },
        { session }
      );

      if (plan.financial) {
        plan.financial.openingBalance = details.nativeBalance;
        plan.financial.currentBalance = details.nativeBalance;
        plan.financial.exchangeRate = details.exchangeRate;
        plan.financial.baseCurrencyOpeningBalance =
          details.baseBalance;
        plan.financial.baseCurrencyBalance =
          details.baseBalance;

        await plan.financial.save({ session });
      }
    }

    await audit(
      req,
      session,
      "POST_REVIEWED_JOURNAL",
      result
    );

    return result;
  });

const reverse = async ({
  entryNumber,
  user,
  req,
  body,
}) =>
  mongoose.connection.transaction(async (session) => {
    admin(user);

    const entry = await Journal.findOne({
      entryNumber,
    }).session(session);

    checkKind(entry, user);

    if (
      entry.status === "Reversed" &&
      entry.reversalEntryNumber
    ) {
      return entry;
    }

    if (entry.status !== "Posted") {
      fail("Only posted manual journals can be reversed.");
    }

    const reason = String(body.reversalReason || "").trim();

    if (reason.length < 10 || reason.length > 1000) {
      fail(
        "Enter a reversal reason of 10–1000 characters.",
        400
      );
    }

    const reversalDate = date(body.reversalDate || today());

    if (reversalDate < entry.entryDate) {
      fail("Reversal date cannot precede the original journal.");
    }

    await context(entry.entityCode, reversalDate, session);

    const originalLedger = await Ledger.find({
      entryNumber,
    }).session(session);

    const signature = (lines) =>
      JSON.stringify(
        lines
          .map((line) => [
            line.accountCode,
            amount(line.debit || 0),
            amount(line.credit || 0),
          ])
          .sort((a, b) =>
            JSON.stringify(a).localeCompare(JSON.stringify(b))
          )
      );

    if (
      signature(originalLedger) !== signature(entry.lines || [])
    ) {
      fail(
        "The original journal and ledger lines disagree. Review before reversing."
      );
    }

    let financial = null;

    if (opening(entry)) {
      const details = entry.openingDetails;

      if (
        await Ledger.findOne({
          accountCode: details.accountCode,
          entryNumber: { $ne: entryNumber },
        }).session(session)
      ) {
        fail(
          "This opening has subsequent ledger activity. Use a reviewed correction instead of a simple reversal."
        );
      }

      const chart = await Chart.findOne({
        accountCode: details.accountCode,
      }).session(session);

      if (
        !chart ||
        amount(chart.currentBalance) !==
          amount(details.baseBalance)
      ) {
        fail(
          "The opening account balance needs reconciliation before reversal."
        );
      }

      if (details.accountNumber) {
        financial = await Financial.findOne({
          accountNumber: details.accountNumber,
        }).session(session);

        if (
          !financial ||
          amount(financial.currentBalance) !==
            amount(details.nativeBalance) ||
          amount(financial.baseCurrencyBalance) !==
            amount(details.baseBalance)
        ) {
          fail(
            "Native opening balances need reconciliation before reversal."
          );
        }
      }
    }

    if (
      !opening(entry) &&
      await Financial.findOne({
        linkedChartAccountCode: {
          $in: entry.lines.map((line) => line.accountCode),
        },
        currency: { $ne: "JMD" },
      }).session(session)
    ) {
      fail(
        "This journal affects a foreign-currency financial account and requires a reviewed native-currency correction."
      );
    }

    const reversal = await postJournalEntry({
      session,
      entryDate: reversalDate,
      memo: `Reversal of ${entryNumber}: ${reason}`,
      reference: entry.reference,
      sourceModule: "Journal Reversal",
      entityId: entry.entityId,
      entityCode: entry.entityCode,
      entitySnapshot: entry.entitySnapshot,
      createdBy: who(user),
      lines: entry.lines.map((line) => ({
        accountCode: line.accountCode,
        debit: line.credit,
        credit: line.debit,
        description: `Reversal of ${entryNumber}`,
      })),
    });

    reversal.entryKind = "Manual Reversal";
    reversal.branch = entry.branch || "";
    reversal.postedBy = who(user);
    reversal.postedAt = new Date();
    reversal.locked = true;
    reversal.sourceDocumentType = "JournalEntry";
    reversal.sourceDocumentNumber = entryNumber;

    await reversal.save({ session });

    await Ledger.updateMany(
      { entryNumber: reversal.entryNumber },
      {
        $set: {
          isReversal: true,
          branch: entry.branch || "",
          postedBy: who(user),
          postedAt: reversal.postedAt,
          sourceDocumentType: "JournalEntry",
          sourceDocumentNumber: entryNumber,
        },
      },
      { session }
    );

    entry.status = "Reversed";
    entry.reversedBy = who(user);
    entry.reversedAt = new Date();
    entry.reversalEntryNumber = reversal.entryNumber;
    entry.reversalReason = reason;
    entry.locked = true;

    await entry.save({ session });

    if (financial) {
      financial.currentBalance = 0;
      financial.baseCurrencyBalance = 0;
      await financial.save({ session });
    }

    await audit(
      req,
      session,
      "REVERSE_MANUAL_JOURNAL",
      entry
    );

    return entry;
  });

const discard = async ({ entryNumber, user, req }) =>
  mongoose.connection.transaction(async (session) => {
    admin(user);

    const entry = await Journal.findOne({
      entryNumber,
    }).session(session);

    checkKind(entry, user);

    if (
      entry.status !== "Draft" ||
      entry.locked ||
      await Ledger.findOne({ entryNumber }).session(session)
    ) {
      fail("Only an unposted draft can be discarded.");
    }

    await audit(
      req,
      session,
      "DISCARD_JOURNAL_DRAFT",
      entry
    );

    await Journal.deleteOne(
      { _id: entry._id },
      { session }
    );

    return entry;
  });

module.exports = {
  previewOpening,
  saveDraft,
  changeStatus,
  post,
  reverse,
  discard,
};