const crypto = require("crypto");
const mongoose = require("mongoose");

const DebtAccount = require("../models/DebtAccount");
const DebtPayment = require("../models/DebtPayment");
const Chart = require("../models/ChartOfAccount");
const Account = require("../models/FinancialAccount");
const Journal = require("../models/JournalEntry");
const Ledger = require("../models/GeneralLedgerTransaction");
const Transaction = require("../models/AccountTransaction");
const Entity = require("../models/BusinessEntity");

const {
  postJournalEntry,
} = require("../services/accountingEngine/journalService");

const { writeAuditLog } = require("../utils/auditLogger");

const fail = (message, statusCode = 409) => {
  throw Object.assign(new Error(message), { statusCode });
};

const text = (value) => String(value ?? "").trim();

const hash = (value) =>
  crypto
    .createHash("sha256")
    .update(JSON.stringify(value))
    .digest("hex");

const today = () => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Jamaica",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  return ["year", "month", "day"]
    .map((key) => parts.find((part) => part.type === key).value)
    .join("-");
};

const date = (value, label, optional = false) => {
  const result = text(value);

  if (!result && optional) return "";

  const parsed = new Date(`${result}T00:00:00Z`);

  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(result) ||
    Number.isNaN(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== result
  ) {
    fail(`${label} must be a valid YYYY-MM-DD date.`, 400);
  }

  return result;
};

const cents = (value, label) => {
  if (
    !["number", "string"].includes(typeof value) ||
    text(value) === ""
  ) {
    fail(`${label} is required.`, 400);
  }

  const number = Number(value);
  const minor = Math.round(number * 100);

  if (
    !Number.isFinite(number) ||
    number < 0 ||
    !Number.isSafeInteger(minor)
  ) {
    fail(
      `${label} must be a valid non-negative amount.`,
      400
    );
  }

  return minor;
};

const sum = (rows, field) => {
  let result = 0;

  for (const row of rows) {
    const raw = row[field];

    if (
      raw === null ||
      raw === undefined ||
      !Number.isFinite(Number(raw)) ||
      Number(raw) < 0
    ) {
      return null;
    }

    result += Math.round(Number(raw) * 100);

    if (!Number.isSafeInteger(result)) return null;
  }

  return result / 100;
};

const typeList = [
  "Loan",
  "Credit Card",
  "Vehicle Loan",
  "Equipment Financing",
  "Business Expansion",
  "Other",
];

const fields = [
  "debtName",
  "debtType",
  "lenderName",
  "startingBalance",
  "currentBalance",
  "monthlyPayment",
  "interestRate",
  "dueDay",
  "startDate",
  "targetPayoffDate",
  "notes",
  "status",
  "currency",
  "entityCode",
  "liabilityAccountCode",
  "interestAccountCode",
];

