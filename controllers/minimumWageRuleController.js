const MinimumWageRule = require(
  "../models/MinimumWageRule"
);

const {
  writeAuditLog,
} = require("../utils/auditLogger");

const getActorName = (req) =>
  String(
    req?.user?.fullName ||
      req?.user?.name ||
      req?.user?.email ||
      "System"
  ).trim();

const normalizeStartDate = (
  value,
  fieldName
) => {
  const rawValue = String(
    value || ""
  ).trim();

  if (!rawValue) {
    throw new Error(
      `${fieldName} is required.`
    );
  }

  const date = new Date(
    `${rawValue.slice(
      0,
      10
    )}T00:00:00.000Z`
  );

  if (
    Number.isNaN(date.getTime())
  ) {
    throw new Error(
      `${fieldName} must be a valid date.`
    );
  }

  return date;
};

const normalizeEndDate = (
  value,
  fieldName
) => {
  const rawValue = String(
    value || ""
  ).trim();

  if (!rawValue) {
    return null;
  }

  const date = new Date(
    `${rawValue.slice(
      0,
      10
    )}T23:59:59.999Z`
  );

  if (
    Number.isNaN(date.getTime())
  ) {
    throw new Error(
      `${fieldName} must be a valid date.`
    );
  }

  return date;
};

const buildRuleValues = (
  body,
  actorName
) => ({
  ruleCode: String(
    body.ruleCode || ""
  )
    .trim()
    .toUpperCase(),

  name: String(
    body.name || ""
  ).trim(),

  jurisdiction: String(
    body.jurisdiction ||
      "Jamaica"
  ).trim(),

  workerCategory: String(
    body.workerCategory ||
      "General"
  ).trim(),

  currency: String(
    body.currency || "JMD"
  )
    .trim()
    .toUpperCase(),

  effectiveFrom:
    normalizeStartDate(
      body.effectiveFrom,
      "Effective-from date"
    ),

  effectiveTo:
    normalizeEndDate(
      body.effectiveTo,
      "Effective-to date"
    ),

  standardWeeklyHours: Number(
    body.standardWeeklyHours ??
      40
  ),

  weeklyRate: Number(
    body.weeklyRate || 0
  ),

  hourlyRate: Number(
    body.hourlyRate || 0
  ),

  calculationSettings: {
    assessPayableHours:
      body.calculationSettings
        ?.assessPayableHours !==
      false,

    includeApprovedAdjustments:
      body.calculationSettings
        ?.includeApprovedAdjustments !==
      false,

    includePaidLeaveHours:
      body.calculationSettings
        ?.includePaidLeaveHours !==
      false,

    excludeUnpaidLeaveHours:
      body.calculationSettings
        ?.excludeUnpaidLeaveHours !==
      false,

    requirePayrollReadyAttendance:
      body.calculationSettings
        ?.requirePayrollReadyAttendance !==
      false,

    blockNonCompliantPayrollApproval:
      body.calculationSettings
        ?.blockNonCompliantPayrollApproval !==
      false,
  },

  sourceName: String(
    body.sourceName || ""
  ).trim(),

  sourceUrl: String(
    body.sourceUrl || ""
  ).trim(),

  sourceReference: String(
    body.sourceReference || ""
  ).trim(),

  sourceVerifiedAt:
    normalizeStartDate(
      body.sourceVerifiedAt,
      "Source verification date"
    ),

  notes: String(
    body.notes || ""
  ).trim(),

  updatedBy: actorName,
});

const validateRequiredValues = (
  values
) => {
  if (!values.ruleCode) {
    throw new Error(
      "Minimum-wage rule code is required."
    );
  }

  if (!values.name) {
    throw new Error(
      "Minimum-wage rule name is required."
    );
  }

  if (
    values.standardWeeklyHours <=
      0 ||
    values.weeklyRate <= 0 ||
    values.hourlyRate <= 0
  ) {
    throw new Error(
      "Standard weekly hours, weekly rate and hourly rate must be greater than zero."
    );
  }

  if (
    !values.sourceName ||
    !values.sourceUrl ||
    !values.sourceReference
  ) {
    throw new Error(
      "Minimum-wage source name, URL and reference are required."
    );
  }
};

const getMinimumWageRules =
  async (req, res) => {
    try {
      const query = {};

      if (req.query.status) {
        query.status =
          req.query.status;
      }

      if (
        req.query.workerCategory
      ) {
        query.workerCategory =
          req.query.workerCategory;
      }

      const rules =
        await MinimumWageRule.find(
          query
        ).sort({
          effectiveFrom: -1,
          createdAt: -1,
        });

      return res.json({
        success: true,
        message:
          "Minimum-wage rules retrieved successfully",
        totalRecords:
          rules.length,
        data: rules,
      });
    } catch (error) {
      console.error(
        "Get minimum-wage rules error:",
        error
      );

      return res
        .status(500)
        .json({
          success: false,
          message:
            "Could not retrieve minimum-wage rules.",
          error: error.message,
        });
    }
  };

