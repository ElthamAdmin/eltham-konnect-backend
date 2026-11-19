const EmployeeAdvance = require("../models/EmployeeAdvance");
const PayrollEmployerLink = require("../models/PayrollEmployerLink");
const taxControl = require("./taxControl");
const { operatingEntity } = require("./operatingEntityService");
const { assertOwner } = require("./payrollEmployerLinkService");

const roundMoney = (value) =>
  Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;

const buildEmployeeAdvanceRecoveryPlan = async ({
  employeeId,
  payPeriod,
  availableNetPay,
  requestedRecoveryAmount,
}) => {
  const empty = () => ({
    totalAdvanceRecovery: 0,
    allocations: [],
  });

  const conflict = (message) => {
    const error = new Error(message);
    error.statusCode = 409;
    throw error;
  };

  const id = String(employeeId || "").trim();
  const period = String(payPeriod || "").trim();
  if (!id || !period) return empty();

  const available = Number(availableNetPay);
  if (!Number.isFinite(available) || available < 0) {
    conflict("Available net pay must be a valid non-negative amount.");
  }

  const hasRequestedAmount =
    requestedRecoveryAmount !== undefined &&
    requestedRecoveryAmount !== null &&
    requestedRecoveryAmount !== "";

  const requested = hasRequestedAmount
    ? Number(requestedRecoveryAmount)
    : null;

  if (
    requested !== null &&
    (!Number.isFinite(requested) || requested < 0)
  ) {
    conflict("Requested advance recovery must be a valid non-negative amount.");
  }

  let remainingNet = roundMoney(available);
  let remainingRequested =
    requested === null ? null : roundMoney(requested);

  if (remainingNet === 0 || remainingRequested === 0) return empty();

  const advances = await EmployeeAdvance.find({
    employeeId: id,
    status: { $in: ["Open", "Partially Recovered"] },
    outstandingBalance: { $gt: 0 },
    $or: [
      { recoveryStartPeriod: "" },
      { recoveryStartPeriod: { $lte: period } },
    ],
  })
    .sort({ advanceDate: 1, createdAt: 1, _id: 1 })
    .lean();

  if (!advances.length) return empty();

  // Match the employer-selection rule currently used when Payroll is saved.
  // Do not infer ownership from employee name, family relationship or branch.
  const periodKey = taxControl.period(period);
  const context = await operatingEntity(`${periodKey}-01`, null);
  const employerCode = String(context?.entityCode || "").trim();

  if (!employerCode) {
    conflict("The payroll employer could not be established for this period.");
  }

  const links = await PayrollEmployerLink.find({
    recordType: "EmployeeAdvance",
    recordId: { $in: advances.map((advance) => advance._id) },
  })
    .select("recordId entityCode")
    .lean();

  const ownerByAdvance = new Map(
    links.map((link) => [
      String(link.recordId),
      String(link.entityCode || "").trim(),
    ])
  );

  // An unverified advance is unknown. Silently skipping it would make a
  // preview look complete even though an applicable deduction may be missing.
  const unverified = advances.filter(
    (advance) => !ownerByAdvance.get(String(advance._id))
  );

  if (unverified.length) {
    conflict(
      "Verify employer ownership before including employee advances: " +
      unverified.map((advance) => advance.advanceNumber).join(", ") +
      ". Use Payroll → Verify payroll account or advance ownership."
    );
  }

  const allocations = [];

  for (const advance of advances) {
    if (ownerByAdvance.get(String(advance._id)) !== employerCode) continue;
    if (remainingNet <= 0 || remainingRequested === 0) break;

    const balance = Number(advance.outstandingBalance);
    const installment = Number(advance.plannedInstallmentAmount ?? 0);

    if (
      !Number.isFinite(balance) || balance <= 0 ||
      !Number.isFinite(installment) || installment < 0
    ) {
      conflict(`Review the balance or instalment on ${advance.advanceNumber}.`);
    }

    const outstanding = roundMoney(balance);
    // Preserve the existing policy: a zero instalment uses the outstanding
    // balance, subject to available net pay and the requested recovery limit.
    const scheduled = installment > 0 ? roundMoney(installment) : outstanding;
    const amount = roundMoney(Math.min(
      outstanding,
      scheduled,
      remainingNet,
      remainingRequested === null ? scheduled : remainingRequested
    ));

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
      allocations.reduce((total, item) => total + item.amount, 0)
    ),
    allocations,
  };
};


const applyEmployeeAdvanceRecoveries = async ({
  allocations = [],
  employeeId,
  entityCode,
  payrollNumber,
  payPeriod,
  journalEntryNumber,
  recoveredBy,
  session,
}) => {
  const conflict = (message) => {
    const error = new Error(message);
    error.statusCode = 409;
    throw error;
  };

  if (!session?.inTransaction()) {
    conflict("Advance recovery requires the payroll payment transaction.");
  }

  if (!payrollNumber || !journalEntryNumber || !employeeId || !entityCode) {
    conflict("Payroll, journal, employee and employer are required.");
  }

  const applied = [];
  const seen = new Set();

  for (const item of allocations) {
    const id = String(item.employeeAdvanceId || "");
    const amount = Number(item.amount);
    const before = Number(item.outstandingBeforeRecovery);

    if (
      !id || seen.has(id) ||
      !Number.isFinite(amount) || amount <= 0 ||
      !Number.isFinite(before) || before < amount ||
      roundMoney(amount) !== amount || roundMoney(before) !== before
    ) {
      conflict("The approved advance allocation is invalid or duplicated.");
    }
    seen.add(id);

    const advance = await EmployeeAdvance.findById(id).session(session);

    if (
      !advance ||
      advance.employeeId !== employeeId ||
      advance.advanceNumber !== item.advanceNumber ||
      !["Open", "Partially Recovered"].includes(advance.status) ||
      roundMoney(advance.outstandingBalance) !== before ||
      (advance.recoveryStartPeriod && advance.recoveryStartPeriod > payPeriod) ||
      (advance.recoveries || []).some((r) => r.payrollNumber === payrollNumber)
    ) {
      conflict(
        `Advance ${item.advanceNumber} no longer matches the approved ` +
        "employee, employer, balance or recovery period. Review before paying."
      );
    }

    await assertOwner({
  recordType: "EmployeeAdvance",
  record: advance,
  entityCode,
  session,
});

    const recoveryNumber = `REC-${payrollNumber}-${advance.advanceNumber}`;
    advance.outstandingBalance = roundMoney(before - amount);
    advance.recoveredAmount = roundMoney(
      Number(advance.recoveredAmount || 0) + amount
    );
    advance.status =
      advance.outstandingBalance === 0 ? "Recovered" : "Partially Recovered";

    advance.recoveries.push({
      recoveryNumber,
      payrollNumber,
      payPeriod,
      amount,
      journalEntryNumber,
      recoveredAt: new Date(),
      recoveredBy,
    });

    await advance.save({ session });

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