const normalize = (body, previous = {}) => {
  const data = { ...previous };

  for (const key of fields) {
    if (Object.hasOwn(body, key)) data[key] = body[key];
  }

  for (const key of [
    "debtName",
    "lenderName",
    "notes",
    "entityCode",
    "liabilityAccountCode",
    "interestAccountCode",
  ]) {
    data[key] = text(data[key]);
  }

  if (!data.debtName) fail("Debt name is required.", 400);

  data.debtType = data.debtType || "Loan";

  if (!typeList.includes(data.debtType)) {
    fail("Select a valid debt type.", 400);
  }

  if (data.currency !== "JMD") {
    fail(
      "Confirm that the debt is denominated in JMD. Foreign-currency debts need a separate review.",
      400
    );
  }

  data.startingBalance =
    cents(data.startingBalance, "Starting balance") / 100;

  if (
    data.currentBalance === "" ||
    data.currentBalance === undefined
  ) {
    data.currentBalance = data.startingBalance;
  }

  data.currentBalance =
    cents(data.currentBalance, "Current balance") / 100;

  data.monthlyPayment =
    cents(
      data.monthlyPayment === ""
        ? 0
        : data.monthlyPayment ?? 0,
      "Monthly payment"
    ) / 100;

  data.interestRate = Number(
    data.interestRate === ""
      ? 0
      : data.interestRate ?? 0
  );

  if (
    !Number.isFinite(data.interestRate) ||
    data.interestRate < 0
  ) {
    fail("Interest rate must be zero or greater.", 400);
  }

  data.dueDay =
    data.dueDay === "" || data.dueDay == null
      ? null
      : Number(data.dueDay);

  if (
    data.dueDay !== null &&
    (
      !Number.isInteger(data.dueDay) ||
      data.dueDay < 1 ||
      data.dueDay > 31
    )
  ) {
    fail(
      "Due day must be a whole number from 1 to 31.",
      400
    );
  }

  data.startDate = date(
    data.startDate,
    "Start date",
    true
  );

  data.targetPayoffDate = date(
    data.targetPayoffDate,
    "Target payoff date",
    true
  );

  if (
    data.startDate &&
    data.targetPayoffDate &&
    data.targetPayoffDate < data.startDate
  ) {
    fail("Target payoff cannot precede the start date.", 400);
  }

  data.status = data.status || "Active";

  if (!["Active", "Paused", "Paid Off"].includes(data.status)) {
    fail("Select a valid status.", 400);
  }

  if (
    data.status === "Paid Off" &&
    data.currentBalance !== 0
  ) {
    fail("A debt with a balance cannot be marked Paid Off.");
  }

  if (data.currentBalance === 0) {
    data.status = "Paid Off";
  }

  return Object.fromEntries(
    fields.map((key) => [key, data[key]])
  );
};

const audit = (
  req,
  session,
  action,
  debt,
  metadata = {}
) =>
  writeAuditLog({
    req,
    session,
    action,
    module: "Debt Manager",
    description: `${action}: ${debt.debtNumber}`,
    targetType: "DebtAccount",
    targetId: debt.debtNumber,
    metadata,
  });

const requiredIndex = async (Model, field) => {
  let indexes;

  try {
    indexes = await Model.collection.indexes();
  } catch {
    fail(
      "Debt collections/indexes are not ready. No records were changed."
    );
  }

  if (
    !indexes.some(
      (index) =>
        index.unique &&
        Object.keys(index.key).length === 1 &&
        index.key[field] === 1
    )
  ) {
    fail(
      `The existing unique ${field} index must be present before this operation.`
    );
  }
};

const mappings = async (debt, session) => {
  const liability = await Chart.findOne({
    accountCode: debt.liabilityAccountCode,
    status: "Active",
    accountCategory: "Liability",
    normalBalance: "Credit",
  }).session(session);

  if (!liability) {
    fail(
      "Select an active credit-normal liability account for this debt."
    );
  }

  if (debt.interestAccountCode) {
    const interest = await Chart.findOne({
      accountCode: debt.interestAccountCode,
      status: "Active",
      accountCategory: "Expense",
      normalBalance: "Debit",
    }).session(session);

    if (!interest) {
      fail(
        "Select an active debit-normal interest expense account."
      );
    }
  }
};

const validateConfig = async (debt, session) => {
  if (!debt.entityCode) {
    fail("Select the business responsible for this debt.");
  }

  const entity = await Entity.findOne({
    entityCode: debt.entityCode,
  }).session(session);

  if (!entity) fail("Business entity not found.");

  await mappings(debt, session);
};

const catchResponse = (res, error) => {
  console.error("Debt Manager:", error);

  return res
    .status(
      error.statusCode ||
        (error.code === 11000 ? 409 : 500)
    )
    .json({
      success: false,
      message: error.statusCode
        ? error.message
        : error.code === 11000
          ? "This request or repayment is already recorded. Refresh Debt Manager before retrying."
          : "Could not confirm completion. Refresh Debt Manager before retrying; do not record the payment elsewhere again.",
    });
};

