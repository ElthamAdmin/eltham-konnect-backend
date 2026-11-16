const mongoose = require("mongoose");
const crypto = require("crypto");

const taxControlledOperationSchema =
  new mongoose.Schema(
    {
      _id: {
        type: String,
      },

      hash: {
        type: String,
        default: "",
      },

      result: {
        type: mongoose.Schema.Types.Mixed,
        default: null,
      },

      revision: {
        type: Number,
        default: 0,
      },
    },
    {
      timestamps: true,
    }
  );

const TaxControlledOperation =
  mongoose.models.TaxControlledOperation ||
  mongoose.model(
    "TaxControlledOperation",
    taxControlledOperationSchema
  );

const hash = (value) =>
  crypto
    .createHash("sha256")
    .update(JSON.stringify(value))
    .digest("hex");

const transact = async (work) => {
  await TaxControlledOperation.updateOne(
    {
      _id: "tax-center-lock",
    },
    {
      $setOnInsert: {
        revision: 0,
      },
    },
    {
      upsert: true,
    }
  );

  return mongoose.connection.transaction(
    async (session) => {
      await TaxControlledOperation.updateOne(
        {
          _id: "tax-center-lock",
        },
        {
          $inc: {
            revision: 1,
          },
        },
        {
          session,
        }
      );

      return work(
        session,
        TaxControlledOperation
      );
    }
  );
};

module.exports = {
  transact,
  hash,
};