const createMinimumWageRule =
  async (req, res) => {
    try {
      const actorName =
        getActorName(req);

      const values =
        buildRuleValues(
          req.body,
          actorName
        );

      validateRequiredValues(
        values
      );

      const existingRule =
        await MinimumWageRule.findOne(
          {
            ruleCode:
              values.ruleCode,
          }
        );

      if (existingRule) {
        return res
          .status(409)
          .json({
            success: false,
            message:
              `${values.ruleCode} already exists.`,
          });
      }

      const rule =
        await MinimumWageRule.create(
          {
            ...values,
            status: "Draft",
            createdBy:
              actorName,
          }
        );

      await writeAuditLog({
        req,
        action:
          "CREATE_MINIMUM_WAGE_RULE",
        module: "HR",
        description:
          `Draft minimum-wage rule ${rule.ruleCode} created`,
        targetType:
          "MinimumWageRule",
        targetId:
          rule.ruleCode,
        afterValues:
          rule.toObject(),
      });

      return res
        .status(201)
        .json({
          success: true,
          message:
            "Draft minimum-wage rule created successfully",
          data: rule,
        });
    } catch (error) {
      console.error(
        "Create minimum-wage rule error:",
        error
      );

      return res
        .status(400)
        .json({
          success: false,
          message:
            error.message ||
            "Could not create minimum-wage rule.",
        });
    }
  };

const updateDraftMinimumWageRule =
  async (req, res) => {
    try {
      const rule =
        await MinimumWageRule.findOne(
          {
            ruleCode: String(
              req.params
                .ruleCode || ""
            )
              .trim()
              .toUpperCase(),
          }
        );

      if (!rule) {
        return res
          .status(404)
          .json({
            success: false,
            message:
              "Minimum-wage rule was not found.",
          });
      }

      if (
        rule.status !== "Draft"
      ) {
        return res
          .status(409)
          .json({
            success: false,
            message:
              "Only Draft minimum-wage rules can be edited.",
          });
      }

      const beforeValues =
        rule.toObject();

      const values =
        buildRuleValues(
          {
            ...rule.toObject(),
            ...req.body,
            calculationSettings: {
              ...rule
                .calculationSettings
                ?.toObject?.(),
              ...req.body
                .calculationSettings,
            },
          },
          getActorName(req)
        );

      validateRequiredValues(
        values
      );

      Object.assign(
        rule,
        values
      );

      await rule.save();

      await writeAuditLog({
        req,
        action:
          "UPDATE_MINIMUM_WAGE_RULE",
        module: "HR",
        description:
          `Draft minimum-wage rule ${rule.ruleCode} updated`,
        targetType:
          "MinimumWageRule",
        targetId:
          rule.ruleCode,
        beforeValues,
        afterValues:
          rule.toObject(),
      });

      return res.json({
        success: true,
        message:
          "Draft minimum-wage rule updated successfully",
        data: rule,
      });
    } catch (error) {
      console.error(
        "Update minimum-wage rule error:",
        error
      );

      return res
        .status(400)
        .json({
          success: false,
          message:
            error.message ||
            "Could not update minimum-wage rule.",
        });
    }
  };

const activateMinimumWageRule =
  async (req, res) => {
    try {
      const rule =
        await MinimumWageRule.findOne(
          {
            ruleCode: String(
              req.params
                .ruleCode || ""
            )
              .trim()
              .toUpperCase(),
          }
        );

      if (!rule) {
        return res
          .status(404)
          .json({
            success: false,
            message:
              "Minimum-wage rule was not found.",
          });
      }

      if (
        rule.status !== "Draft"
      ) {
        return res
          .status(409)
          .json({
            success: false,
            message:
              "Only a Draft minimum-wage rule can be activated.",
          });
      }

      const overlappingRule =
        await MinimumWageRule.findOne(
          {
            _id: {
              $ne: rule._id,
            },

            workerCategory:
              rule.workerCategory,

            status: "Active",

            effectiveFrom: {
              $lte:
                rule.effectiveTo ||
                new Date(
                  "9999-12-31T23:59:59.999Z"
                ),
            },

            $or: [
              {
                effectiveTo:
                  null,
              },
              {
                effectiveTo: {
                  $gte:
                    rule.effectiveFrom,
                },
              },
            ],
          }
        );

      if (overlappingRule) {
        return res
          .status(409)
          .json({
            success: false,
            message:
              `${rule.ruleCode} overlaps active rule ${overlappingRule.ruleCode}. Effective dates must not overlap.`,
            data: {
              overlappingRuleCode:
                overlappingRule.ruleCode,
            },
          });
      }

      const beforeValues =
        rule.toObject();

      rule.status = "Active";
      rule.approvedBy =
        getActorName(req);
      rule.approvedAt =
        new Date();
      rule.updatedBy =
        getActorName(req);

      await rule.save();

      await writeAuditLog({
        req,
        action:
          "ACTIVATE_MINIMUM_WAGE_RULE",
        module: "HR",
        description:
          `Minimum-wage rule ${rule.ruleCode} activated`,
        targetType:
          "MinimumWageRule",
        targetId:
          rule.ruleCode,
        beforeValues,
        afterValues:
          rule.toObject(),
      });

      return res.json({
        success: true,
        message:
          `${rule.ruleCode} activated successfully.`,
        data: rule,
      });
    } catch (error) {
      console.error(
        "Activate minimum-wage rule error:",
        error
      );

      return res
        .status(400)
        .json({
          success: false,
          message:
            error.message ||
            "Could not activate minimum-wage rule.",
        });
    }
  };

module.exports = {
  getMinimumWageRules,
  createMinimumWageRule,
  updateDraftMinimumWageRule,
  activateMinimumWageRule,
};