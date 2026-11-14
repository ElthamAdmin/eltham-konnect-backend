const { randomUUID, createHash } = require("crypto");
const mongoose = require("mongoose");

const JournalEntry = require("../../models/JournalEntry");
const GeneralLedgerTransaction = require("../../models/GeneralLedgerTransaction");
const AccountTransaction = require("../../models/AccountTransaction");
const BankReconciliation = require("../../models/BankReconciliation");

const {
  postApprovedJournalEntry,
} = require("./journalService");

const {
  writeFinanceAuditLog,
} = require("../../utils/financeAuditHelper");

const FinancialAdjustmentBatch = require("../../models/FinancialAdjustmentBatch");
const FinancialAccount = require("../../models/FinancialAccount");
const ChartOfAccount = require("../../models/ChartOfAccount");
const BusinessEntity = require("../../models/BusinessEntity");

const {
  buildFinancialPositionReview,
} = require("./financialPositionReviewService");

const fail = (message, statusCode = 400) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  throw error;
};

const text = (value) =>
  typeof value === "string" ? value.trim() : "";

const getAdministrator = (user) => {
  if (user?.role !== "Admin") {
    fail("Owner/Admin access is required.", 403);
  }

  const id = String(user._id || user.id || "").trim();

  if (!id) {
    fail("An identified administrator is required.", 403);
  }

  return {
    id,
    name: user.fullName || user.name || user.email || id,
  };
};

const normalizeReferences = (value) => {
  if (
    !Array.isArray(value) ||
    value.some((item) => typeof item !== "string")
  ) {
    fail("Evidence references must be an array of text references.");
  }

  return [...new Set(value.map(text).filter(Boolean))];
};

const digest = (value) =>
  createHash("sha256")
    .update(JSON.stringify(value))
    .digest("hex");

const toCents = (value) => {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value)
  ) {
    fail("A required reviewed balance is unavailable.");
  }

  const cents = Math.round(value * 100);

  if (
    !Number.isSafeInteger(cents) ||
    Math.abs(value * 100 - cents) > 0.000001
  ) {
    fail(
      "Balances must be safe amounts with no more than two decimal places."
    );
  }

  return cents;
};

const validDate = (value) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const parsed = new Date(`${value}T00:00:00.000Z`);

  return (
    Number.isFinite(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value
  );
};

const validateAdjustmentEntity = async ({
  entityCode,
  effectiveDate,
  session = null,
}) => {
  const entity = await BusinessEntity.findOne({
    entityCode,
  }).session(session);

  if (!entity) {
    fail("The proposed business entity was not found.", 404);
  }

  const start = text(entity.effectiveFrom);
  const end = text(entity.effectiveTo);

  if (
    !validDate(effectiveDate) ||
    !validDate(start) ||
    (end && !validDate(end)) ||
    (end && start > end)
  ) {
    fail(
      "The adjustment date or business entity effective dates are invalid."
    );
  }

  if (
    effectiveDate < start ||
    (end && effectiveDate > end)
  ) {
    fail(
      "The adjustment date is outside this business entity's effective dates."
    );
  }

  if (
    entity.lifecycleStatus !== "Active" ||
    !text(entity.trn)
  ) {
    fail(
      "The business entity must be Active with a TRN before preparing an adjustment.",
      409
    );
  }

  if (
    entity.entityType === "Limited Liability Company"
  ) {
    const approvalDate = entity.transition?.approvedAt;

    if (
      !text(entity.registrationNumber) ||
      !text(entity.transition?.approvedBy) ||
      !approvalDate ||
      !Number.isFinite(new Date(approvalDate).getTime())
    ) {
      fail(
        "LLC adjustments require registration details and recorded transition approval. The calendar date alone does not activate the LLC.",
        409
      );
    }
  }

  return entity;
};

const buildPositionPreview = async ({
  effectiveDate,
  actualBalances = [],
} = {}) => {
  const review = await buildFinancialPositionReview({
    effectiveDate,
    actualBalances,
  });

  return review.rows;
};

