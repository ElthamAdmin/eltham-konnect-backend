const Invoice = require("../models/Invoice");
const TaxRegistrationProfile = require(
  "../models/TaxRegistrationProfile"
);

const roundMoney = (value) =>
  Math.round(
    (Number(value || 0) + Number.EPSILON) * 100
  ) / 100;

const normalizeAsOfDate = (value) => {
  const text =
    String(value || "").trim() ||
    new Date().toISOString().slice(0, 10);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    throw new Error(
      "As-of date must use YYYY-MM-DD format."
    );
  }

  const date = new Date(`${text}T12:00:00.000Z`);

  if (Number.isNaN(date.getTime())) {
    throw new Error("As-of date is invalid.");
  }

  return date;
};

const getRollingPeriod = ({
  asOfDate,
  months = 12,
}) => {
  const endDate = normalizeAsOfDate(asOfDate);
  const startDate = new Date(endDate);

  startDate.setUTCMonth(
    startDate.getUTCMonth() - Number(months || 12)
  );

  startDate.setUTCDate(
    startDate.getUTCDate() + 1
  );

  return {
    startDate:
      startDate.toISOString().slice(0, 10),
    endDate:
      endDate.toISOString().slice(0, 10),
  };
};

const calculateInvoiceTurnover = (invoice) => {
  const grossInvoiceAmount = roundMoney(
    invoice?.finalTotal || 0
  );

  const customerPurchaseRecovery = roundMoney(
    invoice?.customerPurchaseRecoveryAmount || 0
  );

  const customsRecovery = roundMoney(
    Number(invoice?.customsDuty || 0) +
      Number(
        invoice?.customerPurchaseCustomsDuty || 0
      )
  );

  const outputGct = roundMoney(
    invoice?.gctTreatment?.outputGct ??
      invoice?.gct ??
      0
  );

  const previouslyClassifiedTurnover =
    Number(
      invoice?.turnoverClassification
        ?.potentiallyTaxableTurnover || 0
    );

  const hasReviewedClassification = [
    "Reviewed",
    "Adjusted",
  ].includes(
    invoice?.turnoverClassification
      ?.classificationStatus
  );

  const potentiallyTaxableTurnover =
    hasReviewedClassification
      ? roundMoney(previouslyClassifiedTurnover)
      : Math.max(
          0,
          roundMoney(
            grossInvoiceAmount -
              customerPurchaseRecovery -
              customsRecovery -
              outputGct
          )
        );

  return {
    grossInvoiceAmount,
    customerPurchaseRecovery,
    customsRecovery,
    outputGct,
    potentiallyTaxableTurnover,

    classificationStatus:
      hasReviewedClassification
        ? invoice.turnoverClassification
            .classificationStatus
        : "Preliminary Monitor",

    requiresReview:
      !hasReviewedClassification,
  };
};

const getActiveGctProfile = async ({
  entityCode,
  asOfDate,
}) => {
  const effectiveDate = normalizeAsOfDate(
    asOfDate
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

const generateGctTurnoverMonitor = async ({
  entityCode = "EK-SP-2026",
  asOfDate,
}) => {
  const effectiveDate = normalizeAsOfDate(
    asOfDate
  );

  const profile = await getActiveGctProfile({
    entityCode,
    asOfDate:
      effectiveDate.toISOString().slice(0, 10),
  });

  if (!profile) {
    throw new Error(
      `No active GCT registration profile exists for ${entityCode}.`
    );
  }

  const monitoringMonths = Number(
    profile.turnoverThreshold
      ?.monitoringMonths || 12
  );

  const period = getRollingPeriod({
    asOfDate:
      effectiveDate.toISOString().slice(0, 10),
    months: monitoringMonths,
  });

  const invoices = await Invoice.find({
    createdAt: {
      $gte: period.startDate,
      $lte: period.endDate,
    },

    status: {
      $nin: [
        "Draft",
        "Cancelled",
        "Refunded",
      ],
    },
  }).sort({
    createdAt: 1,
    invoiceNumber: 1,
  });

  const invoiceResults = invoices.map(
    (invoice) => ({
      invoiceNumber: invoice.invoiceNumber,
      invoiceDate: invoice.createdAt,
      customerName: invoice.customerName,
      ...calculateInvoiceTurnover(invoice),
    })
  );

  const totals = invoiceResults.reduce(
    (sum, invoice) => {
      sum.grossInvoiceAmount +=
        invoice.grossInvoiceAmount;

      sum.customerPurchaseRecovery +=
        invoice.customerPurchaseRecovery;

      sum.customsRecovery +=
        invoice.customsRecovery;

      sum.outputGct += invoice.outputGct;

      sum.potentiallyTaxableTurnover +=
        invoice.potentiallyTaxableTurnover;

      if (invoice.requiresReview) {
        sum.unreviewedInvoices += 1;
      }

      return sum;
    },
    {
      invoiceCount: invoiceResults.length,
      unreviewedInvoices: 0,
      grossInvoiceAmount: 0,
      customerPurchaseRecovery: 0,
      customsRecovery: 0,
      outputGct: 0,
      potentiallyTaxableTurnover: 0,
    }
  );

  Object.keys(totals).forEach((key) => {
    totals[key] = Number.isInteger(totals[key])
      ? totals[key]
      : roundMoney(totals[key]);
  });

  const thresholdAmount = roundMoney(
    profile.turnoverThreshold?.amount || 0
  );

  const thresholdUtilization =
    thresholdAmount > 0
      ? roundMoney(
          (totals.potentiallyTaxableTurnover /
            thresholdAmount) *
            100
        )
      : 0;

  const remainingBeforeThreshold =
    thresholdAmount > 0
      ? Math.max(
          0,
          roundMoney(
            thresholdAmount -
              totals.potentiallyTaxableTurnover
          )
        )
      : 0;

  let alertLevel = "No Threshold Configured";

  if (thresholdAmount > 0) {
    alertLevel = "Below Review Level";

    if (thresholdUtilization >= 75) {
      alertLevel = "Registration Review";
    }

    if (thresholdUtilization >= 90) {
      alertLevel = "Registration Urgent";
    }

    if (thresholdUtilization >= 100) {
      alertLevel = "Threshold Reached";
    }
  }

  return {
    entity: {
      entityCode: profile.entityCode,
      entityName: profile.entityName,
      businessType: profile.businessType,
    },

    registration: {
      registrationStatus:
        profile.registrationStatus,

      registrationNumber:
        profile.registrationNumber,

      effectiveFrom: profile.effectiveFrom,
    },

    monitoringPeriod: period,

    threshold: {
      amount: thresholdAmount,
      currency:
        profile.turnoverThreshold?.currency ||
        "JMD",

      monitoringMonths,
      ruleCode:
        profile.turnoverThreshold?.ruleCode ||
        "",

      sourceName: profile.sourceName,
      sourceUrl: profile.sourceUrl,
      sourceReference:
        profile.sourceReference,
      sourceVerifiedAt:
        profile.sourceVerifiedAt,
    },

    totals,

    thresholdUtilization,
    remainingBeforeThreshold,
    alertLevel,

    canChargeGct:
      profile.registrationStatus ===
      "Registered",

    notice:
      profile.registrationStatus ===
      "Registered"
        ? "GCT treatment must follow the active registered profile."
        : "The business is not registered for GCT. This is a turnover monitor only; no GCT may be charged or claimed.",

    invoices: invoiceResults,
  };
};

module.exports = {
  normalizeAsOfDate,
  getRollingPeriod,
  calculateInvoiceTurnover,
  getActiveGctProfile,
  generateGctTurnoverMonitor,
};