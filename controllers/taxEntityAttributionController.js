const TaxRecord = require("../models/TaxRecord");
const BusinessEntity = require("../models/BusinessEntity");

const getUserName = (user) =>
  user?.fullName ||
  user?.name ||
  user?.email ||
  "System User";

const cleanText = (value) =>
  String(value || "").trim();

const buildEntitySnapshot = (entity) => ({
  entityId: entity._id,
  entityCode: entity.entityCode,
  legalName: entity.legalName,
  tradingName: entity.tradingName || "",
  entityType: entity.entityType,
  lifecycleStatus: entity.lifecycleStatus,
  effectiveFrom: entity.effectiveFrom,
  effectiveTo: entity.effectiveTo,
  registrationNumber: entity.registrationNumber || "",
  registrationDate: entity.registrationDate || "",
  incorporationDate: entity.incorporationDate || null,
  trn: entity.trn || "",
  registeredAddress: entity.registeredAddress || "",
  fiscalYearStart: entity.fiscalYearStart || "",
  fiscalYearEnd: entity.fiscalYearEnd || "",
  taxTreatment: entity.taxTreatment,
  accountingConfiguration:
    entity.accountingConfiguration,
  predecessorEntityCode:
    entity.predecessorEntityCode || "",
  successorEntityCode:
    entity.successorEntityCode || "",
});

const getPeriodBoundaries = (periodKey) => {
  const [year, month] = periodKey
    .split("-")
    .map(Number);

  return {
    startDate: new Date(
      Date.UTC(year, month - 1, 1, 12)
    ),

    endDate: new Date(
      Date.UTC(year, month, 0, 12)
    ),
  };
};

const backfillTaxRecordEntities = async (req, res) => {
  try {
    const entityCode = cleanText(
      req.body.entityCode
    );

    const periodKey = cleanText(
      req.body.periodKey
    );

    const apply = req.body.apply === true;
    const confirmation = cleanText(
      req.body.confirmation
    );

    if (!entityCode) {
      return res.status(400).json({
        success: false,
        message: "An entity code is required.",
      });
    }

    if (!/^\d{4}-\d{2}$/.test(periodKey)) {
      return res.status(400).json({
        success: false,
        message:
          "A period key using YYYY-MM format is required.",
      });
    }

    const entity = await BusinessEntity.findOne({
      entityCode,
    });

    if (!entity) {
      return res.status(404).json({
        success: false,
        message:
          `Business entity ${entityCode} was not found.`,
      });
    }

    const { startDate, endDate } =
      getPeriodBoundaries(periodKey);

    const entityEffectiveFrom = new Date(
      `${entity.effectiveFrom}T00:00:00.000Z`
    );

    const entityEffectiveTo = entity.effectiveTo
      ? new Date(
          `${entity.effectiveTo}T23:59:59.999Z`
        )
      : null;

    if (
      startDate < entityEffectiveFrom ||
      (entityEffectiveTo &&
        endDate > entityEffectiveTo)
    ) {
      return res.status(409).json({
        success: false,
        message:
          `${entityCode} was not effective for the entire ${periodKey} period.`,
      });
    }

    const records = await TaxRecord.find({
      periodKey,

      $or: [
        { entityCode: "" },
        { entityCode: null },
        { entityCode: { $exists: false } },
      ],
    }).sort({
      taxType: 1,
      taxNumber: 1,
    });

    const preview = records.map((record) => ({
      taxNumber: record.taxNumber,
      taxType: record.taxType,
      periodKey: record.periodKey,
      status: record.status,
      taxDue: record.taxDue,
      amountPaid: record.amountPaid,
      balanceDue: record.balanceDue,
      proposedEntityCode: entity.entityCode,
      proposedEntityName: entity.legalName,
    }));

    if (!apply) {
      return res.json({
        success: true,
        message:
          "TaxRecord entity-attribution preview generated successfully. No records were changed.",
        filters: {
          entityCode,
          periodKey,
          apply: false,
        },
        totalRecords: records.length,
        data: preview,
      });
    }

    const requiredConfirmation =
      `BACKFILL ${entityCode} ${periodKey}`;

    if (confirmation !== requiredConfirmation) {
      return res.status(400).json({
        success: false,
        message:
          `Apply mode requires confirmation: ${requiredConfirmation}`,
      });
    }

    if (records.length === 0) {
      return res.json({
        success: true,
        message:
          "No unattributed TaxRecords matched the selected entity and period.",
        totalRecords: 0,
        data: [],
      });
    }

    const userName = getUserName(req.user);
    const performedAt = new Date();
    const entitySnapshot =
      buildEntitySnapshot(entity);

    const operations = records.map((record) => ({
      updateOne: {
        filter: {
          _id: record._id,

          $or: [
            { entityCode: "" },
            { entityCode: null },
            {
              entityCode: {
                $exists: false,
              },
            },
          ],
        },

        update: {
          $set: {
            entityId: entity._id,
            entityCode: entity.entityCode,
            entitySnapshot,
          },

          $push: {
            entityAttributionHistory: {
              entityCode: entity.entityCode,
              periodKey,
              action: "Backfilled",
              notes:
                "Historical TaxRecord entity attribution applied through the controlled Tax Center backfill workflow.",
              performedBy: userName,
              performedAt,
            },
          },
        },
      },
    }));

    const result =
      await TaxRecord.bulkWrite(operations);

    const updatedRecords = await TaxRecord.find({
      _id: {
        $in: records.map((record) => record._id),
      },
    }).sort({
      taxType: 1,
      taxNumber: 1,
    });

    return res.json({
      success: true,
      message:
        `${result.modifiedCount} TaxRecords attributed to ${entityCode} successfully.`,
      filters: {
        entityCode,
        periodKey,
        apply: true,
      },
      matchedRecords: result.matchedCount,
      modifiedRecords: result.modifiedCount,
      data: updatedRecords,
    });
  } catch (error) {
    console.error(
      "TaxRecord entity-attribution error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Could not process TaxRecord entity attribution.",
      error: error.message,
    });
  }
};

module.exports = {
  backfillTaxRecordEntities,
};