const createAdjustmentBatch = async ({
  effectiveDate,
  description = "",
  adjustmentReason,
  businessEntityCode,
  evidenceReferences = [],
  actualBalances = [],
  user = null,
} = {}) => {
  const administrator = getAdministrator(user);
  const reason = text(adjustmentReason);
  const entityCode = text(businessEntityCode);

  if (!reason) {
    fail("An adjustment reason is required.");
  }

  if (!entityCode) {
    fail("A proposed business entity code is required for review.");
  }

  if (
    !Array.isArray(actualBalances) ||
    !actualBalances.length
  ) {
    fail(
      "Supply the accounts and verified actual balances for this draft."
    );
  }

    await validateAdjustmentEntity({
    entityCode,
    effectiveDate,
  });

  const batchEvidence = normalizeReferences(evidenceReferences);

  // The review validates the date, supplied amounts and account mappings.
  // It does not change account balances.
  const review = await buildFinancialPositionReview({
    effectiveDate,
    actualBalances,
  });

  const rows = new Map(
    review.rows.map((row) => [row.accountNumber, row])
  );

  const seen = new Set();
  const lines = [];

  for (const input of actualBalances) {
    const accountNumber = text(input?.accountNumber);

    if (!accountNumber || seen.has(accountNumber)) {
      fail("Each account must appear once.");
    }

    seen.add(accountNumber);

    const row = rows.get(accountNumber);

    if (!row) {
      fail(
        `Account ${accountNumber} was not returned by the review.`
      );
    }

    const actualBaseCents = toCents(row.actualBaseBalance);
    const ledgerBaseCents = toCents(row.ledgerBaseBalance);

    if (!["JMD", "USD"].includes(row.currency)) {
      fail(
        `Currency ${row.currency} is not supported for draft preparation.`
      );
    }

    // An actual native amount must be explicitly supplied.
    // An unknown historical USD ledger balance remains null.
    toCents(row.actualBalance);

    const differenceCents =
      actualBaseCents - ledgerBaseCents;

    if (!Number.isSafeInteger(differenceCents)) {
      fail(
        "The difference exceeds the supported amount range."
      );
    }

    if (differenceCents === 0) {
      continue;
    }

    if (
      row.difference === null ||
      row.difference === undefined ||
      toCents(row.difference) !== differenceCents
    ) {
      fail(
        `Resolve the account mapping or balance issues for ${accountNumber} first.`
      );
    }

    if (row.status !== "Active") {
      fail(`Account ${accountNumber} must be active.`);
    }

    const offsetCode = text(input.offsetChartAccountCode);
    const explanation = text(input.adjustmentExplanation);

    const lineEvidence = normalizeReferences(
      input.evidenceReferences || []
    );

    if (!offsetCode || !explanation) {
      fail(
        `Supply an offset ledger account and explanation for ${accountNumber}.`
      );
    }

    if (
      !batchEvidence.length &&
      !lineEvidence.length
    ) {
      fail(
        `Supply an evidence reference for ${accountNumber}.`
      );
    }

    const linkedFinancialAccount =
      await FinancialAccount.exists({
        linkedChartAccountCode: offsetCode,
      });

    if (linkedFinancialAccount) {
      fail(
        "A financial-account offset must be handled through the appropriate transfer workflow."
      );
    }

    const offset = await ChartOfAccount.findOne({
      accountCode: offsetCode,
      status: "Active",
    });

    if (
      !offset ||
      offset.allowManualEntries !== true
    ) {
      fail(
        `Offset account ${offsetCode} must be active and permit manual entries.`
      );
    }

    lines.push({
      accountNumber: row.accountNumber,
      accountName: row.accountName,
      accountType: row.accountType,
      linkedChartAccountCode: row.linkedChartAccountCode,
      currency: row.currency,

      // No exchange rate is inferred or applied here.
      exchangeRate: null,

      ledgerBalance: row.ledgerBalance,
      actualBalance: row.actualBalance,
      ledgerBaseBalance: row.ledgerBaseBalance,
      actualBaseBalance: row.actualBaseBalance,
      difference: differenceCents / 100,

      notes: text(input.notes),
      evidenceReferences: lineEvidence,

      offsetChartAccountCode: offset.accountCode,
      offsetChartAccountName: offset.accountName,
      adjustmentExplanation: explanation,
    });
  }

  if (!lines.length) {
    fail("No nonzero, reviewable differences were supplied.");
  }

  lines.sort((a, b) =>
    a.accountNumber.localeCompare(b.accountNumber)
  );

  const content = {
    effectiveDate: review.effectiveDate,
    description: text(description),
    adjustmentReason: reason,

    // Proposed attribution only. Approval must validate ownership.
    businessEntityCode: entityCode,

    evidenceReferences: batchEvidence,
    lines,
  };

  const contentHash = digest(content);

  return FinancialAdjustmentBatch.create({
    ...content,

    batchNumber: `ADJ-${randomUUID()}`,
    workflowVersion: 2,
    status: "Draft",
    baseCurrency: "JMD",

    createdBy: administrator.name,
    createdById: administrator.id,

    reviewGeneratedAt: review.generatedAt,
        reviewSnapshotHash: reviewFingerprint(review.rows, lines),
    contentHash,

    auditEvents: [
      {
        action: "DRAFT_CREATED",
        actorId: administrator.id,
        actorName: administrator.name,
        reason,
        contentHash,
      },
    ],
  });
};