const getDebtManagerData = async (req, res) => {
  try {
    const [
      debts,
      payments,
      chartAccounts,
      financialAccounts,
      entities,
    ] = await Promise.all([
      DebtAccount.find()
        .sort({ createdAt: -1 })
        .lean(),

      DebtPayment.find()
        .sort({ paymentDate: -1, createdAt: -1 })
        .lean(),

      Chart.find({
        status: "Active",
        accountCategory: {
          $in: ["Liability", "Expense"],
        },
      })
        .select(
          "accountCode accountName accountCategory normalBalance"
        )
        .lean(),

      Account.find({
        status: "Active",
        accountType: { $in: ["Cash", "Bank"] },
      })
        .select(
          "accountNumber accountName accountType currency linkedChartAccountCode"
        )
        .lean(),

      Entity.find()
        .select(
          "entityCode legalName lifecycleStatus effectiveFrom effectiveTo"
        )
        .lean(),
    ]);

    const confirmed = debts.every(
      (debt) => debt.currency === "JMD"
    );

    res.set("Cache-Control", "no-store");

    return res.json({
      success: true,
      data: {
        debts,
        payments,
        chartAccounts,
        financialAccounts,
        entities,

        summary: {
          totalStartingDebt: confirmed
            ? sum(debts, "startingBalance")
            : null,

          totalCurrentDebt: confirmed
            ? sum(debts, "currentBalance")
            : null,

          monthlyRequired: confirmed
            ? sum(
                debts.filter(
                  (debt) => debt.status === "Active"
                ),
                "monthlyPayment"
              )
            : null,

          totalPaid: sum(
            payments.filter(
              (payment) =>
                payment.journalEntryNumber &&
                payment.currency === "JMD"
            ),
            "amountPaid"
          ),

          legacyPaymentCount: payments.filter(
            (payment) => !payment.journalEntryNumber
          ).length,

          unconfirmedDebtCount: debts.filter(
            (debt) => debt.currency !== "JMD"
          ).length,
        },
      },
    });
  } catch (error) {
    return catchResponse(res, error);
  }
};

const createDebtAccount = async (req, res) => {
  try {
    const requestId = text(req.body.requestId);

    if (!/^[a-zA-Z0-9-]{16,100}$/.test(requestId)) {
      fail("A valid creation request ID is required.", 400);
    }

    const data = normalize(req.body);
    const debtNumber = `DEBT-${hash(requestId)}`;
    const requestHash = hash(data);

    await requiredIndex(DebtAccount, "debtNumber");

    const debt = await mongoose.connection.transaction(
      async (session) => {
        const existing = await DebtAccount.findOne({
          debtNumber,
        }).session(session);

        if (existing) {
          if (
            existing.creationRequestHash !== requestHash
          ) {
            fail(
              "This creation request was already used with different details."
            );
          }

          return existing;
        }

        await validateConfig(data, session);

        const [created] = await DebtAccount.create(
          [
            {
              ...data,
              debtNumber,
              creationRequestHash: requestHash,
            },
          ],
          { session }
        );

        await audit(
          req,
          session,
          "CREATE_DEBT_ACCOUNT",
          created,
          {
            recordedBalance: data.currentBalance,
            accountingOpeningEntryCreated: false,
          }
        );

        return created;
      }
    );

    return res.status(201).json({
      success: true,
      data: debt,
    });
  } catch (error) {
    return catchResponse(res, error);
  }
};

