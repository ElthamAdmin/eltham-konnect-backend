const Invoice = require("../models/Invoice");
const Expense = require("../models/Expense");
const TaxRegistrationProfile = require(
  "../models/TaxRegistrationProfile"
);
const GctFilingPeriod = require(
  "../models/GctFilingPeriod"
);
const GctRegisterEntry = require(
  "../models/GctRegisterEntry"
);

const PERIOD_PATTERN = /^\d{4}-\d{2}$/;

const roundMoney = (value) =>
  Math.round(
    (Number(value || 0) + Number.EPSILON) * 100
  ) / 100;

const getPeriodDates = (periodKey) => {
  const normalizedPeriod =
    String(periodKey || "").trim();

  if (!PERIOD_PATTERN.test(normalizedPeriod)) {
    throw new Error(
      "GCT period must use YYYY-MM format."
    );
  }

  const [year, month] =
    normalizedPeriod.split("-").map(Number);

  return {
    periodKey: normalizedPeriod,
    periodStart: `${normalizedPeriod}-01`,
    periodEnd: new Date(Date.UTC(year, month, 0))
      .toISOString()
      .slice(0, 10),
  };
};

const getUserName = (user) =>
  user?.fullName ||
  user?.name ||
  user?.email ||
  "System User";

const getActiveGctProfile = async ({
  entityCode,
  periodStart,
}) => {
  const effectiveDate = new Date(
    `${periodStart}T12:00:00.000Z`
  );

  return TaxRegistrationProfile.findOne({
    entityCode,
    taxType: "GCT",
    status: "Active",
    effectiveFrom: {
      $lte: effectiveDate,
    },
    $or: [
      {
        effectiveTo: null,
      },
      {
        effectiveTo: {
          $gte: effectiveDate,
        },
      },
    ],
  }).sort({
    effectiveFrom: -1,
  });
};

const getInvoiceDate = (invoice) =>
  String(
    invoice.createdAt ||
      invoice.invoiceDate ||
      ""
  ).slice(0, 10);

