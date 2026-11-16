const crypto = require("crypto");
const mongoose = require("mongoose");

const BusinessEntity = require("../models/BusinessEntity");
const IncomeTaxRule = require("../models/IncomeTaxRule");
const TaxRegistrationProfile = require("../models/TaxRegistrationProfile");
const JournalEntry = require("../models/JournalEntry");
const GeneralLedgerTransaction = require("../models/GeneralLedgerTransaction");
const Invoice = require("../models/Invoice");
const Expense = require("../models/Expense");
const TaxRecord = require("../models/TaxRecord");
const Payroll = require("../models/Payroll");

const {
  writeAuditLog,
} = require("../utils/auditLogger");

const P = require("../services/entityTransitionPolicy");

const controlSchema = new mongoose.Schema(
  {
    _id: String,

    revision: {
      type: Number,
      default: 0,
    },
  },
  { versionKey: false }
);

const Control =
  mongoose.models.BusinessEntityTransitionControl ||
  mongoose.model(
    "BusinessEntityTransitionControl",
    controlSchema
  );

const actor = (req) =>
  req.user?.fullName ||
  req.user?.email ||
  req.user?.userId ||
  "Administrator";

const codeOf = (
  value,
  label = "Entity code"
) => P.text(value, label).toUpperCase();

const bodyOf = (req) => {
  if (
    !req.body ||
    typeof req.body !== "object" ||
    Array.isArray(req.body)
  ) {
    P.fail(
      "A request object is required.",
      400
    );
  }

  return req.body;
};

const run = (handler) => async (req, res) => {
  res.set("Cache-Control", "no-store");

  try {
    if (req.user?.role !== "Admin") {
      P.fail(
        "Only an administrator can change business registration or activation.",
        403
      );
    }

    await handler(req, res);
  } catch (error) {
    console.error(
      "Business entity workflow error:",
      error
    );

    const statusCode =
      error.statusCode ||
      (error.code === 11000
        ? 409
        : error.name === "ValidationError"
          ? 400
          : 500);

    return res.status(statusCode).json({
      success: false,

      message:
        statusCode === 500
          ? "Could not complete the entity workflow. Refresh and review before retrying."
          : error.message,
    });
  }
};

const transact = async (work) => {
  await Control.updateOne(
    { _id: "operating-entity" },
    {
      $setOnInsert: {
        revision: 0,
      },
    },
    { upsert: true }
  );

  return mongoose.connection.transaction(
    async (session) => {
      await Control.updateOne(
        { _id: "operating-entity" },
        {
          $inc: {
            revision: 1,
          },
        },
        { session }
      );

      return work(session);
    }
  );
};

const audit = (
  req,
  session,
  action,
  entity,
  beforeValues,
  metadata = {}
) =>
  writeAuditLog({
    req,
    session,
    action,
    module: "Business Entities",
    targetType: "BusinessEntity",
    targetId: entity.entityCode,
    description:
      `${action}: ${entity.entityCode}`,
    beforeValues,
    afterValues: entity.toObject(),
    metadata,
  });

const writableFields = [
  "legalName",
  "tradingName",
  "effectiveFrom",
  "registrationNumber",
  "registrationDate",
  "incorporationDate",
  "trn",
  "registeredAddress",
  "businessEmail",
  "businessPhone",
  "notes",
];

const setupValues = (
  body,
  creating = false
) => {
  const allowed = new Set([
    ...writableFields,
    ...(creating
      ? ["entityCode", "entityType"]
      : []),
  ]);

  for (const key of Object.keys(body)) {
    if (!allowed.has(key)) {
      P.fail(
        `Field ${key} must be changed through its dedicated workflow.`,
        400
      );
    }
  }

  const result = {};

  for (const field of writableFields) {
    if (body[field] === undefined) {
      continue;
    }

    const value = P.text(
      body[field],
      field,
      [
        "legalName",
        "effectiveFrom",
      ].includes(field)
    );

    result[field] =
      [
        "effectiveFrom",
        "registrationDate",
        "incorporationDate",
      ].includes(field) && value
        ? P.date(value, field)
        : value;
  }

  return result;
};

