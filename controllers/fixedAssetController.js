const mongoose = require("mongoose");

const FixedAsset = require("../models/FixedAsset");
const Chart = require("../models/ChartOfAccount");
const Account = require("../models/FinancialAccount");
const Journal = require("../models/JournalEntry");
const Ledger = require("../models/GeneralLedgerTransaction");
const Entity = require("../models/BusinessEntity");

const {
  postJournalEntry,
  validateAccountingPeriodOpen,
} = require("../services/accountingEngine/journalService");

const { writeAuditLog } = require("../utils/auditLogger");

const {
  POLICY,
  fail,
  hash,
  today,
  amountCents,
  monthIndex,
  lastDay,
  terms,
  calculatePeriod,
} = require("../services/fixedAssetDepreciationService");

const text = (value) => String(value ?? "").trim();

const actor = (req) =>
  req.user?.fullName ||
  req.user?.name ||
  req.user?.email ||
  "System User";

const categories = [
  "Vehicle",
  "Computer Equipment",
  "Furniture",
  "Office Equipment",
  "Warehouse Equipment",
  "Building",
  "Leasehold Improvement",
  "Other",
];

const respondError = (res, error) => {
  console.error("Fixed Assets:", error);

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
          ? "This acquisition is already registered. Refresh before retrying."
          : "Could not confirm completion. Refresh the register and depreciation history before retrying.",
    });
};

const readJournal = async (number, session) => {
  const journal = await Journal.findOne({
    entryNumber: number,
  }).session(session);

  if (
    !journal ||
    journal.status !== "Posted" ||
    journal.reversedAt ||
    journal.reversalEntryNumber
  ) {
    fail(
      "A supporting journal is missing, unposted or reversed. Review it first."
    );
  }

  return journal;
};

const lineTotals = (lines) => {
  const totals = new Map();

  for (const line of lines) {
    const debit = amountCents(
      line.debit ?? 0,
      "Journal debit"
    );

    const credit = amountCents(
      line.credit ?? 0,
      "Journal credit"
    );

    if (debit && credit) {
      fail("A two-sided accounting line requires review.");
    }

    if (!debit && !credit) continue;

    const old = totals.get(line.accountCode) || [0, 0];
    const next = [old[0] + debit, old[1] + credit];

    if (!next.every(Number.isSafeInteger)) {
      fail("Accounting amounts exceed the supported range.");
    }

    totals.set(line.accountCode, next);
  }

  return totals;
};

const sameLines = (left, right) =>
  left.size === right.size &&
  [...left].every(
    ([code, values]) =>
      right.get(code)?.[0] === values[0] &&
      right.get(code)?.[1] === values[1]
  );

const verifyLedger = async (journal, session) => {
  const lines = await Ledger.find({
    entryNumber: journal.entryNumber,
  }).session(session);

  if (
    !lines.length ||
    !sameLines(
      lineTotals(journal.lines || []),
      lineTotals(lines)
    ) ||
    lines.some(
      (line) =>
        line.entryDate !== journal.entryDate ||
        (
          line.entityCode &&
          line.entityCode !== journal.entityCode
        )
    )
  ) {
    fail("Supporting journal and ledger lines do not agree.");
  }
};

const mappings = async (asset, session) => {
  const settings = [
    [asset.assetAccountCode, "Asset", "Debit"],
    [
      asset.accumulatedDepreciationAccountCode,
      "Asset",
      "Credit",
    ],
    [
      asset.depreciationExpenseAccountCode,
      "Expense",
      "Debit",
    ],
  ];

  if (
    new Set(settings.map(([code]) => code)).size !== 3
  ) {
    fail(
      "Choose three distinct asset, accumulated depreciation and expense accounts."
    );
  }

  for (
    const [accountCode, accountCategory, normalBalance]
    of settings
  ) {
    if (!accountCode) {
      fail("Complete all accounting mappings.");
    }

    const chart = await Chart.findOne({
      accountCode,
      accountCategory,
      normalBalance,
      status: "Active",
    }).session(session);

    if (!chart) {
      fail(
        `The mapped account ${accountCode} has an invalid category, balance type or status.`
      );
    }

    if (
      accountCode === asset.assetAccountCode &&
      ![
        "fixedasset",
        "noncurrentasset",
        "longtermasset",
      ].includes(
        String(chart.accountType || "")
          .toLowerCase()
          .replace(/[-\s]/g, "")
      )
    ) {
      fail(
        "The acquisition account must be classified as a fixed/non-current asset."
      );
    }

    const financialLink = await Account.findOne({
      linkedChartAccountCode: accountCode,
    }).session(session);

    if (financialLink) {
      fail(
        "Asset/depreciation mappings must not be linked to bank, cash or credit-card accounts."
      );
    }
  }
};

const acquisition = async (asset, session) => {
  const journal = await readJournal(
    asset.acquisitionJournalEntryNumber,
    session
  );

  if (
    journal.entryDate !== asset.purchaseDate ||
    !asset.entityCode ||
    journal.entityCode !== asset.entityCode
  ) {
    fail(
      "Acquisition journal date and business must match the asset."
    );
  }

  const cost = amountCents(
    asset.purchaseCost,
    "Purchase cost"
  );

  const totals = lineTotals(journal.lines || []);

  const debit = [...totals.values()].reduce(
    (sum, values) => sum + values[0],
    0
  );

  const credit = [...totals.values()].reduce(
    (sum, values) => sum + values[1],
    0
  );

  if (
    totals.get(asset.assetAccountCode)?.[0] !== cost ||
    totals.get(asset.assetAccountCode)?.[1] !== 0 ||
    debit !== cost ||
    credit !== cost
  ) {
    fail(
      "Use an acquisition journal for this asset's full cost only. Mixed acquisitions require separate review."
    );
  }

  await verifyLedger(journal, session);

  return journal;
};

const verifyHistory = async (asset, session) => {
  const records = (
    asset.depreciationHistory || []
  ).filter((record) => record.amount > 0);

  for (const record of records) {
    const journal = await readJournal(
      record.journalEntryNumber,
      session
    );

    const amount = amountCents(
      record.amount,
      "Depreciation history"
    );

    const expected = new Map([
      [
        asset.depreciationExpenseAccountCode,
        [amount, 0],
      ],
      [
        asset.accumulatedDepreciationAccountCode,
        [0, amount],
      ],
    ]);

    if (
      journal.reference !== asset.assetNumber ||
      journal.entityCode !== asset.entityCode ||
      journal.entryDate !== lastDay(record.period) ||
      !sameLines(
        expected,
        lineTotals(journal.lines || [])
      )
    ) {
      fail(
        "A historical depreciation journal requires review."
      );
    }

    await verifyLedger(journal, session);
  }
};

const sum = (assets, field) => {
  let result = 0;

  for (const asset of assets) {
    if (
      asset[field] == null ||
      !Number.isFinite(Number(asset[field])) ||
      Number(asset[field]) < 0
    ) {
      return null;
    }

    result += Math.round(Number(asset[field]) * 100);

    if (!Number.isSafeInteger(result)) return null;
  }

  return result / 100;
};

const getFixedAssets = async (req, res) => {
  try {
    const [
      assets,
      chartAccounts,
      entities,
    ] = await Promise.all([
      FixedAsset.find()
        .sort({ createdAt: -1 })
        .lean(),

      Chart.find({
        status: "Active",
        accountCategory: {
          $in: ["Asset", "Expense"],
        },
      })
        .select(
          "accountCode accountName accountCategory accountType normalBalance"
        )
        .lean(),

      Entity.find()
        .select(
          "entityCode legalName lifecycleStatus effectiveFrom effectiveTo"
        )
        .lean(),
    ]);

    const held = assets.filter(
      (asset) => asset.status !== "Disposed"
    );

    const confirmed = held.every(
      (asset) => asset.currency === "JMD"
    );

    const groups = new Map();

    for (
      const asset of held.filter(
        (item) => item.policyVersion === POLICY
      )
    ) {
      for (
        const [kind, code, field] of [
          [
            "Cost",
            asset.assetAccountCode,
            "purchaseCost",
          ],
          [
            "Accumulated depreciation",
            asset.accumulatedDepreciationAccountCode,
            "accumulatedDepreciation",
          ],
        ]
      ) {
        const key = JSON.stringify([
          asset.entityCode,
          code,
          kind,
        ]);

        const group = groups.get(key) || {
          entityCode: asset.entityCode,
          accountCode: code,
          kind,
          assets: [],
        };

        group.assets.push(asset);
        group.field = field;
        groups.set(key, group);
      }
    }

    const codes = [
      ...new Set(
        [...groups.values()].map(
          (group) => group.accountCode
        )
      ),
    ];

    const lines = codes.length
      ? await Ledger.find({
          accountCode: { $in: codes },
        }).lean()
      : [];

    const comparisons = [...groups.values()].map(
      (group) => {
        let actual = 0;
        let valid = true;

        const relevant = lines.filter(
          (item) =>
            item.accountCode === group.accountCode &&
            item.entityCode === group.entityCode
        );

        for (const line of relevant) {
          const day = String(line.entryDate || "");

          const parsed = new Date(
            `${day}T00:00:00Z`
          );

          if (
            !/^\d{4}-\d{2}-\d{2}$/.test(day) ||
            Number.isNaN(parsed.getTime()) ||
            parsed.toISOString().slice(0, 10) !== day
          ) {
            valid = false;
            continue;
          }

          if (day > today()) continue;

          if (
            ![
              line.debit ?? 0,
              line.credit ?? 0,
            ].every(
              (value) =>
                Number.isFinite(Number(value)) &&
                Number.isSafeInteger(
                  Math.round(Number(value) * 100)
                )
            )
          ) {
            valid = false;
            continue;
          }

          actual +=
            Math.round(Number(line.debit || 0) * 100) -
            Math.round(Number(line.credit || 0) * 100);

          if (!Number.isSafeInteger(actual)) {
            valid = false;
          }
        }

        const register = sum(
          group.assets,
          group.field
        );

        const ledger = valid
          ? (
              group.kind === "Cost"
                ? actual
                : -actual
            ) / 100
          : null;

        return {
          entityCode: group.entityCode,
          accountCode: group.accountCode,
          kind: group.kind,
          register,
          ledger,

          difference:
            register === null || ledger === null
              ? null
              : Math.round(
                  (register - ledger) * 100
                ) / 100,
        };
      }
    );

    res.set("Cache-Control", "no-store");

    return res.json({
      success: true,
      data: assets,
      chartAccounts,
      entities,
      comparisons,

      permissions: {
        canPostDepreciation:
          req.user?.role === "Admin",
      },

      summary: {
        totalAssets: assets.length,
        heldAssets: held.length,

        totalAssetCost: confirmed
          ? sum(held, "purchaseCost")
          : null,

        totalAccumulatedDepreciation: confirmed
          ? sum(held, "accumulatedDepreciation")
          : null,

        totalNetBookValue: confirmed
          ? sum(held, "netBookValue")
          : null,

        historicalReviewCount: assets.filter(
          (asset) =>
            asset.policyVersion !== POLICY
        ).length,
      },
    });
  } catch (error) {
    return respondError(res, error);
  }
};

const createFixedAsset = async (req, res) => {
  try {
    const body = req.body || {};

    if (
      body.confirmAcquisitionReviewed !== true ||
      body.currency !== "JMD"
    ) {
      fail(
        "Confirm JMD currency and that the acquisition has not already been registered.",
        400
      );
    }

    const data = Object.fromEntries(
      [
        "assetName",
        "assetCategory",
        "purchaseDate",
        "inServiceDate",
        "entityCode",
        "assetAccountCode",
        "depreciationExpenseAccountCode",
        "accumulatedDepreciationAccountCode",
        "acquisitionJournalEntryNumber",
        "notes",
      ].map((field) => [
        field,
        text(body[field]),
      ])
    );

    if (
      !data.assetName ||
      !categories.includes(data.assetCategory) ||
      !data.acquisitionJournalEntryNumber
    ) {
      fail(
        "Supply asset name, category and posted acquisition journal.",
        400
      );
    }

    data.purchaseCost =
      amountCents(body.purchaseCost, "Purchase cost") /
      100;

    data.salvageValue =
      amountCents(body.salvageValue, "Salvage value") /
      100;

    data.usefulLifeYears =
      Number(body.usefulLifeYears);

    data.currency = "JMD";
    data.policyVersion = POLICY;

    const term = terms(data);
    const registrationHash = hash(data);

    const assetNumber =
      `AST-${hash(data.acquisitionJournalEntryNumber)}`;

    const indexes =
      await FixedAsset.collection.indexes();

    if (
      !indexes.some(
        (index) =>
          index.unique &&
          Object.keys(index.key).length === 1 &&
          index.key.assetNumber === 1
      )
    ) {
      fail(
        "The existing unique assetNumber index is required before registration."
      );
    }

    const asset =
      await mongoose.connection.transaction(
        async (session) => {
          const existing = await FixedAsset.findOne({
            assetNumber,
          }).session(session);

          if (existing) {
            if (
              existing.registrationHash !==
              registrationHash
            ) {
              fail(
                "This acquisition was already registered with different details."
              );
            }

            return existing;
          }

          const matchingAsset =
            await FixedAsset.findOne({
              assetName: data.assetName,
              purchaseDate: data.purchaseDate,
              purchaseCost: data.purchaseCost,
            }).session(session);

          if (matchingAsset) {
            fail(
              "A matching asset already exists. Review the register before creating another."
            );
          }

          await mappings(data, session);

          const entity = await Entity.findOne({
            entityCode: data.entityCode,
          }).session(session);

          if (!entity) {
            fail("Business entity not found.");
          }

          await acquisition(data, session);

          const [created] = await FixedAsset.create(
            [
              {
                ...data,
                assetNumber,
                registrationHash,

                annualDepreciation:
                  Math.round(
                    (term.cost - term.salvage) *
                      12 / term.months
                  ) / 100,

                monthlyDepreciation:
                  Math.round(
                    (term.cost - term.salvage) /
                      term.months
                  ) / 100,

                accumulatedDepreciation: 0,
                netBookValue: data.purchaseCost,
                appliedPeriods: 0,

                status:
                  term.cost === term.salvage
                    ? "Fully Depreciated"
                    : "Active",
              },
            ],
            { session }
          );

          await writeAuditLog({
            req,
            session,
            action: "REGISTER_FIXED_ASSET",
            module: "Fixed Assets",
            description:
              `Registered ${assetNumber}`,
            targetType: "FixedAsset",
            targetId: assetNumber,

            journalEntryNumber:
              data.acquisitionJournalEntryNumber,

            metadata: {
              ...data,
              acquisitionPostedAgain: false,
            },
          });

          return created;
        }
      );

    return res.status(201).json({
      success: true,
      message:
        "Asset registered against its existing acquisition journal; no purchase was posted again.",
      data: asset,
    });
  } catch (error) {
    return respondError(res, error);
  }
};

const runMonthlyDepreciation = async (req, res) => {
  try {
    const body = req.body || {};
    const preview = body.preview === true;

    if (
      !preview &&
      req.user?.role !== "Admin"
    ) {
      fail(
        "Only an Admin can post depreciation.",
        403
      );
    }

    const period = text(body.period);

    monthIndex(period);

    if (period >= today().slice(0, 7)) {
      fail(
        "Select a completed calendar month. Current/future months cannot be posted.",
        400
      );
    }

    if (
      !Array.isArray(body.assetNumbers) ||
      !body.assetNumbers.length ||
      body.assetNumbers.length > 50 ||
      body.assetNumbers.some(
        (number) =>
          typeof number !== "string" ||
          !number ||
          number !== number.trim()
      ) ||
      new Set(body.assetNumbers).size !==
        body.assetNumbers.length
    ) {
      fail("Select 1–50 distinct assets.", 400);
    }

    const assetNumbers = [
      ...body.assetNumbers,
    ].sort();

    const postingDate = lastDay(period);

    const result =
      await mongoose.connection.transaction(
        async (session) => {
          const plans = [];

          for (const assetNumber of assetNumbers) {
            const asset = await FixedAsset.findOne({
              assetNumber,
            }).session(session);

            if (!asset) {
              fail(
                "A selected asset no longer exists.",
                404
              );
            }

            const plan = calculatePeriod(
              asset,
              period
            );

            await mappings(asset, session);
            await acquisition(asset, session);
            await verifyHistory(asset, session);

            const entity = await Entity.findOne({
              entityCode: asset.entityCode,
            }).session(session);

            if (
              !plan.alreadyPosted &&
              (
                !entity ||
                entity.lifecycleStatus !== "Active" ||
                (
                  entity.effectiveFrom &&
                  postingDate < entity.effectiveFrom
                ) ||
                (
                  entity.effectiveTo &&
                  postingDate > entity.effectiveTo
                )
              )
            ) {
              fail(
                "The owning business must be active and effective on the posting date."
              );
            }

            plans.push({ asset, entity, plan });
          }

          const allRecorded = plans.every(
            (item) => item.plan.alreadyPosted
          );

          if (!allRecorded) {
            try {
              await validateAccountingPeriodOpen(
                postingDate,
                session
              );
            } catch {
              fail(
                "The accounting period/fiscal year could not be verified as open. Review it before posting."
              );
            }
          }

          const snapshotHash = hash(
            plans.map(({ asset, plan }) => ({
              assetNumber: asset.assetNumber,
              period,
              appliedPeriods: asset.appliedPeriods,
              purchaseCost: asset.purchaseCost,
              salvageValue: asset.salvageValue,
              usefulLifeYears: asset.usefulLifeYears,
              inServiceDate: asset.inServiceDate,
              entityCode: asset.entityCode,

              codes: [
                asset.assetAccountCode,
                asset.depreciationExpenseAccountCode,
                asset.accumulatedDepreciationAccountCode,
              ],

              plan,
            }))
          );

          if (
            !preview &&
            !allRecorded &&
            body.snapshotHash !== snapshotHash
          ) {
            fail(
              "The preview is missing or no longer matches the records. Preview again before posting."
            );
          }

          let posted = 0;

          for (const item of plans) {
            const { asset, entity, plan } = item;

            if (
              preview ||
              plan.alreadyPosted
            ) {
              continue;
            }

            let journal = null;

            if (plan.amount > 0) {
              journal = await postJournalEntry({
                session,
                entryDate: postingDate,
                reference: asset.assetNumber,
                sourceModule: "Fixed Assets",

                memo:
                  `Depreciation ${period}; ` +
                  asset.assetName,

                entityId: entity._id,
                entityCode: entity.entityCode,

                entitySnapshot: {
                  entityCode: entity.entityCode,
                  legalName: entity.legalName,
                  entityType: entity.entityType,
                },

                createdBy: actor(req),

                lines: [
                  {
                    accountCode:
                      asset.depreciationExpenseAccountCode,
                    debit: plan.amount,
                    credit: 0,
                    description:
                      `${period} depreciation`,
                  },
                  {
                    accountCode:
                      asset.accumulatedDepreciationAccountCode,
                    debit: 0,
                    credit: plan.amount,
                    description:
                      `${period} accumulated depreciation`,
                  },
                ],
              });
            }

            asset.accumulatedDepreciation =
              plan.after;

            asset.netBookValue = plan.net;

            asset.appliedPeriods =
              Number(asset.appliedPeriods || 0) + 1;

            if (plan.fullyDepreciated) {
              asset.status = "Fully Depreciated";
            }

            asset.depreciationHistory.push({
              period,
              amount: plan.amount,
              accumulatedDepreciation: plan.after,
              netBookValue: plan.net,

              journalEntryNumber:
                journal?.entryNumber || "",

              postedAt: new Date(),
              postedBy: actor(req),
            });

            await asset.save({ session });

            plan.journalEntryNumber =
              journal?.entryNumber || "";

            posted++;

            await writeAuditLog({
              req,
              session,
              action: "POST_ASSET_DEPRECIATION",
              module: "Fixed Assets",

              description:
                `Depreciation ${period}; ` +
                asset.assetNumber,

              targetType: "FixedAsset",
              targetId: asset.assetNumber,
              journalEntryNumber:
                plan.journalEntryNumber,

              metadata: {
                period,
                amount: plan.amount,
                before: plan.before,
                after: plan.after,
                netBookValue: plan.net,
                policy: POLICY,
              },
            });
          }

          return {
            preview,
            period,
            snapshotHash,
            depreciatedAssets: posted,
            replayed: !preview && allRecorded,

            rows: plans.map(({ asset, plan }) => ({
              assetNumber: asset.assetNumber,
              assetName: asset.assetName,
              ...plan,
            })),
          };
        }
      );

    return res.json({
      success: true,

      message: preview
        ? "Preview only. No records changed."
        : result.replayed
          ? "These asset periods were already recorded. No duplicate entries were created."
          : "Selected depreciation periods posted together.",

      ...result,
    });
  } catch (error) {
    return respondError(res, error);
  }
};

module.exports = {
  getFixedAssets,
  createFixedAsset,
  runMonthlyDepreciation,
};