const batchContent = (batch) => ({
  effectiveDate: batch.effectiveDate,
  description: batch.description,
  adjustmentReason: batch.adjustmentReason,
  businessEntityCode: batch.businessEntityCode,
  evidenceReferences: Array.from(batch.evidenceReferences || []),

  lines: Array.from(batch.lines || []).map((line) => ({
    accountNumber: line.accountNumber,
    accountName: line.accountName,
    accountType: line.accountType,
    linkedChartAccountCode: line.linkedChartAccountCode,
    currency: line.currency,
    exchangeRate: line.exchangeRate,
    ledgerBalance: line.ledgerBalance,
    actualBalance: line.actualBalance,
    ledgerBaseBalance: line.ledgerBaseBalance,
    actualBaseBalance: line.actualBaseBalance,
    difference: line.difference,
    notes: line.notes,
    evidenceReferences: Array.from(line.evidenceReferences || []),
    offsetChartAccountCode: line.offsetChartAccountCode,
    offsetChartAccountName: line.offsetChartAccountName,
    adjustmentExplanation: line.adjustmentExplanation,
  })),
});

const reviewFingerprint = (rows, lines) => {
  const byNumber = new Map(
    rows.map((row) => [row.accountNumber, row])
  );

  return digest(
    lines.map((line) => {
      const row = byNumber.get(line.accountNumber);

      if (!row) {
        fail(
          `Account ${line.accountNumber} is missing from the review.`,
          409
        );
      }

      return {
        accountNumber: row.accountNumber,
        accountName: row.accountName,
        accountType: row.accountType,
        status: row.status,
        linkedChartAccountCode: row.linkedChartAccountCode,
        currency: row.currency,
        baseCurrency: row.baseCurrency,
        ledgerBalance: row.ledgerBalance,
        actualBalance: row.actualBalance,
        ledgerBaseBalance: row.ledgerBaseBalance,
        actualBaseBalance: row.actualBaseBalance,
        difference: row.difference,
        ledgerLineCount: row.ledgerLineCount,
        recordedEntityCodes: row.recordedEntityCodes,
        issues: row.issues,
      };
    })
  );
};

const saveWorkflowChange = async (batch) => {
  try {
    return await batch.save();
  } catch (error) {
    if (error.name === "VersionError") {
      fail(
        "This batch changed. Reload it before continuing.",
        409
      );
    }

    throw error;
  }
};

const submitAdjustmentBatch = async ({
  batchNumber,
  user = null,
} = {}) => {
  const administrator = getAdministrator(user);

  const batch = await FinancialAdjustmentBatch.findOne({
    batchNumber: text(batchNumber),
  });

  if (!batch) {
    fail("Adjustment batch not found.", 404);
  }

  if (
    batch.workflowVersion !== 2 ||
    batch.status !== "Draft"
  ) {
    fail(
      "Only a new controlled draft can be submitted.",
      409
    );
  }

  if (
    !batch.lines.length ||
    digest(batchContent(batch)) !== batch.contentHash
  ) {
    fail(
      "The draft content no longer matches its recorded fingerprint. Cancel it and prepare a new draft.",
      409
    );
  }

  await validateAdjustmentEntity({
    entityCode: batch.businessEntityCode,
    effectiveDate: batch.effectiveDate,
  });

  const actualBalances = batch.lines.map((line) => ({
    accountNumber: line.accountNumber,
    actualBalance: line.actualBalance,
    actualBaseBalance: line.actualBaseBalance,
    notes: line.notes,
  }));

  const review = await buildFinancialPositionReview({
    effectiveDate: batch.effectiveDate,
    actualBalances,
  });

  if (
    reviewFingerprint(review.rows, batch.lines) !==
    batch.reviewSnapshotHash
  ) {
    fail(
      "Recorded balances or account mappings changed. Cancel this draft and prepare a new one from a refreshed review.",
      409
    );
  }

  for (const line of batch.lines) {
    const offset = await ChartOfAccount.findOne({
      accountCode: line.offsetChartAccountCode,
      status: "Active",
    });

    const linkedFinancialAccount =
      await FinancialAccount.exists({
        linkedChartAccountCode: line.offsetChartAccountCode,
      });

    if (
      !offset ||
      offset.allowManualEntries !== true ||
      offset.accountName !== line.offsetChartAccountName ||
      linkedFinancialAccount
    ) {
      fail(
        `Offset account ${line.offsetChartAccountCode} changed or is no longer eligible. Prepare a new draft.`,
        409
      );
    }
  }

  batch.status = "Submitted";
  batch.submittedBy = administrator.name;
  batch.submittedById = administrator.id;
  batch.submittedAt = new Date();

  batch.auditEvents.push({
    action: "DRAFT_SUBMITTED",
    actorId: administrator.id,
    actorName: administrator.name,
    reason:
      "Submitted for review; no approval or posting performed.",
    contentHash: batch.contentHash,
  });

  return saveWorkflowChange(batch);
};

const rejectAdjustmentBatch = async ({
  batchNumber,
  reason,
  user = null,
} = {}) => {
  const administrator = getAdministrator(user);
  const rejectionReason = text(reason);

  if (!rejectionReason) {
    fail("A rejection reason is required.");
  }

  const batch = await FinancialAdjustmentBatch.findOne({
    batchNumber: text(batchNumber),
  });

  if (!batch) {
    fail("Adjustment batch not found.", 404);
  }

  if (
    batch.workflowVersion !== 2 ||
    batch.status !== "Submitted"
  ) {
    fail(
      "Only a submitted controlled draft can be rejected.",
      409
    );
  }

  batch.status = "Rejected";
  batch.rejectedBy = administrator.name;
  batch.rejectedById = administrator.id;
  batch.rejectedAt = new Date();
  batch.rejectionReason = rejectionReason;

  batch.auditEvents.push({
    action: "DRAFT_REJECTED",
    actorId: administrator.id,
    actorName: administrator.name,
    reason: rejectionReason,
    contentHash: batch.contentHash,
  });

  return saveWorkflowChange(batch);
};

const approveAdjustmentBatch = async ({
  batchNumber,
  expectedContentHash,
  evidenceReviewed = false,
  ownershipReview = [],
  notes = "",
  user = null,
} = {}) => {
  const administrator = getAdministrator(user);

  if (
    evidenceReviewed !== true ||
    !text(notes)
  ) {
    fail(
      "Confirm that you reviewed the evidence and enter approval notes."
    );
  }

  const batch = await FinancialAdjustmentBatch.findOne({
    batchNumber: text(batchNumber),
  });

  if (!batch) {
    fail("Adjustment batch not found.", 404);
  }

  if (
    batch.workflowVersion !== 2 ||
    batch.status !== "Submitted"
  ) {
    fail(
      "Only a submitted controlled draft can be approved.",
      409
    );
  }

  const content = batchContent(batch);

  if (
    !batch.lines.length ||
    !batch.contentHash ||
    text(expectedContentHash) !== batch.contentHash ||
    digest(content) !== batch.contentHash
  ) {
    fail(
      "The draft changed or does not match the version you reviewed. Reload before approving.",
      409
    );
  }

  if (
    batch.lines.some((line) => line.currency !== "JMD")
  ) {
    fail(
      "USD adjustment approval is unavailable until historical native balances and currency posting are verified.",
      409
    );
  }

  await validateAdjustmentEntity({
    entityCode: batch.businessEntityCode,
    effectiveDate: batch.effectiveDate,
  });

  if (
    !Array.isArray(ownershipReview) ||
    ownershipReview.length !== batch.lines.length
  ) {
    fail(
      "Supply an ownership review for every account in the batch."
    );
  }

  const supplied = new Map();

  for (const item of ownershipReview) {
    const accountNumber = text(item?.accountNumber);

    if (
      !accountNumber ||
      supplied.has(accountNumber)
    ) {
      fail(
        "Each ownership review account must appear once."
      );
    }

    if (
      item.ownershipConfirmed !== true ||
      text(item.entityCode) !== batch.businessEntityCode
    ) {
      fail(
        "Explicitly confirm each account's ownership by the selected business entity."
      );
    }

    const evidenceReferences = normalizeReferences(
      item.evidenceReferences || []
    );

    if (
      !evidenceReferences.length ||
      !text(item.notes)
    ) {
      fail(
        `Ownership review for ${accountNumber} requires evidence references and notes.`
      );
    }

    supplied.set(accountNumber, {
      accountNumber,
      entityCode: batch.businessEntityCode,
      evidenceReferences,
      notes: text(item.notes),
    });
  }

  const reviewedOwnership = batch.lines.map((line) => {
    const item = supplied.get(line.accountNumber);

    if (!item) {
      fail(
        `Ownership review is missing for ${line.accountNumber}.`
      );
    }

    return item;
  });

  const review = await buildFinancialPositionReview({
    effectiveDate: batch.effectiveDate,

    actualBalances: batch.lines.map((line) => ({
      accountNumber: line.accountNumber,
      actualBalance: line.actualBalance,
      actualBaseBalance: line.actualBaseBalance,
      notes: line.notes,
    })),
  });

  if (
    reviewFingerprint(review.rows, batch.lines) !==
    batch.reviewSnapshotHash
  ) {
    fail(
      "Balances or account mappings changed after draft preparation. Reject this batch and prepare a new draft.",
      409
    );
  }

  for (const line of batch.lines) {
    const offset = await ChartOfAccount.findOne({
      accountCode: line.offsetChartAccountCode,
      status: "Active",
    });

    const financialOffset =
      await FinancialAccount.exists({
        linkedChartAccountCode:
          line.offsetChartAccountCode,
      });

    if (
      !offset ||
      offset.allowManualEntries !== true ||
      offset.accountName !== line.offsetChartAccountName ||
      financialOffset
    ) {
      fail(
        `Offset account ${line.offsetChartAccountCode} changed or is no longer eligible.`,
        409
      );
    }
  }

  batch.ownershipReview = reviewedOwnership;
  batch.approvalNotes = text(notes);

  batch.approvedContentHash = digest({
    content,
    ownershipReview: reviewedOwnership,
    approvalNotes: batch.approvalNotes,
  });

  batch.status = "Approved";
  batch.approvedBy = administrator.name;
  batch.approvedById = administrator.id;
  batch.approvedAt = new Date();

  batch.auditEvents.push({
    action: "BATCH_APPROVED",
    actorId: administrator.id,
    actorName: administrator.name,
    reason: batch.approvalNotes,
    contentHash: batch.approvedContentHash,
  });

  return saveWorkflowChange(batch);
};