const calculateInvoiceEntry = ({
  invoice,
  profile,
  period,
  filingNumber,
  user,
}) => {
  const reviewedClassification = [
    "Reviewed",
    "Adjusted",
  ].includes(
    invoice.turnoverClassification
      ?.classificationStatus
  );

  const grossInvoiceAmount = roundMoney(
    invoice.turnoverClassification
      ?.grossInvoiceAmount ||
      invoice.finalTotal ||
      0
  );

  const customerPurchaseRecovery = roundMoney(
    reviewedClassification
      ? invoice.turnoverClassification
          ?.customerPurchaseRecovery
      : invoice.customerPurchaseRecoveryAmount
  );

  const customsRecovery = roundMoney(
    Number(invoice.customsDuty || 0) +
      Number(
        invoice.customerPurchaseCustomsDuty || 0
      )
  );

  const exemptAmount = roundMoney(
    reviewedClassification
      ? invoice.turnoverClassification
          ?.exemptTurnover
      : 0
  );

  const zeroRatedAmount = roundMoney(
    reviewedClassification
      ? invoice.turnoverClassification
          ?.zeroRatedTurnover
      : 0
  );

  const outsideScopeAmount = roundMoney(
    reviewedClassification
      ? invoice.turnoverClassification
          ?.outsideScopeAmount
      : 0
  );

  const preliminaryTaxableAmount = Math.max(
    0,
    roundMoney(
      grossInvoiceAmount -
        customerPurchaseRecovery -
        customsRecovery -
        exemptAmount -
        zeroRatedAmount -
        outsideScopeAmount -
        Number(
          invoice.gctTreatment?.outputGct ||
            invoice.gct ||
            0
        )
    )
  );

  const taxableAmount = roundMoney(
    reviewedClassification
      ? invoice.turnoverClassification
          ?.potentiallyTaxableTurnover
      : preliminaryTaxableAmount
  );

  const registered =
    profile.registrationStatus === "Registered";

  const taxableSupply =
    invoice.gctTreatment?.treatment ===
    "Taxable Supply";

  const canChargeOutputGct =
    registered && taxableSupply;

  const outputGct = canChargeOutputGct
    ? roundMoney(
        invoice.gctTreatment?.outputGct ||
          taxableAmount *
            Number(profile.standardRate || 0)
      )
    : 0;

  let classification = "Pending Review";

  if (reviewedClassification) {
    const treatment =
      invoice.gctTreatment?.treatment;

    if (treatment === "Taxable Supply") {
      classification = "Taxable";
    } else if (
      treatment === "Zero-Rated Supply"
    ) {
      classification = "Zero Rated";
    } else if (
      treatment === "Exempt Supply"
    ) {
      classification = "Exempt";
    } else if (
      treatment === "Outside Scope"
    ) {
      classification = "Outside Scope";
    }
  }

  return {
    registerNumber:
      `GCT-OUT-${String(invoice._id)}`,

    entityCode: profile.entityCode,
    entityName: profile.entityName,
    businessType: profile.businessType,

    periodKey: period.periodKey,
    periodStart: period.periodStart,
    periodEnd: period.periodEnd,

    transactionDate:
      getInvoiceDate(invoice),

    registerType: "Output GCT",
    sourceDocumentType: "Invoice",
    sourceDocumentId: invoice._id,
    sourceDocumentNumber:
      invoice.invoiceNumber,

    counterpartyName:
      invoice.customerName || "",

    registrationProfileId: profile._id,
    registrationCode:
      profile.registrationCode,

    registrationStatus:
      profile.registrationStatus,

    calculationMode: registered
      ? "Compliance"
      : "Preview",

    classification,

    classificationStatus:
      reviewedClassification
        ? invoice.turnoverClassification
            .classificationStatus
        : "Preliminary",

    grossAmount: grossInvoiceAmount,

    recoveryAmount:
      customerPurchaseRecovery,

    customsRecovery,

    exemptAmount,
    zeroRatedAmount,
    outsideScopeAmount,
    taxableAmount,

    gctRate: canChargeOutputGct
      ? Number(
          invoice.gctTreatment?.rate ||
            profile.standardRate ||
            0
        )
      : 0,

    gctAmount: outputGct,

    claimableGctAmount: 0,
    disallowedGctAmount: 0,
    pendingVerificationGctAmount: 0,

    eligibility: {
      canChargeOutputGct,
      canClaimInputGct: false,
      includedInReturn:
        canChargeOutputGct &&
        reviewedClassification,

      blockReason: canChargeOutputGct
        ? ""
        : registered
          ? "Invoice has not been reviewed as a taxable GCT supply."
          : "Business was not registered for GCT during this period.",
    },

    filingNumber,

    sourceSnapshot: {
      invoiceNumber:
        invoice.invoiceNumber,

      invoiceSource:
        invoice.invoiceSource,

      status: invoice.status,

      finalTotal:
        roundMoney(invoice.finalTotal),

      customerPurchaseRecoveryAmount:
        roundMoney(
          invoice.customerPurchaseRecoveryAmount
        ),

      customsDuty:
        roundMoney(invoice.customsDuty),

      customerPurchaseCustomsDuty:
        roundMoney(
          invoice.customerPurchaseCustomsDuty
        ),

      gctTreatment:
        invoice.gctTreatment?.toObject
          ? invoice.gctTreatment.toObject()
          : invoice.gctTreatment,

      turnoverClassification:
        invoice.turnoverClassification?.toObject
          ? invoice.turnoverClassification.toObject()
          : invoice.turnoverClassification,
    },

    notes: reviewedClassification
      ? "Generated from reviewed invoice classification."
      : "Preliminary turnover classification requiring review.",

    createdBy: getUserName(user),
    updatedBy: getUserName(user),
  };
};