const updateDebtAccount = async (req, res) => {
  try {
    const debt = await mongoose.connection.transaction(
      async (session) => {
        const record = await DebtAccount.findOne({
          debtNumber: req.params.debtNumber,
        }).session(session);

        if (!record) {
          fail("Debt account not found.", 404);
        }

        const before = record.toObject();
        const data = normalize(req.body, before);

        const anyPayment = await DebtPayment.findOne({
          debtNumber: record.debtNumber,
        }).session(session);

        const linkedPayment = await DebtPayment.findOne({
          debtNumber: record.debtNumber,
          journalEntryNumber: {
            $type: "string",
            $ne: "",
          },
        }).session(session);

        if (
          anyPayment &&
          ["startingBalance", "currentBalance"].some(
            (key) => data[key] !== before[key]
          )
        ) {
          fail(
            "Balances cannot be edited after a repayment. Review corrections separately."
          );
        }

        if (
          linkedPayment &&
          [
            "currency",
            "entityCode",
            "liabilityAccountCode",
            "interestAccountCode",
          ].some((key) => data[key] !== before[key])
        ) {
          fail(
            "Accounting mappings cannot be changed after a linked repayment."
          );
        }

        await validateConfig(data, session);

        Object.assign(record, data);

        await record.save({ session });

        await audit(
          req,
          session,
          "UPDATE_DEBT_ACCOUNT",
          record,
          { before, after: data }
        );

        return record;
      }
    );

    return res.json({ success: true, data: debt });
  } catch (error) {
    return catchResponse(res, error);
  }
};