const postAdjustmentBatch = async ({
  batchNumber,
  expectedApprovedContentHash,
  user = null,
  req = null,
} = {}) => {
  const administrator = getAdministrator(user);
  const number = text(batchNumber);

  if (!number || !text(expectedApprovedContentHash)) {
    fail(
      "A batch number and the reviewed approval fingerprint are required."
    );
  }

  const indexes = await JournalEntry.collection.indexes();

  const hasRequiredIndex = indexes.some(
    (index) =>
      index.name ===
        "unique_financial_adjustment_batch_journal" &&
      index.unique === true &&
      index.key?.adjustmentBatchNumber === 1 &&
      index.partialFilterExpression
        ?.adjustmentBatchNumber?.$type === "string"
  );

  if (!hasRequiredIndex) {
    fail(
      "The adjustment journal uniqueness index must be installed before posting is enabled.",
      409
    );
  }

  return mongoose.connection.transaction(
    async (session) => {
      const batch = await FinancialAdjustmentBatch.findOne({
        batchNumber: number,
      }).session(session);

      if (!batch) {
        fail("Adjustment batch not found.", 404);
      }

      if (batch.workflowVersion !== 2) {
        fail(
          "Historical batches cannot be posted through this workflow.",
          409
        );
      }

      const content = batchContent(batch);

      const ownershipReview = Array.from(
        batch.ownershipReview || []
      ).map((item) => ({
        accountNumber: item.accountNumber,
        entityCode: item.entityCode,
        evidenceReferences: Array.from(
          item.evidenceReferences || []
        ),
        notes: item.notes,
      }));

      const approvedHash = digest({
        content,
        ownershipReview,
        approvalNotes: batch.approvalNotes,
      });

      if (
        !batch.contentHash ||
        digest(content) !== batch.contentHash ||
        !batch.approvedContentHash ||
        approvedHash !== batch.approvedContentHash ||
        text(expectedApprovedContentHash) !==
          batch.approvedContentHash
      ) {
        fail(
          "The approved content changed or does not match the version you reviewed.",
          409
        );
      }

      // A repeated request returns the existing result.
      if (batch.status === "Posted") {
        const journalEntry = await JournalEntry.findOne({
          entryNumber: batch.journalEntryNumber,
          adjustmentBatchNumber: number,
          status: "Posted",
        }).session(session);

        if (!journalEntry) {
          fail(
            "The posted batch journal requires investigation.",
            409
          );
        }

        return {
          batch,
          journalEntry,
          alreadyPosted: true,
        };
      }

      if (
        batch.status !== "Approved" ||
        !batch.approvedById ||
        !batch.approvedBy ||
        !batch.approvedAt ||
        !batch.lines.length ||
        batch.lines.some(
          (line) => line.currency !== "JMD"
        )
      ) {
        fail(
          "Only an approved JMD batch with recorded approval details can be posted.",
          409
        );
      }

      const ownershipAccounts = new Set(
        ownershipReview.map((item) => item.accountNumber)
      );

      if (
        ownershipReview.length !== batch.lines.length ||
        ownershipAccounts.size !== batch.lines.length ||
        batch.lines.some(
          (line) =>
            !ownershipReview.some(
              (item) =>
                item.accountNumber === line.accountNumber &&
                item.entityCode === batch.businessEntityCode &&
                item.evidenceReferences.length > 0 &&
                text(item.notes)
            )
        )
      ) {
        fail(
          "The account ownership review is incomplete.",
          409
        );
      }

      const existingJournal = await JournalEntry.exists({
        adjustmentBatchNumber: number,
      }).session(session);

      const existingTransaction =
        await AccountTransaction.exists({
          adjustmentBatchNumber: number,
        }).session(session);

      if (existingJournal || existingTransaction) {
        fail(
          "Posting records already exist for this batch. Investigate before continuing.",
          409
        );
      }

      const entity = await validateAdjustmentEntity({
        entityCode: batch.businessEntityCode,
        effectiveDate: batch.effectiveDate,
        session,
      });

      const review = await buildFinancialPositionReview({
        effectiveDate: batch.effectiveDate,
        session,

        actualBalances: batch.lines.map((line) => ({
          accountNumber: line.accountNumber,
          actualBalance: line.actualBalance,
          actualBaseBalance: line.actualBaseBalance,
          notes: line.notes,
        })),
      });

      if (
        reviewFingerprint(review.rows, batch.lines) !==
        batch.reviewSnapshotHash
      ) {
        fail(
          "Balances or account mappings changed. This approval cannot be posted.",
          409
        );
      }

      const codes = [
        ...new Set(
          batch.lines.flatMap((line) => [
            line.linkedChartAccountCode,
            line.offsetChartAccountCode,
          ])
        ),
      ];

      const charts = new Map();

      // Verify stored current totals against the full recorded ledger.
      for (const code of codes) {
        const chart = await ChartOfAccount.findOne({
          accountCode: code,
          status: "Active",
        }).session(session);

        if (
          !chart ||
          !["Debit", "Credit"].includes(chart.normalBalance)
        ) {
          fail(
            `Active ledger account ${code} has no valid normal balance.`,
            409
          );
        }

        const ledger = await GeneralLedgerTransaction.find({
          accountCode: code,
        })
          .session(session)
          .lean();

        let signedCents = 0;

        for (const item of ledger) {
          if (!validDate(item.entryDate)) {
            fail(
              `Ledger account ${code} has an invalid entry date.`,
              409
            );
          }

          const debit = toCents(item.debit);
          const credit = toCents(item.credit);

          if (
            debit < 0 ||
            credit < 0 ||
            (debit > 0 && credit > 0)
          ) {
            fail(
              `Ledger account ${code} has a line requiring review.`,
              409
            );
          }

          if (
            text(item.entityCode) &&
            text(item.entityCode) !== batch.businessEntityCode
          ) {
            fail(
              `Ledger account ${code} contains another business entity's activity.`,
              409
            );
          }

          signedCents += debit - credit;

          if (!Number.isSafeInteger(signedCents)) {
            fail(
              "The ledger total exceeds the supported amount range."
            );
          }
        }

        const currentCents =
          chart.normalBalance === "Debit"
            ? signedCents
            : -signedCents;

        if (
          toCents(chart.currentBalance) !== currentCents
        ) {
          fail(
            `Stored balance for ledger account ${code} disagrees with its ledger. No repair was performed.`,
            409
          );
        }

        charts.set(code, {
          chart,
          currentCents,
        });
      }

      const financialAccounts = new Map();
      const journalLines = [];

      for (const line of batch.lines) {
        const account = await FinancialAccount.findOne({
          accountNumber: line.accountNumber,
        }).session(session);

        if (
          !account ||
          account.status !== "Active" ||
          account.currency !== "JMD" ||
          account.baseCurrency !== "JMD" ||
          account.linkedChartAccountCode !==
            line.linkedChartAccountCode
        ) {
          fail(
            `Financial account ${line.accountNumber} changed or is not eligible.`,
            409
          );
        }

        const links =
          await FinancialAccount.countDocuments({
            linkedChartAccountCode:
              line.linkedChartAccountCode,
          }).session(session);

        if (links !== 1) {
          fail(
            `Ledger link for ${line.accountNumber} is not exclusive.`,
            409
          );
        }

        const financialOffset =
          await FinancialAccount.exists({
            linkedChartAccountCode:
              line.offsetChartAccountCode,
          }).session(session);

        if (financialOffset) {
          fail(
            "A financial account cannot be used as the offset in this workflow.",
            409
          );
        }

        const target = charts.get(
          line.linkedChartAccountCode
        );

        const offset = charts.get(
          line.offsetChartAccountCode
        ).chart;

        const expectedNormal =
          account.accountType === "Credit Card"
            ? "Credit"
            : "Debit";

        const expectedCategory =
          account.accountType === "Credit Card"
            ? "Liability"
            : "Asset";

        if (
          !["Bank", "Cash", "Credit Card"].includes(
            account.accountType
          ) ||
          target.chart.normalBalance !== expectedNormal ||
          target.chart.accountCategory !== expectedCategory ||
          offset.allowManualEntries !== true ||
          offset.accountName !== line.offsetChartAccountName
        ) {
          fail(
            "A target classification or offset account changed.",
            409
          );
        }

        if (
          toCents(account.currentBalance) !==
            target.currentCents ||
          toCents(account.baseCurrencyBalance) !==
            target.currentCents
        ) {
          fail(
            `Financial account ${line.accountNumber} disagrees with its current ledger. No balance was overwritten.`,
            409
          );
        }

        const finalizedReconciliation =
          await BankReconciliation.exists({
            accountNumber: account.accountNumber,
            status: "Finalized",
            statementDate: {
              $gte: batch.effectiveDate,
            },
          }).session(session);

        if (
          account.reconciliationStatus === "In Progress" ||
          (account.lastReconciledDate &&
            (!validDate(account.lastReconciledDate) ||
              account.lastReconciledDate >=
                batch.effectiveDate)) ||
          finalizedReconciliation
        ) {
          fail(
            `Reconciliation for ${line.accountNumber} must be reviewed before this dated correction can be posted.`,
            409
          );
        }

        const difference = toCents(line.difference);

        if (
          difference === 0 ||
          toCents(line.actualBalance) !==
            toCents(line.actualBaseBalance) ||
          toCents(line.actualBaseBalance) -
            toCents(line.ledgerBaseBalance) !==
            difference
        ) {
          fail(
            "An adjustment amount is invalid or inconsistent.",
            409
          );
        }

        const increaseOnDebit =
          target.chart.normalBalance === "Debit";

        const debitTarget =
          (difference > 0) === increaseOnDebit;

        const amount = Math.abs(difference) / 100;

        journalLines.push(
          {
            accountCode: line.linkedChartAccountCode,
            debit: debitTarget ? amount : 0,
            credit: debitTarget ? 0 : amount,
            description: line.adjustmentExplanation,
          },
          {
            accountCode: line.offsetChartAccountCode,
            debit: debitTarget ? 0 : amount,
            credit: debitTarget ? amount : 0,
            description: line.adjustmentExplanation,
          }
        );

        financialAccounts.set(line.accountNumber, {
          account,
          currentCents: target.currentCents,
          difference,
        });
      }

      const created = await JournalEntry.create(
        [
          {
            entryNumber: `JE-ADJ-${randomUUID()}`,
            adjustmentBatchNumber: number,
            entryDate: batch.effectiveDate,
            reference: number,
            sourceModule: "Financial Position Adjustment",

            sourceDocumentType: "FinancialAdjustmentBatch",
            sourceDocumentNumber: number,
            sourceDocumentId: String(batch._id),

            entityId: entity._id,
            entityCode: entity.entityCode,
            entitySnapshot: {
              entityCode: entity.entityCode,
              legalName: entity.legalName,
              entityType: entity.entityType,
            },

            reportingPeriodKey:
              batch.effectiveDate.slice(0, 7),

            memo: batch.adjustmentReason,
            status: "Approved",
            approvedBy: batch.approvedBy,
            approvedAt: batch.approvedAt,
            createdBy: batch.createdBy,

            lines: journalLines.map((line) => ({
              ...line,
              accountName: charts.get(line.accountCode)
                .chart.accountName,
            })),
          },
        ],
        { session }
      );

      const journalEntry =
        await postApprovedJournalEntry({
          entryNumber: created[0].entryNumber,
          postedBy: administrator.name,
          session,

          // Update these JMD financial accounts below, preserving
          // activity recorded after the adjustment's effective date.
          skipFinancialSyncForCodes: batch.lines.map(
            (line) => line.linkedChartAccountCode
          ),
        });

      for (const line of batch.lines) {
        const {
          account,
          currentCents,
          difference,
        } = financialAccounts.get(line.accountNumber);

        const updated = currentCents + difference;

        if (!Number.isSafeInteger(updated)) {
          fail(
            "The resulting balance exceeds the supported range."
          );
        }

        account.currentBalance = updated / 100;
        account.baseCurrencyBalance = updated / 100;

        if (account.accountType === "Credit Card") {
          const availableCents =
            toCents(account.creditLimit) - updated;

          if (!Number.isSafeInteger(availableCents)) {
            fail(
              "Available credit exceeds the supported range."
            );
          }

          account.availableCredit = availableCents / 100;
        }

        account.lastAdjustmentBatch = number;
        account.lastAdjustmentDate = batch.effectiveDate;

        await account.save({ session });

        await AccountTransaction.create(
          [
            {
              transactionNumber: `TRN-ADJ-${randomUUID()}`,
              accountNumber: account.accountNumber,
              accountName: account.accountName,

              linkedChartAccountCode:
                line.linkedChartAccountCode,

              journalEntryNumber: journalEntry.entryNumber,
              ledgerReference: journalEntry.entryNumber,

                            transactionType: "Adjustment",

              transactionDirection:
                account.accountType === "Credit Card"
                  ? difference > 0
                    ? "Withdrawal"
                    : "Deposit"
                  : difference > 0
                  ? "Deposit"
                  : "Withdrawal",

              amount: Math.abs(difference) / 100,
              reference: number,
              notes: line.adjustmentExplanation,

              transactionDate: new Date(
                `${batch.effectiveDate}T00:00:00.000Z`
              ),

              adjustmentBatchNumber: number,
              adjustmentReason: batch.adjustmentReason,
              adjustmentType:
                difference > 0
                  ? "Balance Increase"
                  : "Balance Decrease",

              transactionCurrency: "JMD",
              exchangeRate: 1,
            },
          ],
          { session }
        );
      }

      batch.status = "Posted";
      batch.journalEntryNumber = journalEntry.entryNumber;
      batch.postedBy = administrator.name;
      batch.postedById = administrator.id;
      batch.postedAt = new Date();

      batch.auditEvents.push({
        action: "BATCH_POSTED",
        actorId: administrator.id,
        actorName: administrator.name,
        reason: batch.adjustmentReason,
        contentHash: batch.approvedContentHash,
      });

      await batch.save({ session });

      await writeFinanceAuditLog({
        req,
        session,
        action: "FINANCIAL_POSITION_ADJUSTMENT_POSTED",

        description:
          `Approved financial adjustment ${number} posted`,

        targetType: "FinancialAdjustmentBatch",
        targetId: number,
        postingDate: batch.effectiveDate,
        journalEntry,
        performedByName: administrator.name,

        metadata: {
          approvedContentHash: batch.approvedContentHash,
          lineCount: batch.lines.length,
        },
      });

      return {
        batch,
        journalEntry,
        alreadyPosted: false,
      };
    },
    {
      readConcern: { level: "snapshot" },
      writeConcern: { w: "majority" },
    }
  );
};

