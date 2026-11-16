const mongoose = require("mongoose");

const BusinessEntity = require(
  "../models/BusinessEntity"
);

const S = require("./taxScopeService");
const T = require("./taxControl");

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

const operatingEntity = async (
  entryDate,
  session = null
) => {
  const transactionDate = T.date(
    entryDate,
    "Transaction date"
  );

  if (session?.inTransaction()) {
    await Control.updateOne(
      { _id: "operating-entity" },
      {
        $inc: {
          revision: 1,
        },
      },
      {
        upsert: true,
        session,
      }
    );
  }

  const entities =
    await BusinessEntity.find({
      lifecycleStatus: "Active",

      effectiveFrom: {
        $lte: transactionDate,
      },

      $or: [
        { effectiveTo: "" },
        { effectiveTo: null },
        {
          effectiveTo: {
            $gte: transactionDate,
          },
        },
      ],
    }).session(session);

  if (entities.length !== 1) {
    T.fail(
      "Exactly one Active business entity must cover the transaction date. Review business-entity setup.",
      409
    );
  }

  const entity = entities[0];

  if (
    !entity.accountingConfiguration
      ?.coaInitialized ||
    !entity.accountingConfiguration
      ?.reportingInitialized
  ) {
    T.fail(
      "The operating business requires initialized accounting and financial reporting.",
      409
    );
  }

  return {
    entityId: entity._id,
    entityCode: entity.entityCode,

    entitySnapshot:
      S.snapshot(entity),

    businessEntitySnapshot: {
      entityCode:
        entity.entityCode,

      legalName:
        entity.legalName,

      businessType:
        entity.entityType,

      registrationNumber:
        entity.registrationNumber || "",

      trn:
        entity.trn || "",

      effectiveFrom:
        entity.effectiveFrom,
    },
  };
};

module.exports = {
  operatingEntity,
};