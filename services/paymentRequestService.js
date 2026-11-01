const crypto = require("crypto");
const mongoose = require("mongoose");
const AccountTransaction = require("../models/AccountTransaction");

let indexPromise = null;

const fail = (message, statusCode = 409) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  throw error;
};

const stableValue = (value) => {
  if (Array.isArray(value)) {
    return value.map(stableValue);
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, stableValue(value[key])])
    );
  }

  return value;
};

const ensurePaymentRequestIndex = async () => {
  if (!indexPromise) {
    indexPromise = AccountTransaction.collection
      .createIndex(
        { paymentRequestId: 1 },
        {
          name: "unique_payment_request_id",
          unique: true,
          partialFilterExpression: {
            paymentRequestId: { $type: "string" },
          },
        }
      )
      .catch((error) => {
        indexPromise = null;
        throw error;
      });
  }

  await indexPromise;
};

const runPaymentOnce = async ({
  req,
  channel,
  execute,
}) => {
  const rawId = req.body?.paymentRequestId;

  // Compatibility until both frontend forms send request IDs.
  if (
    rawId === undefined ||
    rawId === null ||
    rawId === ""
  ) {
    return mongoose.connection.transaction(
      (session) => execute(session, {})
    );
  }

  if (
    typeof rawId !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      rawId
    )
  ) {
    fail(
      "Invalid payment request ID. Reload the payment form before trying again.",
      400
    );
  }

  if (!["POS", "Invoices"].includes(channel)) {
    fail("Invalid payment request channel.", 400);
  }

  const actorId = String(
    req.user?.userId || req.user?._id || ""
  );

  if (!actorId) {
    fail("A signed-in staff user is required.", 401);
  }

  const requestId = rawId.toLowerCase();

  const {
    paymentRequestId,
    ...paymentBody
  } = req.body;

  const hash = crypto
    .createHash("sha256")
    .update(
      JSON.stringify(
        stableValue({
          channel,
          actorId,
          invoiceNumber: String(
            req.params?.invoiceNumber ||
              paymentBody.invoiceNumber ||
              ""
          ),
          body: paymentBody,
        })
      )
    )
    .digest("hex");

  const paymentRequestFields = {
    paymentRequestId: requestId,
    paymentRequestHash: hash,
    paymentRequestActorId: actorId,
    paymentRequestChannel: channel,
  };

  const findExisting = async (session = null) => {
    const query = AccountTransaction.findOne({
      paymentRequestId: requestId,
    }).select("+paymentRequestResult");

    if (session) {
      query.session(session);
    }

    return query.lean();
  };

  const replay = (record) => {
    if (
      record.paymentRequestActorId !== actorId ||
      record.paymentRequestChannel !== channel ||
      record.paymentRequestHash !== hash
    ) {
      fail(
        "This payment request ID was already used with different details. No new payment was recorded."
      );
    }

    if (!record.paymentRequestResult) {
      fail(
        "This payment request needs review. Check its payment records before retrying."
      );
    }

    return {
      ...record.paymentRequestResult,
      paymentRequestReplayed: true,
    };
  };

  await ensurePaymentRequestIndex();

  const previous = await findExisting();

  if (previous) {
    return replay(previous);
  }

  try {
    return await mongoose.connection.transaction(
      async (session) => {
        const existing = await findExisting(session);

        if (existing) {
          return replay(existing);
        }

        const result = await execute(
          session,
          paymentRequestFields
        );

        const record = await findExisting(session);

        if (
          !record ||
          record.paymentRequestHash !== hash
        ) {
          fail(
            "Payment request details were not saved. The transaction cannot complete."
          );
        }

        // Save the response inside the payment transaction.
        const snapshot = JSON.parse(
          JSON.stringify(result)
        );

        delete snapshot.paymentRequestReplayed;

        const saved = await AccountTransaction.updateOne(
          {
            _id: record._id,
            paymentRequestId: requestId,
          },
          {
            $set: {
              paymentRequestResult: snapshot,
            },
          },
          { session }
        );

        if (saved.matchedCount !== 1) {
          fail(
            "Could not save the payment result. The transaction cannot complete."
          );
        }

        return {
          ...result,
          paymentRequestReplayed: false,
        };
      }
    );
  } catch (error) {
    if (
      error.code === 11000 &&
      (
        error.keyPattern?.paymentRequestId ||
        error.keyValue?.paymentRequestId
      )
    ) {
      const committed = await findExisting();

      if (committed) {
        return replay(committed);
      }

      fail(
        "This payment request is still resolving. Check payment records, then retry with the same request ID."
      );
    }

    throw error;
  }
};

module.exports = { runPaymentOnce };