const createBusinessEntity = run(
  async (req, res) => {
    const body = bodyOf(req);

    if (
      body.entityType !==
      "Limited Liability Company"
    ) {
      P.fail(
        "This setup creates a Planned LLC.",
        400
      );
    }

    const values = setupValues(
      body,
      true
    );

    P.text(
      values.legalName,
      "Legal name"
    );

    P.date(
      values.effectiveFrom,
      "Proposed operational effective date"
    );

    const data = await transact(
      async (session) => {
        const [entity] =
          await BusinessEntity.create(
            [
              {
                ...values,

                entityCode: codeOf(
                  body.entityCode
                ),

                entityType:
                  "Limited Liability Company",

                lifecycleStatus:
                  "Planned",

                taxTreatment: {
                  incomeTaxType:
                    "Company Income Tax",

                  taxConfigurationStatus:
                    "Not Configured",
                },

                createdBy: actor(req),
                updatedBy: actor(req),
              },
            ],
            { session }
          );

        await audit(
          req,
          session,
          "CREATE_PLANNED_LLC",
          entity,
          null
        );

        return entity;
      }
    );

    return res.status(201).json({
      success: true,
      message:
        "Planned LLC created. Registration and activation remain separate steps.",
      data,
    });
  }
);

const updatePlannedBusinessEntity = run(
  async (req, res) => {
    const values = setupValues(
      bodyOf(req)
    );

    const data = await transact(
      async (session) => {
        const entity =
          await BusinessEntity.findOne({
            entityCode: codeOf(
              req.params.entityCode
            ),
          }).session(session);

        if (!entity) {
          P.fail(
            "Business entity not found.",
            404
          );
        }

        if (
          entity.entityType !==
            "Limited Liability Company" ||
          ![
            "Planned",
            "Registration In Progress",
            "Registered",
          ].includes(
            entity.lifecycleStatus
          )
        ) {
          P.fail(
            "Only an LLC awaiting activation can be edited through this setup."
          );
        }

        if (
          entity.lifecycleStatus ===
            "Registered" &&
          Object.keys(values).some(
            (field) =>
              ![
                "effectiveFrom",
                "notes",
              ].includes(field)
          )
        ) {
          P.fail(
            "Registered legal details are locked. Only the proposed operational date and notes may be updated here."
          );
        }

        const before =
          entity.toObject();

        Object.assign(
          entity,
          values,
          {
            updatedBy: actor(req),
          }
        );

        await entity.save({ session });

        await audit(
          req,
          session,
          "UPDATE_ENTITY_SETUP",
          entity,
          before
        );

        return entity;
      }
    );

    return res.json({
      success: true,
      message: "Entity setup updated.",
      data,
    });
  }
);

const registerBusinessEntity = run(
  async (req, res) => {
    const data = await transact(
      async (session) => {
        const entity =
          await BusinessEntity.findOne({
            entityCode: codeOf(
              req.params.entityCode
            ),
          }).session(session);

        if (!entity) {
          P.fail(
            "Business entity not found.",
            404
          );
        }

        if (
          entity.entityType !==
            "Limited Liability Company" ||
          ![
            "Planned",
            "Registration In Progress",
          ].includes(
            entity.lifecycleStatus
          )
        ) {
          P.fail(
            "Only a Planned LLC or an LLC undergoing registration can be registered here."
          );
        }

        for (const field of [
          "registrationNumber",
          "trn",
          "incorporationDate",
          "registrationDate",
        ]) {
          P.text(entity[field], field);
        }

        for (const field of [
          "incorporationDate",
          "registrationDate",
        ]) {
          if (
            P.date(
              entity[field],
              field
            ) > P.today()
          ) {
            P.fail(
              "Registration dates cannot be in the future.",
              400
            );
          }
        }

        const before =
          entity.toObject();

        entity.lifecycleStatus =
          "Registered";

        entity.updatedBy =
          actor(req);

        await entity.save({ session });

        await audit(
          req,
          session,
          "REGISTER_LLC",
          entity,
          before
        );

        return entity;
      }
    );

    return res.json({
      success: true,
      message:
        "LLC registration recorded. The operating business has not switched.",
      data,
    });
  }
);

const coversDate = (
  record,
  effectiveDate
) => {
  if (
    !record ||
    record.status !== "Active"
  ) {
    return false;
  }

  const start = new Date(
    record.effectiveFrom
  );

  if (
    !Number.isFinite(start.getTime()) ||
    start.toISOString().slice(0, 10) >
      effectiveDate
  ) {
    return false;
  }

  if (!record.effectiveTo) {
    return true;
  }

  const end = new Date(
    record.effectiveTo
  );

  return (
    Number.isFinite(end.getTime()) &&
    end.toISOString().slice(0, 10) >=
      effectiveDate
  );
};

const hasVerifiedSource = (record) =>
  Boolean(
    record?.sourceName?.trim() &&
      (record.sourceUrl?.trim() ||
        record.sourceReference?.trim()) &&
      record.sourceVerifiedAt
  );

const reviewActivation = async (
  req,
  session
) => {
  const body = bodyOf(req);

  const code = codeOf(
    req.params.entityCode
  );

  const predecessorCode = codeOf(
    body.predecessorEntityCode,
    "Predecessor entity code"
  );

  const effectiveDate = P.date(
    body.effectiveDate,
    "Operational effective date"
  );

  const entities =
    await BusinessEntity.find()
      .session(session);

  const assessment = P.assess({
    entities,
    code,
    predecessorCode,
    effectiveDate,
  });

  const { entity } = assessment;

  const rule =
    await IncomeTaxRule.findOne({
      ruleCode:
        entity.taxTreatment
          .incomeTaxRuleCode,
    }).session(session);

  if (
    !coversDate(rule, effectiveDate) ||
    rule.countryCode !== "JM" ||
    rule.currency !== "JMD" ||
    rule.incomeTaxType !==
      "Company Income Tax" ||
    !rule.applicableEntityTypes.includes(
      "Limited Liability Company"
    ) ||
    !hasVerifiedSource(rule)
  ) {
    P.fail(
      "The assigned company income-tax rule must be verified and effective on the switch date."
    );
  }

  const profile =
    await TaxRegistrationProfile.findOne({
      registrationCode:
        entity.taxTreatment
          .gctRegistrationCode,

      entityCode: code,
      taxType: "GCT",
    }).session(session);

  if (
    !coversDate(
      profile,
      effectiveDate
    ) ||
    profile.businessType !==
      "Limited Liability Company" ||
    !hasVerifiedSource(profile) ||
    ![
      "Not Registered",
      "Registered",
    ].includes(
      profile.registrationStatus
    ) ||
    (
      profile.registrationStatus ===
        "Registered" &&
      !profile.registrationNumber
    )
  ) {
    P.fail(
      "The assigned LLC GCT registration or monitoring profile must be verified and effective on the switch date."
    );
  }

  if (
    entity.taxTreatment
      .gctRegistrationStatus !==
    profile.registrationStatus
  ) {
    P.fail(
      "The LLC GCT treatment and assigned profile disagree."
    );
  }

  for (const Model of [
    JournalEntry,
    GeneralLedgerTransaction,
  ]) {
    const activity =
      await Model.findOne({
        entityCode:
          predecessorCode,

        entryDate: {
          $gte: effectiveDate,
        },
      }).session(session);

    if (activity) {
      P.fail(
        "The sole proprietorship has journal or ledger activity on or after the proposed switch. Review it before activation."
      );
    }
  }

  const employerMatches = {
    $or: [
      { entityCode: predecessorCode },
      {
        "entitySnapshot.entityCode":
          predecessorCode,
      },
      {
        "businessEntitySnapshot.entityCode":
          predecessorCode,
      },
    ],
  };

  const sourceChecks = [
    [
      Invoice,
      {
        ...employerMatches,

        createdAt: {
          $gte: effectiveDate,
        },

        status: {
          $nin: [
            "Cancelled",
            "Refunded",
          ],
        },
      },
    ],

    [
      Expense,
      {
        ...employerMatches,

        date: {
          $gte: effectiveDate,
        },

        status: {
          $ne: "Cancelled",
        },
      },
    ],

    [
      TaxRecord,
      {
        ...employerMatches,

        periodEnd: {
          $gte: effectiveDate,
        },

        status: {
          $ne: "Cancelled",
        },
      },
    ],

    [
      Payroll,
      {
        ...employerMatches,

        payPeriod: {
          $gte:
            effectiveDate.slice(0, 7),
        },

        status: {
          $nin: [
            "Cancelled",
            "Reversed",
          ],
        },
      },
    ],
  ];

  for (const [Model, query] of
    sourceChecks) {
    const source =
      await Model.findOne(query)
        .session(session);

    if (source) {
      P.fail(
        "The sole proprietorship has source records crossing the proposed switch. Review their dates and reporting periods first. Records will not be moved automatically."
      );
    }
  }

  const entityHash =
    P.fingerprint(
      entities,
      code,
      effectiveDate,
      predecessorCode
    );

  const previewHash = crypto
    .createHash("sha256")
    .update(
      JSON.stringify({
        entityHash,
        rule: rule.toObject(),
        profile: profile.toObject(),
      })
    )
    .digest("hex");

  return {
    ...assessment,
    code,
    predecessorCode,
    effectiveDate,
    previewHash,
  };
};

const previewBusinessEntityActivation =
  run(async (req, res) => {
    const result = await transact(
      (session) =>
        reviewActivation(
          req,
          session
        )
    );

    return res.json({
      success: true,
      message:
        "Activation preview generated. Business entities and financial records were not changed.",

      data: {
        entityCode: result.code,
        legalName:
          result.entity.legalName,

        effectiveDate:
          result.effectiveDate,

        predecessorEntityCode:
          result.predecessorCode,

        predecessorEnd:
          result.predecessorEnd,

        previewHash:
          result.previewHash,

        notice:
          "Historical transactions retain their original entity. Activation does not transfer assets, liabilities, documents, or balances.",
      },
    });
  });

const activateBusinessEntity = run(
  async (req, res) => {
    const data = await transact(
      async (session) => {
        const result =
          await reviewActivation(
            req,
            session
          );

        const {
          entity,
          predecessor,
          code,
          effectiveDate,
          predecessorEnd,
          previewHash,
        } = result;

        if (
          req.body.previewHash !==
          previewHash
        ) {
          P.fail(
            "Configuration changed or the preview is missing. Generate and review a fresh activation preview."
          );
        }

        const confirmation =
          `ACTIVATE ${code} ${effectiveDate}`;

        if (
          req.body.confirmation !==
          confirmation
        ) {
          P.fail(
            `Type ${confirmation} to confirm this transition.`,
            400
          );
        }

        const reason = P.text(
          req.body.reason,
          "Transition reason"
        );

        const beforeEntity =
          entity.toObject();

        const beforePredecessor =
          predecessor.toObject();

        predecessor.effectiveTo =
          predecessorEnd;

        predecessor.successorEntityCode =
          code;

        entity.predecessorEntityCode =
          predecessor.entityCode;

        entity.lifecycleStatus =
          "Active";

        const approvedAt =
          new Date();

        for (const record of [
          predecessor,
          entity,
        ]) {
          record.transition = {
            transitionDate:
              effectiveDate,

            transitionReason:
              reason,

            assetTransferRequired:
              Boolean(
                record.transition
                  ?.assetTransferRequired
              ),

            liabilityTransferRequired:
              Boolean(
                record.transition
                  ?.liabilityTransferRequired
              ),

            historicalRecordsLocked:
              true,

            approvedBy:
              actor(req),

            approvedAt,
          };

          record.updatedBy =
            actor(req);

          await record.save({
            session,
          });
        }

        await audit(
          req,
          session,
          "END_PREDECESSOR_OPERATING_PERIOD",
          predecessor,
          beforePredecessor,
          {
            successorEntityCode:
              code,
          }
        );

        await audit(
          req,
          session,
          "ACTIVATE_LLC",
          entity,
          beforeEntity,
          {
            predecessorEntityCode:
              predecessor.entityCode,

            effectiveDate,
            previewHash,
          }
        );

        return entity;
      }
    );

    return res.json({
      success: true,
      message:
        "The reviewed LLC operating transition was activated. Historical transactions and balances were not transferred.",
      data,
    });
  }
);

const configureBusinessEntityGct = run(
  async (req, res) => {
    const body = bodyOf(req);

    const registrationCode = P.text(
      body.registrationCode,
      "GCT profile code"
    );

    const data = await transact(
      async (session) => {
        const entity =
          await BusinessEntity.findOne({
            entityCode: codeOf(
              req.params.entityCode
            ),
          }).session(session);

        if (!entity) {
          P.fail(
            "Business entity not found.",
            404
          );
        }

        if (
          entity.entityType !==
            "Limited Liability Company" ||
          ![
            "Planned",
            "Registration In Progress",
            "Registered",
          ].includes(
            entity.lifecycleStatus
          )
        ) {
          P.fail(
            "This assignment is available only during LLC setup before activation."
          );
        }

        const profile =
          await TaxRegistrationProfile.findOne({
            registrationCode,
            entityCode:
              entity.entityCode,
            taxType: "GCT",
            status: "Active",
          }).session(session);

        if (
          !profile ||
          profile.businessType !==
            entity.entityType ||
          !hasVerifiedSource(profile) ||
          ![
            "Not Registered",
            "Registered",
          ].includes(
            profile.registrationStatus
          ) ||
          !coversDate(
            profile,
            P.date(
              entity.effectiveFrom,
              "Proposed operational date"
            )
          )
        ) {
          P.fail(
            "Select a verified Active GCT registration or monitoring profile belonging to this LLC and covering its proposed operational date."
          );
        }

        const before =
          entity.toObject();

        entity.taxTreatment
          .gctRegistrationCode =
          profile.registrationCode;

        entity.taxTreatment
          .gctRegistrationStatus =
          profile.registrationStatus;

        entity.updatedBy =
          actor(req);

        await entity.save({
          session,
        });

        await audit(
          req,
          session,
          "ASSIGN_ENTITY_GCT_PROFILE",
          entity,
          before
        );

        return entity;
      }
    );

    return res.json({
      success: true,
      message:
        "GCT profile assigned to the LLC setup.",
      data,
    });
  }
);

module.exports = {
  createBusinessEntity,
  updatePlannedBusinessEntity,
  registerBusinessEntity,
  previewBusinessEntityActivation,
  activateBusinessEntity,
  configureBusinessEntityGct,
};