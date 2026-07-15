const EmployeeAdvance = require("../models/EmployeeAdvance");

const roundMoney = (value) =>
  Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;

const buildEmployeeAdvanceRecoveryPlan = async ({
  employeeId,
  payPeriod,
  availableNetPay,
  requestedRecoveryAmount,
}) => {
  const available = Math.max(0, roundMoney(availableNetPay));

  if (!employeeId || !payPeriod || available <= 0) {
    return { totalAdvanceRecovery: 0, allocations: [] };
  }

  const advances = await EmployeeAdvance.find({
    employeeId,
    status: { $in: ["Open", "Partially Recovered"] },
    outstandingBalance: { $gt: 0 },
    $or: [
      { recoveryStartPeriod: "" },
      { recoveryStartPeriod: { $lte: payPeriod } },
    ],
  }).sort({ advanceDate: 1, createdAt: 1, _id: 1 });

  let remainingNet = available;
  let remainingRequested =
    requestedRecoveryAmount === undefined ||
    requestedRecoveryAmount === null ||
    requestedRecoveryAmount === ""
      ? null
      : Math.max(0, roundMoney(requestedRecoveryAmount));
  const allocations = [];

  for (const advance of advances) {
    if (remainingNet <= 0) break;
    if (remainingRequested !== null && remainingRequested <= 0) break;

    const outstanding = Math.max(0, roundMoney(advance.outstandingBalance));
    const plannedInstallment = Math.max(
      0,
      roundMoney(advance.plannedInstallmentAmount)
    );
    const scheduled = plannedInstallment > 0 ? plannedInstallment : outstanding;
    const requestedLimit =
      remainingRequested === null ? scheduled : remainingRequested;
    const amount = roundMoney(
      Math.min(outstanding, scheduled, remainingNet, requestedLimit)
    );

    if (amount <= 0) continue;

    allocations.push({
      employeeAdvanceId: advance._id,
      advanceNumber: advance.advanceNumber,
      description: advance.description,
      outstandingBeforeRecovery: outstanding,
      amount,
    });

    remainingNet = roundMoney(remainingNet - amount);
    if (remainingRequested !== null) {
      remainingRequested = roundMoney(remainingRequested - amount);
    }
  }

  return {
    totalAdvanceRecovery: roundMoney(
      allocations.reduce((sum, allocation) => sum + allocation.amount, 0)
    ),
    allocations,
  };
};

const applyEmployeeAdvanceRecoveries = async ({
  allocations,
  payrollNumber,
  payPeriod,
  journalEntryNumber,
  recoveredBy,
}) => {
  const applied = [];

  for (const allocation of allocations || []) {
    const amount = roundMoney(allocation.amount);
    if (amount <= 0) continue;

    const recoveryNumber = `REC-${Date.now()}-${applied.length + 1}`;
    const advance = await EmployeeAdvance.findOneAndUpdate(
      {
        _id: allocation.employeeAdvanceId,
        outstandingBalance: { $gte: amount },
        status: { $in: ["Open", "Partially Recovered"] },
      },
      {
        $inc: {
          recoveredAmount: amount,
          outstandingBalance: -amount,
        },
        $push: {
          recoveries: {
            recoveryNumber,
            payrollNumber,
            payPeriod,
            amount,
            journalEntryNumber,
            recoveredAt: new Date(),
            recoveredBy,
          },
        },
      },
      { new: true }
    );

    if (!advance) {
      throw new Error(
        `Employee advance ${allocation.advanceNumber} could not be recovered because its balance changed.`
      );
    }

    advance.outstandingBalance = Math.max(
      0,
      roundMoney(advance.outstandingBalance)
    );
    advance.recoveredAmount = roundMoney(advance.recoveredAmount);
    advance.status =
      advance.outstandingBalance <= 0 ? "Recovered" : "Partially Recovered";
    await advance.save();

    applied.push({
      recoveryNumber,
      employeeAdvanceId: advance._id,
      advanceNumber: advance.advanceNumber,
      amount,
      outstandingBalance: advance.outstandingBalance,
      status: advance.status,
    });
  }

  return applied;
};

module.exports = {
  buildEmployeeAdvanceRecoveryPlan,
  applyEmployeeAdvanceRecoveries,
};