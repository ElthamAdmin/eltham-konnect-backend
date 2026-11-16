const TaxRecord = require(
  "../models/TaxRecord"
);

const BusinessEntity = require(
  "../models/BusinessEntity"
);

const GeneralLedgerTransaction = require(
  "../models/GeneralLedgerTransaction"
);

const JournalEntry = require(
  "../models/JournalEntry"
);

const AccountTransaction = require(
  "../models/AccountTransaction"
);

const T = require("./taxControl");

const TAX_ACCOUNT_MAP = Object.fromEntries(
  Object.entries(T.map).map(
    ([taxType, accountCode]) => [
      taxType,
      {
        accountCode,
        accountName: `${taxType} Payable`,
      },
    ]
  )
);

const sumSide = (
  rows,
  field
) =>
  T.round(
    rows.reduce(
      (total, row) =>
        total +
        T.amount(
          row[field] ?? 0,
          `Recorded ${field}`
        ),
      0
    )
  );

const getPeriodScope = (value) => {
  const periodKey = T.text(
    value,
    "Reporting period"
  );

  const annual =
    /^\d{4}$/.test(periodKey);

  if (annual) {
    T.date(`${periodKey}-01-01`);
  } else {
    T.period(periodKey);
  }

  const startDate = annual
    ? `${periodKey}-01-01`
    : `${periodKey}-01`;

  const endDate = annual
    ? `${periodKey}-12-31`
    : new Date(
        Date.UTC(
          Number(periodKey.slice(0, 4)),
          Number(periodKey.slice(5, 7)),
          0,
          12
        )
      )
        .toISOString()
        .slice(0, 10);

  const periodKeys = annual
    ? [
        periodKey,
        ...Array.from(
          { length: 12 },
          (_, index) =>
            `${periodKey}-${String(
              index + 1
            ).padStart(2, "0")}`
        ),
      ]
    : [periodKey];

  return {
    periodKey,
    startDate,
    endDate,
    periodKeys,
  };
};

const generateEntityPeriodTaxReconciliation =
  async ({
    entityCode,
    periodKey,
    taxType = "",
    session = null,
  }) => {
    const normalizedEntityCode =
      T.text(
        entityCode,
        "Business entity"
      ).toUpperCase();

    const scope =
      getPeriodScope(periodKey);

    const entity =
      await BusinessEntity.findOne({
        entityCode:
          normalizedEntityCode,
      })
        .session(session)
        .lean();

    if (!entity) {
      T.fail(
        "Business entity not found.",
        404
      );
    }

    if (
      scope.endDate <
        entity.effectiveFrom ||
      (
        entity.effectiveTo &&
        scope.startDate >
          entity.effectiveTo
      )
    ) {
      T.fail(
        "The selected business entity does not overlap this reporting period.",
        409
      );
    }

    const normalizedTaxType =
      taxType
        ? T.canonical(
            T.text(
              taxType,
              "Tax type"
            )
          )
        : "";

    const selectedTaxTypes =
      normalizedTaxType
        ? [normalizedTaxType]
        : Object.keys(TAX_ACCOUNT_MAP);

    if (
      selectedTaxTypes.some(
        (type) =>
          !TAX_ACCOUNT_MAP[type]
      )
    ) {
      T.fail(
        "No supported payable mapping exists for the selected tax type."
      );
    }

    const accountCodes =
      selectedTaxTypes.map(
        (type) =>
          TAX_ACCOUNT_MAP[type]
            .accountCode
      );

    const acceptedTaxNames =
      selectedTaxTypes.flatMap(
        T.variants
      );

    const includedStatuses = [
      "Reviewed",
      "Approved",
      "Submitted",
      "Partially Paid",
      "Paid",
      "Reconciled",
      "Overdue",
    ];

    const taxRecords =
      await TaxRecord.find({
        entityCode:
          normalizedEntityCode,

        periodKey: {
          $in: scope.periodKeys,
        },

        taxType: {
          $in: acceptedTaxNames,
        },

        status: {
          $in: includedStatuses,
        },
      })
        .session(session)
        .lean();

    const unattributedTaxRecords =
      await TaxRecord.find({
        entityCode: {
          $in: ["", null],
        },

        periodKey: {
          $in: scope.periodKeys,
        },

        taxType: {
          $in: acceptedTaxNames,
        },

        status: {
          $in: includedStatuses,
        },
      })
        .session(session)
        .lean();

    const ledgerTransactions =
      await GeneralLedgerTransaction.find({
        entityCode:
          normalizedEntityCode,

        reportingPeriodKey: {
          $in: scope.periodKeys,
        },

        accountCode: {
          $in: accountCodes,
        },
      })
        .session(session)
        .lean();

    const unattributedTransactions =
      await GeneralLedgerTransaction.find({
        accountCode: {
          $in: accountCodes,
        },

        $and: [
          {
            $or: [
              {
                entryDate: {
                  $gte:
                    scope.startDate,

                  $lte:
                    scope.endDate,
                },
              },
              {
                reportingPeriodKey: {
                  $in:
                    scope.periodKeys,
                },
              },
            ],
          },
          {
            $or: [
              {
                entityCode: {
                  $in: ["", null],
                },
              },
              {
                entityCode:
                  normalizedEntityCode,

                reportingPeriodKey: {
                  $in: ["", null],
                },
              },
            ],
          },
        ],
      })
        .session(session)
        .lean();

    const journalNumbers = [
      ...new Set(
        ledgerTransactions.map(
          (transaction) =>
            transaction.entryNumber
        )
      ),
    ];

    const journals =
      await JournalEntry.find({
        entryNumber: {
          $in: journalNumbers,
        },
      })
        .session(session)
        .lean();

    const journalMap = new Map(
      journals.map(
        (journal) => [
          journal.entryNumber,
          journal,
        ]
      )
    );

    const data = [];

    for (
      const currentTaxType
      of selectedTaxTypes
    ) {
      const account =
        TAX_ACCOUNT_MAP[
          currentTaxType
        ];

      const recordsForType =
        taxRecords.filter(
          (record) =>
            T.canonical(
              record.taxType
            ) === currentTaxType
        );

      const missingEntityRecords =
        unattributedTaxRecords.filter(
          (record) =>
            T.canonical(
              record.taxType
            ) === currentTaxType
        );

      const ledgerForAccount =
        ledgerTransactions.filter(
          (transaction) =>
            transaction.accountCode ===
            account.accountCode
        );

      const unattributedForAccount =
        unattributedTransactions.filter(
          (transaction) =>
            transaction.accountCode ===
            account.accountCode
        );

      const issues = [];

      let calculatedLiability = 0;
      let recordedPayments = 0;
      let taxCenterBalance = 0;

      for (
        const record
        of recordsForType
      ) {
        const taxDue = T.amount(
          record.taxDue,
          "Recorded tax due"
        );

        const amountPaid = T.amount(
          record.amountPaid,
          "Recorded payments"
        );

        const balanceDue = T.amount(
          record.balanceDue,
          "Recorded tax balance"
        );

        calculatedLiability +=
          taxDue;

        recordedPayments +=
          amountPaid;

        taxCenterBalance +=
          balanceDue;

        if (
          amountPaid > taxDue ||
          T.round(
            taxDue - amountPaid
          ) !== balanceDue
        ) {
          issues.push(
            `${record.taxNumber}: recorded payment and balance amounts are inconsistent.`
          );
        }

        if (
          record.entitySnapshot
            ?.entityCode &&
          record.entitySnapshot
            .entityCode !==
            normalizedEntityCode
        ) {
          issues.push(
            `${record.taxNumber}: entity snapshot conflicts with the recorded entity.`
          );
        }

        let remittedAmount = 0;

        for (
          const remittance
          of record.remittances || []
        ) {
          const amount = T.amount(
            remittance.amount,
            "Remittance amount"
          );

          remittedAmount += amount;

          const transaction =
            await AccountTransaction.findOne({
              taxNumber:
                record.taxNumber,

              journalEntryNumber:
                remittance.journalEntryNumber,

              reference:
                remittance.paymentReference,

              transactionType:
                "Tax Payment",
            })
              .session(session)
              .lean();

          const paymentJournal =
            await JournalEntry.findOne({
              entryNumber:
                remittance.journalEntryNumber,

              entityCode:
                normalizedEntityCode,

              status: "Posted",
            })
              .session(session)
              .lean();

          if (
            !transaction ||
            T.amount(
              transaction.amount
            ) !== amount ||
            transaction.taxPeriodKey !==
              record.periodKey ||
            T.canonical(
              transaction.taxType
            ) !== currentTaxType ||
            !paymentJournal ||
            paymentJournal
              .reversalEntryNumber ||
            paymentJournal
              .reportingPeriodKey !==
              record.periodKey
          ) {
            issues.push(
              `${record.taxNumber}: remittance transaction or journal evidence requires review.`
            );

            continue;
          }

          const payableLines =
            (
              paymentJournal.lines ||
              []
            ).filter(
              (line) =>
                line.accountCode ===
                account.accountCode
            );

          const fundingLines =
            (
              paymentJournal.lines ||
              []
            ).filter(
              (line) =>
                line.accountCode ===
                transaction.linkedChartAccountCode
            );

          if (
            !transaction
              .linkedChartAccountCode ||
            sumSide(
              payableLines,
              "debit"
            ) !== amount ||
            sumSide(
              payableLines,
              "credit"
            ) !== 0 ||
            sumSide(
              fundingLines,
              "credit"
            ) !== amount ||
            sumSide(
              fundingLines,
              "debit"
            ) !== 0
          ) {
            issues.push(
              `${record.taxNumber}: the payment journal does not match the remittance amount and account mapping.`
            );
          }
        }

        if (
          T.round(
            remittedAmount
          ) !== amountPaid
        ) {
          issues.push(
            `${record.taxNumber}: remittances do not equal the recorded amount paid.`
          );
        }
      }

      const glDebit = sumSide(
        ledgerForAccount,
        "debit"
      );

      const glCredit = sumSide(
        ledgerForAccount,
        "credit"
      );

      const glBalance = T.round(
        glCredit - glDebit
      );

      const entriesForAccount = [
        ...new Set(
          ledgerForAccount.map(
            (line) =>
              line.entryNumber
          )
        ),
      ];

      for (
        const entryNumber
        of entriesForAccount
      ) {
        const journal =
          journalMap.get(
            entryNumber
          );

        const ledgerLines =
          ledgerForAccount.filter(
            (line) =>
              line.entryNumber ===
              entryNumber
          );

        if (
          !journal ||
          ![
            "Posted",
            "Reversed",
          ].includes(
            journal.status
          ) ||
          journal.entityCode !==
            normalizedEntityCode ||
          ledgerLines.some(
            (line) =>
              line.reportingPeriodKey !==
              journal.reportingPeriodKey
          )
        ) {
          issues.push(
            `${entryNumber}: journal status or entity/period attribution requires review.`
          );

          continue;
        }

        if (
          journal.status ===
            "Reversed" &&
          !journal.reversalEntryNumber
        ) {
          issues.push(
            `${entryNumber}: the reversed journal has no reversal reference.`
          );
        }

        const journalLines =
          (
            journal.lines || []
          ).filter(
            (line) =>
              line.accountCode ===
              account.accountCode
          );

        if (
          sumSide(
            journalLines,
            "debit"
          ) !==
            sumSide(
              ledgerLines,
              "debit"
            ) ||
          sumSide(
            journalLines,
            "credit"
          ) !==
            sumSide(
              ledgerLines,
              "credit"
            )
        ) {
          issues.push(
            `${entryNumber}: journal and ledger debit/credit amounts disagree.`
          );
        }
      }

      if (
        unattributedForAccount.length
      ) {
        issues.push(
          `${unattributedForAccount.length} ledger transaction(s) have missing entity or reporting-period attribution and were excluded.`
        );
      }

      if (
        missingEntityRecords.length
      ) {
        issues.push(
          `${missingEntityRecords.length} tax record(s) have no confirmed business entity and were excluded.`
        );
      }

      if (
        recordsForType.length > 0 &&
        ledgerForAccount.length === 0 &&
        calculatedLiability > 0
      ) {
        issues.push(
          "No supporting liability ledger entries were found."
        );
      }

      calculatedLiability =
        T.round(
          calculatedLiability
        );

      recordedPayments =
        T.round(
          recordedPayments
        );

      taxCenterBalance =
        T.round(
          taxCenterBalance
        );

      const difference = T.round(
        taxCenterBalance -
          glBalance
      );

      const uniqueIssues = [
        ...new Set(issues),
      ];

      const hasActivity =
        recordsForType.length > 0 ||
        ledgerForAccount.length > 0;

      const reconciled =
        hasActivity &&
        difference === 0 &&
        uniqueIssues.length === 0;

      const status =
        uniqueIssues.length > 0
          ? "Review required"
          : !hasActivity
            ? "No activity"
            : reconciled
              ? "Matched"
              : "Difference";

      data.push({
        taxType:
          currentTaxType,

        accountCode:
          account.accountCode,

        accountName:
          account.accountName,

        recordCount:
          recordsForType.length,

        calculatedLiability,
        recordedPayments,
        taxCenterBalance,
        glBalance,

        reconciliationDifference:
          difference,

        reconciled,
        status,

        issues:
          uniqueIssues,

        ledgerTransactionCount:
          ledgerForAccount.length,

        unattributedLedgerTransactionCount:
          unattributedForAccount.length,

        unattributedTaxRecordCount:
          missingEntityRecords.length,

        records:
          recordsForType,

        ledgerTransactions:
          ledgerForAccount,

        unattributedLedgerTransactions:
          unattributedForAccount,

        warning:
          uniqueIssues.join(" "),
      });
    }

    const summary = {
      calculatedLiability: 0,
      recordedPayments: 0,
      taxCenterBalance: 0,
      glBalance: 0,
      absoluteDifference: 0,
      reconciledAccountCount: 0,
      unreconciledAccountCount: 0,
      noActivityAccountCount: 0,
      unattributedLedgerTransactionCount: 0,
      unattributedTaxRecordCount: 0,
    };

    for (const row of data) {
      for (
        const field
        of [
          "calculatedLiability",
          "recordedPayments",
          "taxCenterBalance",
          "glBalance",
        ]
      ) {
        summary[field] = T.round(
          summary[field] +
            row[field]
        );
      }

      summary.absoluteDifference =
        T.round(
          summary.absoluteDifference +
            Math.abs(
              row.reconciliationDifference
            )
        );

      summary.unattributedLedgerTransactionCount +=
        row.unattributedLedgerTransactionCount;

      summary.unattributedTaxRecordCount +=
        row.unattributedTaxRecordCount;

      if (
        row.status === "No activity"
      ) {
        summary.noActivityAccountCount +=
          1;
      } else if (
        row.reconciled
      ) {
        summary.reconciledAccountCount +=
          1;
      } else {
        summary.unreconciledAccountCount +=
          1;
      }
    }

    summary.evidenceChecked = true;

    summary.matched =
      summary.reconciledAccountCount >
        0 &&
      summary.unreconciledAccountCount ===
        0;

    return {
      filters: {
        entityCode:
          normalizedEntityCode,

        periodKey:
          scope.periodKey,

        taxType:
          normalizedTaxType,
      },

      entity,

      period: {
        periodKey:
          scope.periodKey,

        startDate:
          scope.startDate,

        endDate:
          scope.endDate,
      },

      generatedAt:
        new Date(),

      summary,
      data,

      notice:
        "Recorded Tax-to-GL comparison only. Matching balances do not establish source completeness or bank reconciliation. Later payments attributed to the selected reporting period are included.",
    };
  };

const assertEntityPeriodTaxTypeReconciled =
  async (options) => {
    const result =
      await generateEntityPeriodTaxReconciliation(
        options
      );

    const reconciliation =
      result.data[0];

    if (
      !reconciliation?.reconciled
    ) {
      const error = new Error(
        "Tax-to-GL balances or supporting evidence require review before payment or reconciliation."
      );

      error.statusCode = 409;

      error.reconciliation = {
        filters:
          result.filters,

        accountCode:
          reconciliation
            ?.accountCode,

        taxCenterBalance:
          reconciliation
            ?.taxCenterBalance,

        glBalance:
          reconciliation
            ?.glBalance,

        difference:
          reconciliation
            ?.reconciliationDifference,

        issues:
          reconciliation
            ?.issues || [],
      };

      throw error;
    }

    return reconciliation;
  };

module.exports = {
  TAX_ACCOUNT_MAP,
  generateEntityPeriodTaxReconciliation,
  assertEntityPeriodTaxTypeReconciled,
};