const calculateExpenseEntry = ({
  expense,
  profile,
  period,
  filingNumber,
  user,
}) => {
  const registered =
    profile.registrationStatus === "Registered";

  const grossAmount = roundMoney(
    expense.amount
  );

  const amountExcludingGct = roundMoney(
    expense.gctTreatment
      ?.amountExcludingGct || grossAmount
  );

  const inputGctPaid = roundMoney(
    expense.gctTreatment?.inputGctPaid
  );

  const supplierEvidenceComplete =
    Boolean(
      expense.gctTreatment
        ?.supportingDocumentVerified
    ) &&
    Boolean(
      expense.gctTreatment
        ?.supplierGctRegistrationNumber
    ) &&
    Boolean(
      expense.gctTreatment
        ?.supplierInvoiceNumber
    );

  const canClaimInputGct =
    registered &&
    Boolean(
      expense.gctTreatment
        ?.inputGctClaimable
    ) &&
    supplierEvidenceComplete;

  const claimableGctAmount =
    canClaimInputGct
      ? inputGctPaid
      : 0;

  const pendingVerificationGctAmount =
    registered &&
    inputGctPaid > 0 &&
    !supplierEvidenceComplete
      ? inputGctPaid
      : 0;

  const disallowedGctAmount =
    !registered && inputGctPaid > 0
      ? inputGctPaid
      : registered &&
          inputGctPaid > 0 &&
          !canClaimInputGct &&
          supplierEvidenceComplete
        ? inputGctPaid
        : 0;

  return {
    registerNumber:
      `GCT-IN-${String(expense._id)}`,

    entityCode: profile.entityCode,
    entityName: profile.entityName,
    businessType: profile.businessType,

    periodKey: period.periodKey,
    periodStart: period.periodStart,
    periodEnd: period.periodEnd,

    transactionDate:
      String(expense.date).slice(0, 10),

    registerType: "Input GCT",
    sourceDocumentType: "Expense",
    sourceDocumentId: expense._id,
    sourceDocumentNumber:
      expense.expenseNumber,

    counterpartyName:
      expense.gctTreatment?.supplierName ||
      "",

    counterpartyTrn:
      expense.gctTreatment?.supplierTrn ||
      "",

    registrationProfileId: profile._id,
    registrationCode:
      profile.registrationCode,

    registrationStatus:
      profile.registrationStatus,

    calculationMode: registered
      ? "Compliance"
      : "Preview",

    classification:
      inputGctPaid > 0
        ? "Pending Review"
        : "Outside Scope",

    classificationStatus:
      expense.gctTreatment
        ?.supportingDocumentVerified
        ? "Reviewed"
        : "Preliminary",

    grossAmount,
    recoveryAmount: 0,
    customsRecovery: 0,
    exemptAmount: 0,
    zeroRatedAmount: 0,
    outsideScopeAmount:
      inputGctPaid > 0 ? 0 : grossAmount,

    taxableAmount:
      inputGctPaid > 0
        ? amountExcludingGct
        : 0,

    gctRate:
      amountExcludingGct > 0
        ? roundMoney(
            inputGctPaid /
              amountExcludingGct
          )
        : 0,

    gctAmount: inputGctPaid,

    claimableGctAmount,
    disallowedGctAmount,
    pendingVerificationGctAmount,

    supplierEvidence: {
      supplierGctRegistered:
        Boolean(
          expense.gctTreatment
            ?.supplierGctRegistrationNumber
        ),

      supplierTrn:
        expense.gctTreatment?.supplierTrn ||
        "",

      supplierGctRegistrationNumber:
        expense.gctTreatment
          ?.supplierGctRegistrationNumber ||
        "",

      taxInvoiceNumber:
        expense.gctTreatment
          ?.supplierInvoiceNumber ||
        "",

      taxInvoiceDate:
        String(expense.date).slice(0, 10),

      receiptUrl:
        expense.receiptUrl || "",

      documentVerified:
        Boolean(
          expense.gctTreatment
            ?.supportingDocumentVerified
        ),

      verifiedBy:
        expense.gctTreatment?.verifiedBy ||
        "",

      verifiedAt:
        expense.gctTreatment?.verifiedAt ||
        null,
    },

    eligibility: {
      canChargeOutputGct: false,
      canClaimInputGct,

      includedInReturn:
        canClaimInputGct,

      blockReason: canClaimInputGct
        ? ""
        : !registered
          ? "Business was not registered for GCT during this period."
          : inputGctPaid <= 0
            ? "No input GCT was recorded."
            : !supplierEvidenceComplete
              ? "Supplier tax-invoice evidence has not been verified."
              : "Expense is not marked as eligible for input GCT.",
    },

    filingNumber,

    sourceSnapshot: {
      expenseNumber:
        expense.expenseNumber,

      category:
        expense.category,

      description:
        expense.description,

      amount: grossAmount,

      status:
        expense.status,

      receiptUrl:
        expense.receiptUrl,

      gctTreatment:
        expense.gctTreatment?.toObject
          ? expense.gctTreatment.toObject()
          : expense.gctTreatment,
    },

    notes:
      inputGctPaid > 0
        ? "Generated from expense input-GCT information."
        : "No input GCT was recorded on this expense.",

    createdBy: getUserName(user),
    updatedBy: getUserName(user),
  };
};