const recordDebtPayment = async (req, res) => {
  try {
    const body = req.body || {};
    const mode = body.mode;

    if (!["New", "Link"].includes(mode)) {
      fail(
        "Choose New repayment or Link posted repayment.",
        400
      );
    }

    const principal = cents(
      body.principalAmount,
      "Principal"
    );

    const interest = cents(
      body.interestAmount,
      "Interest"
    );

    const total = principal + interest;

    if (
      !Number.isSafeInteger(total) ||
      total <= 0
    ) {
      fail("Enter a positive total repayment.", 400);
    }

    const paymentDate = date(
      body.paymentDate,
      "Payment date"
    );

    if (paymentDate > today()) {
      fail("Future repayments cannot be recorded.", 400);
    }

    const accountNumber = text(body.accountNumber);

    const paymentReference = text(
      body.paymentReference
    ).toUpperCase();

    const existingJournalNumber = text(
      body.journalEntryNumber
    );

    if (
      !accountNumber ||
      paymentReference.length < 3 ||
      paymentReference.length > 120
    ) {
      fail(
        "Select a paying account and supply a payment reference of 3–120 characters.",
        400
      );
    }

    if (
      mode === "Link" &&
      !existingJournalNumber
    ) {
      fail("Enter the posted journal number.", 400);
    }

    const paymentNumber = `DPAY-${hash(
      mode === "Link"
        ? ["journal", existingJournalNumber]
        : [
            "reference",
            accountNumber,
            paymentReference,
          ]
    )}`;

    const requestHash = hash([
      req.params.debtNumber,
      mode,
      principal,
      interest,
      paymentDate,
      accountNumber,
      paymentReference,
      existingJournalNumber,
      text(body.notes),
    ]);

    await requiredIndex(DebtPayment, "paymentNumber");

    const result = await mongoose.connection.transaction(
      async (session) => {
        const previous = await DebtPayment.findOne({
          paymentNumber,
        }).session(session);

        if (previous) {
          if (previous.requestHash !== requestHash) {
            fail(
              "This repayment identifier was already used with different details."
            );
          }

          return {
            payment: previous,
            replayed: true,
          };
        }

        if (body.confirmNotAlreadyTracked !== true) {
          fail(
            "Confirm that this payment is not already included in the tracker balance/payment history."
          );
        }

        const debt = await DebtAccount.findOne({
          debtNumber: req.params.debtNumber,
        }).session(session);

        if (!debt) {
          fail("Debt account not found.", 404);
        }

        if (
          debt.currency !== "JMD" ||
          debt.status !== "Active"
        ) {
          fail(
            "Only an active debt confirmed in JMD can receive repayments."
          );
        }

        if (
          debt.startDate &&
          paymentDate < debt.startDate
        ) {
          fail(
            "Repayment cannot precede the debt start date."
          );
        }

        const balance = cents(
          debt.currentBalance,
          "Recorded debt balance"
        );

        if (principal > balance) {
          fail(
            "Principal repayment exceeds the recorded debt balance."
          );
        }

        await validateConfig(debt, session);

        if (
          interest > 0 &&
          !debt.interestAccountCode
        ) {
          fail(
            "Configure the interest expense account first."
          );
        }

        const account = await Account.findOne({
          accountNumber,
          status: "Active",
          accountType: { $in: ["Cash", "Bank"] },
          currency: "JMD",
        }).session(session);

        if (!account?.linkedChartAccountCode) {
          fail(
            "An active linked JMD bank/cash account is required."
          );
        }

        if (
          [
            debt.liabilityAccountCode,
            debt.interestAccountCode,
          ].includes(account.linkedChartAccountCode)
        ) {
          fail(
            "Paying, liability and expense accounts must be different."
          );
        }

        const expected = new Map([
          [
            account.linkedChartAccountCode,
            [0, total],
          ],
        ]);

        if (principal) {
          expected.set(
            debt.liabilityAccountCode,
            [principal, 0]
          );
        }

        if (interest) {
          expected.set(
            debt.interestAccountCode,
            [interest, 0]
          );
        }

        const entity = await Entity.findOne({
          entityCode: debt.entityCode,
        }).session(session);

        const duplicateReference =
          await DebtPayment.findOne({
            paidFromAccountNumber: accountNumber,
            paymentReference,
          }).session(session);

        if (duplicateReference) {
          fail(
            "That paying-account/payment reference is already recorded."
          );
        }

        let journal;

        if (mode === "New") {
          if (body.confirmNewPosting !== true) {
            fail(
              "Confirm that this repayment has not already been posted in accounting."
            );
          }

          if (
            entity.lifecycleStatus !== "Active" ||
            (
              entity.effectiveFrom &&
              paymentDate < entity.effectiveFrom
            ) ||
            (
              entity.effectiveTo &&
              paymentDate > entity.effectiveTo
            )
          ) {
            fail(
              "The business must be active and effective on the repayment date."
            );
          }

          for (const code of expected.keys()) {
            const linked = await Account.find({
              linkedChartAccountCode: code,
            }).session(session);

            if (
              linked.length > 1 ||
              linked.some(
                (item) => item.currency !== "JMD"
              )
            ) {
              fail(
                "A posting account has shared or foreign-currency financial links. Review its configuration first."
              );
            }
          }

          const liability = await Chart.findOne({
            accountCode: debt.liabilityAccountCode,
          }).session(session);

          if (
            cents(
              liability.currentBalance,
              "Liability ledger balance"
            ) < principal
          ) {
            fail(
              "The liability ledger balance is below the principal repayment. Review the opening balance/mapping first."
            );
          }

          const funding = await Chart.findOne({
            accountCode:
              account.linkedChartAccountCode,
            status: "Active",
            accountCategory: "Asset",
            normalBalance: "Debit",
          }).session(session);

          if (
            !funding ||
            cents(
              funding.currentBalance,
              "Paying ledger balance"
            ) < total
          ) {
            fail(
              "The paying account has insufficient recorded ledger funds or needs review."
            );
          }

          journal = await postJournalEntry({
            session,
            entryDate: paymentDate,
            reference: debt.debtNumber,
            sourceModule: "Debt Manager",

            memo:
              `Debt repayment ${paymentReference}; ` +
              debt.debtName,

            entityId: entity._id,
            entityCode: entity.entityCode,

            entitySnapshot: {
              entityCode: entity.entityCode,
              legalName: entity.legalName,
              entityType: entity.entityType,
            },

            createdBy:
              req.user?.fullName ||
              req.user?.name ||
              req.user?.email ||
              "System User",

            lines: [...expected].map(
              ([accountCode, [debit, credit]]) => ({
                accountCode,
                debit: debit / 100,
                credit: credit / 100,
                description:
                  `Debt ${debt.debtNumber}; ` +
                  paymentReference,
              })
            ),
          });

          await Transaction.create(
            [
              {
                transactionNumber:
                  `TRN-${crypto.randomUUID()}`,

                accountNumber,
                accountName: account.accountName,

                linkedChartAccountCode:
                  account.linkedChartAccountCode,

                journalEntryNumber:
                  journal.entryNumber,

                ledgerReference:
                  journal.entryNumber,

                transactionType: "Withdrawal",
                transactionDirection: "Withdrawal",
                amount: total / 100,
                reference: debt.debtNumber,

                notes:
                  `Debt repayment ${paymentReference}`,

                transactionDate: new Date(
                  `${paymentDate}T12:00:00-05:00`
                ),

                transactionCurrency: "JMD",
                branch: text(req.user?.branch),
              },
            ],
            { session }
          );
        } else {
          journal = await Journal.findOne({
            entryNumber: existingJournalNumber,
          }).session(session);

          if (
            !journal ||
            journal.status !== "Posted" ||
            journal.reversedAt ||
            journal.reversalEntryNumber ||
            journal.entityCode !== debt.entityCode ||
            journal.reference !== debt.debtNumber ||
            journal.entryDate !== paymentDate
          ) {
            fail(
              "The journal must be posted, unreversed, dated correctly, and reference this debt and business."
            );
          }

          const used = await DebtPayment.findOne({
            journalEntryNumber:
              existingJournalNumber,
          }).session(session);

          if (used) {
            fail(
              "This journal is already linked to a debt repayment."
            );
          }

          const matches = (lines) => {
            const actual = new Map();

            for (const line of lines) {
              const debit = cents(
                line.debit ?? 0,
                "Journal debit"
              );

              const credit = cents(
                line.credit ?? 0,
                "Journal credit"
              );

              if (debit && credit) return false;
              if (!debit && !credit) continue;

              const old = actual.get(
                line.accountCode
              ) || [0, 0];

              actual.set(line.accountCode, [
                old[0] + debit,
                old[1] + credit,
              ]);
            }

            return (
              actual.size === expected.size &&
              [...expected].every(
                ([code, values]) =>
                  actual.get(code)?.[0] === values[0] &&
                  actual.get(code)?.[1] === values[1]
              )
            );
          };

          const ledger = await Ledger.find({
            entryNumber: existingJournalNumber,
          }).session(session);

          if (
            !matches(journal.lines || []) ||
            !ledger.length ||
            !matches(ledger) ||
            ledger.some(
              (line) =>
                line.entryDate !== paymentDate ||
                (
                  line.entityCode &&
                  line.entityCode !== debt.entityCode
                )
            )
          ) {
            fail(
              "The posted journal and ledger must exactly match the principal, interest and paying account entered."
            );
          }
        }

        const [payment] = await DebtPayment.create(
          [
            {
              paymentNumber,
              requestHash,
              debtNumber: debt.debtNumber,
              debtName: debt.debtName,
              mode,
              amountPaid: total / 100,
              principalAmount: principal / 100,
              interestAmount: interest / 100,
              paymentDate,
              paidFrom: account.accountName,
              paidFromAccountNumber: accountNumber,
              paymentReference,
              journalEntryNumber: journal.entryNumber,
              currency: "JMD",
              notes: text(body.notes),
            },
          ],
          { session }
        );

        debt.currentBalance =
          (balance - principal) / 100;

        if (debt.currentBalance === 0) {
          debt.status = "Paid Off";
        }

        debt.repaymentVersion =
          Number(debt.repaymentVersion || 0) + 1;

        await debt.save({ session });

        await audit(
          req,
          session,
          "RECORD_DEBT_PAYMENT",
          debt,
          {
            mode,
            paymentNumber,
            journalEntryNumber: journal.entryNumber,
            principal: principal / 100,
            interest: interest / 100,
            newBalance: debt.currentBalance,
          }
        );

        return {
          debt,
          payment,
          replayed: false,
        };
      }
    );

    return res.json({
      success: true,
      data: result,

      message: result.replayed
        ? "Repayment already recorded; no duplicate was created."
        : mode === "New"
          ? "Repayment posted and debt updated."
          : "Posted repayment linked; no new accounting entries were created.",
    });
  } catch (error) {
    return catchResponse(res, error);
  }
};

module.exports = {
  getDebtManagerData,
  createDebtAccount,
  updateDebtAccount,
  recordDebtPayment,
};