const getAdjustmentBatches = async () =>
  FinancialAdjustmentBatch.find().sort({
    createdAt: -1,
  });

const cancelAdjustmentBatch = async ({
  batchNumber,
  reason,
  user = null,
} = {}) => {
  const administrator = getAdministrator(user);
  const cancellationReason = text(reason);

  if (!cancellationReason) {
    fail("A cancellation reason is required.");
  }

  const batch = await FinancialAdjustmentBatch.findOne({
    batchNumber: text(batchNumber),
  });

  if (!batch) {
    fail("Adjustment batch not found.", 404);
  }

  if (
    batch.workflowVersion !== 2 ||
    batch.status !== "Draft"
  ) {
    fail(
      "Only a new controlled draft can be cancelled here. Historical batches are preserved.",
      409
    );
  }

  batch.status = "Cancelled";
  batch.cancelledBy = administrator.name;
  batch.cancelledById = administrator.id;
  batch.cancelledAt = new Date();
  batch.cancellationReason = cancellationReason;

  batch.auditEvents.push({
    action: "DRAFT_CANCELLED",
    actorId: administrator.id,
    actorName: administrator.name,
    reason: cancellationReason,
    contentHash: batch.contentHash,
  });

  try {
    return await batch.save();
  } catch (error) {
    if (error.name === "VersionError") {
      fail(
        "This draft changed. Reload it before cancelling.",
        409
      );
    }

    throw error;
  }
};

const deleteDraftAdjustmentBatch = async () => {
  fail(
    "Adjustment batches cannot be deleted. Use cancellation with a reason to preserve their history.",
    409
  );
};

module.exports = {
  buildPositionPreview,
  createAdjustmentBatch,
  submitAdjustmentBatch,
  approveAdjustmentBatch,
  rejectAdjustmentBatch,
  postAdjustmentBatch,
  getAdjustmentBatches,
  cancelAdjustmentBatch,
  deleteDraftAdjustmentBatch,
};