const saveRegisterEntry = async (
  entryData
) => {
  let entry =
    await GctRegisterEntry.findOne({
      entityCode: entryData.entityCode,
      registerType: entryData.registerType,
      sourceDocumentType:
        entryData.sourceDocumentType,
      sourceDocumentId:
        entryData.sourceDocumentId,
    });

  if (!entry) {
    entry = new GctRegisterEntry(entryData);
  } else {
    Object.assign(entry, entryData);
  }

  await entry.save();

  return entry;
};

const sumEntries = (
  entries,
  field
) =>
  roundMoney(
    entries.reduce(
      (sum, entry) =>
        sum + Number(entry[field] || 0),
      0
    )
  );

const generateGctFilingPeriod = async ({
  entityCode = "EK-SP-2026",
  periodKey,
  user,
}) => {
  const period = getPeriodDates(periodKey);

  const profile = await getActiveGctProfile({
    entityCode,
    periodStart: period.periodStart,
  });

  if (!profile) {
    throw new Error(
      `No active GCT registration profile exists for ${entityCode} and ${period.periodKey}.`
    );
  }

  const registered =
    profile.registrationStatus === "Registered";

  let filingPeriod =
    await GctFilingPeriod.findOne({
      entityCode,
      periodKey: period.periodKey,
    });

  const lockedStatuses = [
    "Reviewed",
    "Approved",
    "Submitted",
    "Paid",
    "Reconciled",
  ];

  if (
    filingPeriod &&
    lockedStatuses.includes(
      filingPeriod.status
    )
  ) {
    throw new Error(
      `GCT filing ${filingPeriod.filingNumber} cannot be recalculated while its status is ${filingPeriod.status}.`
    );
  }

  const filingNumber =
    filingPeriod?.filingNumber ||
    `GCT-${entityCode}-${period.periodKey.replace(
      "-",
      ""
    )}-${Date.now()}`;

    const invoiceQuery = {
    createdAt: {
      $gte: period.periodStart,
      $lte: period.periodEnd,
    },

    status: {
      $nin: [
        "Draft",
        "Cancelled",
        "Refunded",
      ],
    },
  };

  if (entityCode === "EK-SP-2026") {
    invoiceQuery.$or = [
      {
        "businessEntitySnapshot.entityCode":
          entityCode,
      },
      {
        "businessEntitySnapshot.entityCode": {
          $exists: false,
        },
      },
      {
        "businessEntitySnapshot.entityCode": "",
      },
    ];
  } else {
    invoiceQuery[
      "businessEntitySnapshot.entityCode"
    ] = entityCode;
  }

  const invoices = await Invoice.find(
    invoiceQuery
  ).sort({
    createdAt: 1,
    invoiceNumber: 1,
  });

    const expenseQuery = {
    date: {
      $gte: period.periodStart,
      $lte: period.periodEnd,
    },

    status: {
      $ne: "Cancelled",
    },
  };

  if (entityCode === "EK-SP-2026") {
    expenseQuery.$or = [
      {
        "businessEntitySnapshot.entityCode":
          entityCode,
      },
      {
        "businessEntitySnapshot.entityCode": {
          $exists: false,
        },
      },
      {
        "businessEntitySnapshot.entityCode": "",
      },
    ];
  } else {
    expenseQuery[
      "businessEntitySnapshot.entityCode"
    ] = entityCode;
  }

  const expenses = await Expense.find(
    expenseQuery
  ).sort({
    date: 1,
    expenseNumber: 1,
  });

  const outputEntries = [];

  for (const invoice of invoices) {
    const entryData =
      calculateInvoiceEntry({
        invoice,
        profile,
        period,
        filingNumber,
        user,
      });

    outputEntries.push(
      await saveRegisterEntry(entryData)
    );
  }

  const inputEntries = [];

  for (const expense of expenses) {
    const entryData =
      calculateExpenseEntry({
        expense,
        profile,
        period,
        filingNumber,
        user,
      });

    inputEntries.push(
      await saveRegisterEntry(entryData)
    );
  }

  const currentInvoiceIds =
    invoices.map((invoice) => invoice._id);

  const currentExpenseIds =
    expenses.map((expense) => expense._id);

  await GctRegisterEntry.deleteMany({
    filingNumber,
    registerType: "Output GCT",
    sourceDocumentType: "Invoice",
    sourceDocumentId: {
      $nin: currentInvoiceIds,
    },
  });

  await GctRegisterEntry.deleteMany({
    filingNumber,
    registerType: "Input GCT",
    sourceDocumentType: "Expense",
    sourceDocumentId: {
      $nin: currentExpenseIds,
    },
  });

  const outputSummary = {
    grossInvoiceAmount:
      sumEntries(
        outputEntries,
        "grossAmount"
      ),

    customerPurchaseRecovery:
      sumEntries(
        outputEntries,
        "recoveryAmount"
      ),

    customsRecovery:
      sumEntries(
        outputEntries,
        "customsRecovery"
      ),

    exemptSales:
      sumEntries(
        outputEntries,
        "exemptAmount"
      ),

    zeroRatedSales:
      sumEntries(
        outputEntries,
        "zeroRatedAmount"
      ),

    outsideScopeSales:
      sumEntries(
        outputEntries,
        "outsideScopeAmount"
      ),

    taxableSales:
      sumEntries(
        outputEntries,
        "taxableAmount"
      ),

    outputGct:
      sumEntries(
        outputEntries,
        "gctAmount"
      ),
  };

  const inputSummary = {
    grossExpenseAmount:
      sumEntries(
        inputEntries,
        "grossAmount"
      ),

    amountExcludingGct:
      sumEntries(
        inputEntries,
        "taxableAmount"
      ),

    inputGctPaid:
      sumEntries(
        inputEntries,
        "gctAmount"
      ),

    claimableInputGct:
      sumEntries(
        inputEntries,
        "claimableGctAmount"
      ),

    disallowedInputGct:
      sumEntries(
        inputEntries,
        "disallowedGctAmount"
      ),

    pendingVerificationInputGct:
      sumEntries(
        inputEntries,
        "pendingVerificationGctAmount"
      ),
  };

  const reviewedInvoiceCount =
    outputEntries.filter((entry) =>
      ["Reviewed", "Adjusted"].includes(
        entry.classificationStatus
      )
    ).length;

  const verifiedExpenseCount =
    inputEntries.filter(
      (entry) =>
        entry.supplierEvidence
          ?.documentVerified
    ).length;

  const performedBy = getUserName(user);

  const filingData = {
    filingNumber,

    entityCode: profile.entityCode,
    entityName: profile.entityName,
    businessType: profile.businessType,

    businessTrn:
      profile.trn || "",

    periodKey: period.periodKey,
    periodStart: period.periodStart,
    periodEnd: period.periodEnd,
    filingFrequency: "Monthly",

    calculationMode: registered
      ? "Compliance"
      : "Preview",

    registrationProfileId:
      profile._id,

    registrationCode:
      profile.registrationCode,

    registrationStatus:
      profile.registrationStatus,

    registrationNumber:
      profile.registrationNumber || "",

    registrationSnapshot: {
      registrationCode:
        profile.registrationCode,

      registrationStatus:
        profile.registrationStatus,

      registrationNumber:
        profile.registrationNumber,

      effectiveFrom:
        profile.effectiveFrom,

      effectiveTo:
        profile.effectiveTo,

      standardRate:
        profile.standardRate,

      rateRuleCode:
        profile.rateRuleCode,

      sourceName:
        profile.sourceName,

      sourceUrl:
        profile.sourceUrl,

      sourceReference:
        profile.sourceReference,

      sourceVerifiedAt:
        profile.sourceVerifiedAt,
    },

    canChargeGct: registered,
    canClaimInputGct: registered,
    canFileReturn: registered,

    complianceBlockReason: registered
      ? ""
      : "Business was not registered for GCT during this filing period. Preview only.",

    standardRate:
      registered
        ? Number(
            profile.standardRate || 0
          )
        : 0,

    rateRuleCode:
      profile.rateRuleCode || "",

    invoiceCount:
      outputEntries.length,

    reviewedInvoiceCount,

    unreviewedInvoiceCount:
      outputEntries.length -
      reviewedInvoiceCount,

    expenseCount:
      inputEntries.length,

    verifiedExpenseCount,

    unverifiedExpenseCount:
      inputEntries.length -
      verifiedExpenseCount,

    outputGctSummary:
      outputSummary,

    inputGctSummary:
      inputSummary,

    calculationSnapshot: {
      calculatedAt: new Date(),

      invoiceNumbers:
        invoices.map(
          (invoice) =>
            invoice.invoiceNumber
        ),

      expenseNumbers:
        expenses.map(
          (expense) =>
            expense.expenseNumber
        ),

      outputSummary,
      inputSummary,
    },

    calculatedBy: performedBy,
    calculatedAt: new Date(),

    status: registered
      ? "Calculated"
      : "Preview",

    notes: registered
      ? "GCT filing period calculated from registered-period invoices and expenses."
      : "Preview-only GCT period. No output GCT may be charged and no input GCT may be claimed.",

    updatedBy: performedBy,
  };

  if (!filingPeriod) {
    filingPeriod =
      new GctFilingPeriod({
        ...filingData,
        createdBy: performedBy,
      });
  } else {
    Object.assign(
      filingPeriod,
      filingData
    );
  }

  await filingPeriod.save();

  await GctRegisterEntry.updateMany(
    {
      filingNumber,
    },
    {
      $set: {
        filingPeriodId:
          filingPeriod._id,
      },
    }
  );

  return {
    filingPeriod,
    summary: {
      calculationMode:
        filingPeriod.calculationMode,

      registrationStatus:
        filingPeriod.registrationStatus,

      canChargeGct:
        filingPeriod.canChargeGct,

      canClaimInputGct:
        filingPeriod.canClaimInputGct,

      canFileReturn:
        filingPeriod.canFileReturn,

      invoiceCount:
        filingPeriod.invoiceCount,

      expenseCount:
        filingPeriod.expenseCount,

      outputGctSummary:
        filingPeriod.outputGctSummary,

      inputGctSummary:
        filingPeriod.inputGctSummary,

      outputGct:
        filingPeriod.outputGct,

      inputGctCredit:
        filingPeriod.inputGctCredit,

      netGct:
        filingPeriod.netGct,

      netPosition:
        filingPeriod.netPosition,

      complianceBlockReason:
        filingPeriod.complianceBlockReason,
    },
  };
};

const getGctRegister = async ({
  entityCode = "EK-SP-2026",
  periodKey,
  registerType = "",
}) => {
  const query = {
    entityCode,
    periodKey,
  };

  if (registerType) {
    query.registerType =
      registerType;
  }

  return GctRegisterEntry.find(query).sort({
    registerType: 1,
    transactionDate: 1,
    sourceDocumentNumber: 1,
  });
};

module.exports = {
  generateGctFilingPeriod,
  getGctRegister,
  getPeriodDates,
  roundMoney,
};