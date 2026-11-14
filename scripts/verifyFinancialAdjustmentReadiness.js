require("dotenv").config();

const mongoose = require("mongoose");

const verify = async () => {
  if (!process.env.MONGO_URI) {
    throw new Error("MONGO_URI_MISSING");
  }

  // No model imports, collection creation or index creation.
  await mongoose.connect(process.env.MONGO_URI, {
    autoIndex: false,
    autoCreate: false,
    serverSelectionTimeoutMS: 15000,
  });

  const db = mongoose.connection.db;
  const topology = await db.admin().command({ hello: 1 });

  const sessionsSupported =
    topology.logicalSessionTimeoutMinutes != null;

  const transactionTopologySupported = Boolean(
    topology.setName || topology.msg === "isdbgrid"
  );

  const collections = await db
    .listCollections(
      { name: "journalentries" },
      { nameOnly: true }
    )
    .toArray();

  const journalCollectionExists = collections.length === 1;

  const indexes = journalCollectionExists
    ? await db.collection("journalentries").listIndexes().toArray()
    : [];

  const adjustmentJournalUniqueIndexReady = indexes.some(
    (index) =>
      index.name ===
        "unique_financial_adjustment_batch_journal" &&
      index.unique === true &&
      index.key?.adjustmentBatchNumber === 1 &&
      Object.keys(index.key).length === 1 &&
      index.partialFilterExpression
        ?.adjustmentBatchNumber?.$type === "string"
  );

  let transactionReadPassed = false;

  if (
    journalCollectionExists &&
    sessionsSupported &&
    transactionTopologySupported
  ) {
    const session = await mongoose.startSession();

    try {
      session.startTransaction({
        readConcern: { level: "snapshot" },
      });

      await db.collection("journalentries").findOne(
        {},
        {
          session,
          projection: { _id: 1 },
        }
      );

      await session.abortTransaction();
      transactionReadPassed = true;
    } finally {
      if (session.inTransaction()) {
        await session.abortTransaction();
      }

      await session.endSession();
    }
  }

  const historicalAdjustmentsMissingDirection =
    await db.collection("accounttransactions").countDocuments({
      transactionType: "Adjustment",
      transactionDirection: {
        $nin: ["Deposit", "Withdrawal"],
      },
    });

  const sharedLinks = await db
    .collection("financialaccounts")
    .aggregate([
      {
        $match: {
          linkedChartAccountCode: {
            $type: "string",
            $ne: "",
          },
        },
      },
      {
        $group: {
          _id: "$linkedChartAccountCode",
          count: { $sum: 1 },
        },
      },
      {
        $match: {
          count: { $gt: 1 },
        },
      },
      {
        $count: "total",
      },
    ])
    .toArray();

  console.log(
    JSON.stringify(
      {
        postingSwitchEnabled:
          process.env.FINANCIAL_ADJUSTMENT_POSTING_ENABLED ===
          "true",

        journalCollectionExists,
        adjustmentJournalUniqueIndexReady,
        sessionsSupported,
        transactionTopologySupported,

        snapshotTransactionReadAndAbortPassed:
          transactionReadPassed,

        historicalAdjustmentsMissingDirection,

        sharedFinancialLedgerLinkCount:
          sharedLinks[0]?.total || 0,

        financialRecordsChanged: false,
        indexChangesPerformed: false,
        writeRollbackTestPerformed: false,
        concurrentPostingTestPerformed: false,
      },
      null,
      2
    )
  );

  if (
    !adjustmentJournalUniqueIndexReady ||
    !transactionReadPassed
  ) {
    process.exitCode = 2;
  }
};

verify()
  .catch((error) => {
    console.error("Read-only verification failed.");

    console.error(
      JSON.stringify({
        name: error.name,
        code: error.code,
        codeName: error.codeName,
        missingMongoUri:
          error.message === "MONGO_URI_MISSING",
      })
    );

    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });