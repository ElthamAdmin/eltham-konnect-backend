const Invoice = require(
  "../models/Invoice"
);

const TaxRegistrationProfile = require(
  "../models/TaxRegistrationProfile"
);

const T = require("./taxControl");

const normalizeAsOfDate = (value) => {
  const dateValue =
    value instanceof Date
      ? value.toISOString().slice(0, 10)
      : value || T.today();

  return new Date(
    `${T.date(
      dateValue,
      "As-of date"
    )}T12:00:00.000Z`
  );
};

const getRollingPeriod = ({
  asOfDate,
  months = 12,
}) => {
  const monthCount = Number(months);

  if (
    !Number.isInteger(monthCount) ||
    monthCount < 1 ||
    monthCount > 120
  ) {
    T.fail(
      "Monitoring months must be a whole number between 1 and 120."
    );
  }

  const endDate =
    normalizeAsOfDate(asOfDate);

  const startDate =
    new Date(endDate);

  const originalDay =
    startDate.getUTCDate();

  startDate.setUTCDate(1);

  startDate.setUTCMonth(
    startDate.getUTCMonth() -
      monthCount
  );

  const lastDay = new Date(
    Date.UTC(
      startDate.getUTCFullYear(),
      startDate.getUTCMonth() + 1,
      0,
      12
    )
  ).getUTCDate();

  startDate.setUTCDate(
    Math.min(
      originalDay,
      lastDay
    )
  );

  startDate.setUTCDate(
    startDate.getUTCDate() + 1
  );

  return {
    startDate: startDate
      .toISOString()
      .slice(0, 10),

    endDate: endDate
      .toISOString()
      .slice(0, 10),
  };
};

const calculateInvoiceTurnover = (
  invoice
) => {
  const classification =
    invoice.turnoverClassification ||
    {};

  const reviewed = [
    "Reviewed",
    "Adjusted",
  ].includes(
    classification.classificationStatus
  );

  const grossInvoiceAmount =
    T.amount(
      invoice.finalTotal ?? 0,
      "Invoice total"
    );

  const customerPurchaseRecovery =
    T.amount(
      reviewed
        ? classification
            .customerPurchaseRecovery ?? 0
        : invoice
            .customerPurchaseRecoveryAmount ??
          0,

      "Customer purchase recovery"
    );

  // Recovery invoices also copy customs
  // into the general customsDuty field.
  // Count that recovery once.
  const customsRecovery =
    invoice.invoiceSource ===
    "Customer Purchases"
      ? T.amount(
          invoice
            .customerPurchaseCustomsDuty ??
            invoice.customsDuty ??
            0,

          "Customs recovery"
        )
      : T.amount(
          invoice.customsDuty ?? 0,
          "Customs recovery"
        );

  const treatmentOutput =
    T.amount(
      invoice.gctTreatment
        ?.outputGct ?? 0,
      "Recorded output GCT"
    );

  const legacyOutput =
    T.amount(
      invoice.gct ?? 0,
      "Invoice GCT"
    );

  if (
    treatmentOutput !==
      legacyOutput &&
    (
      treatmentOutput > 0 ||
      legacyOutput > 0
    )
  ) {
    T.fail(
      `Invoice ${invoice.invoiceNumber} has conflicting GCT amounts and requires review.`,
      409
    );
  }

  const outputGct =
    treatmentOutput;

  const excludedAmount = T.round(
    customerPurchaseRecovery +
      customsRecovery +
      outputGct
  );

  if (
    excludedAmount >
    grossInvoiceAmount
  ) {
    T.fail(
      `Invoice ${invoice.invoiceNumber} has recoveries and GCT exceeding its total.`,
      409
    );
  }

  const preliminaryTurnover =
    T.round(
      grossInvoiceAmount -
        excludedAmount
    );

  const potentiallyTaxableTurnover =
    reviewed
      ? T.amount(
          classification
            .potentiallyTaxableTurnover,
          "Reviewed turnover"
        )
      : preliminaryTurnover;

  if (
    potentiallyTaxableTurnover >
    preliminaryTurnover
  ) {
    T.fail(
      `Invoice ${invoice.invoiceNumber} has reviewed turnover exceeding its available amount.`,
      409
    );
  }

  return {
    grossInvoiceAmount,
    customerPurchaseRecovery,
    customsRecovery,
    outputGct,
    potentiallyTaxableTurnover,

    classificationStatus: reviewed
      ? classification
          .classificationStatus
      : "Preliminary Monitor",

    requiresReview: !reviewed,
  };
};

const getActiveGctProfile = async ({
  entityCode,
  asOfDate,
}) => {
  const code = T.text(
    entityCode,
    "Business entity"
  ).toUpperCase();

  const effectiveDate =
    normalizeAsOfDate(asOfDate);

  const profiles =
    await TaxRegistrationProfile.find({
      entityCode: code,
      taxType: "GCT",
      status: "Active",

      effectiveFrom: {
        $lte: effectiveDate,
      },

      $or: [
        { effectiveTo: null },
        {
          effectiveTo: {
            $gte: effectiveDate,
          },
        },
      ],
    });

  if (profiles.length !== 1) {
    T.fail(
      "Exactly one Active GCT profile must cover the selected business and date.",
      409
    );
  }

  const profile = profiles[0];

  if (
    !profile.sourceName?.trim() ||
    (
      !profile.sourceUrl?.trim() &&
      !profile.sourceReference?.trim()
    ) ||
    !profile.sourceVerifiedAt
  ) {
    T.fail(
      "The GCT profile requires verified source information.",
      409
    );
  }

  return profile;
};

const generateGctTurnoverMonitor = async ({
  entityCode,
  asOfDate,
}) => {
  const code = T.text(
    entityCode,
    "Business entity"
  ).toUpperCase();

  const effectiveDate =
    normalizeAsOfDate(asOfDate);

  const profile =
    await getActiveGctProfile({
      entityCode: code,
      asOfDate: effectiveDate,
    });

  if (!profile.monitoringEnabled) {
    T.fail(
      "Turnover monitoring is disabled for this profile.",
      409
    );
  }

  const threshold =
    profile.turnoverThreshold;

  const thresholdStart =
    threshold?.effectiveFrom
      ? new Date(
          threshold.effectiveFrom
        )
      : null;

  const thresholdEnd =
    threshold?.effectiveTo
      ? new Date(
          threshold.effectiveTo
        )
      : null;

  if (
    threshold?.currency !== "JMD" ||
    !thresholdStart ||
    !Number.isFinite(
      thresholdStart.getTime()
    ) ||
    thresholdStart > effectiveDate ||
    (
      thresholdEnd &&
      (
        !Number.isFinite(
          thresholdEnd.getTime()
        ) ||
        thresholdEnd <
          effectiveDate
      )
    ) ||
    !threshold.ruleCode?.trim()
  ) {
    T.fail(
      "An effective JMD threshold with a source rule reference is required.",
      409
    );
  }

  const thresholdAmount =
    T.amount(
      threshold.amount,
      "Turnover threshold",
      true
    );

  const period = getRollingPeriod({
    asOfDate: effectiveDate,
    months:
      threshold.monitoringMonths,
  });

  const rows = await Invoice.find({
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
  })
    .sort({
      createdAt: 1,
      invoiceNumber: 1,
    })
    .lean();

  const invoices = [];

  const unattributedInvoiceNumbers =
    [];

  for (const invoice of rows) {
    const codes = [
      invoice.entityCode,
      invoice.entitySnapshot
        ?.entityCode,
      invoice.businessEntitySnapshot
        ?.entityCode,
    ]
      .filter(
        (value) =>
          value !== null &&
          value !== undefined &&
          String(value).trim() !== ""
      )
      .map((value) =>
        T.text(
          value,
          "Invoice business entity"
        ).toUpperCase()
      );

    const distinctCodes = [
      ...new Set(codes),
    ];

    if (
      distinctCodes.length !== 1
    ) {
      unattributedInvoiceNumbers.push(
        invoice.invoiceNumber
      );

      continue;
    }

    if (
      distinctCodes[0] !== code
    ) {
      continue;
    }

    invoices.push({
      invoiceNumber:
        invoice.invoiceNumber,

      invoiceDate:
        invoice.createdAt,

      customerName:
        invoice.customerName,

      ...calculateInvoiceTurnover(
        invoice
      ),
    });
  }

  const moneyFields = [
    "grossInvoiceAmount",
    "customerPurchaseRecovery",
    "customsRecovery",
    "outputGct",
    "potentiallyTaxableTurnover",
  ];

  const totals = {
    invoiceCount: invoices.length,
    unreviewedInvoices: 0,
    grossInvoiceAmount: 0,
    customerPurchaseRecovery: 0,
    customsRecovery: 0,
    outputGct: 0,
    potentiallyTaxableTurnover: 0,
  };

  for (const invoice of invoices) {
    for (const field of moneyFields) {
      totals[field] = T.round(
        totals[field] +
          invoice[field]
      );
    }

    if (invoice.requiresReview) {
      totals.unreviewedInvoices += 1;
    }
  }

  const thresholdUtilization =
    T.round(
      (
        totals
          .potentiallyTaxableTurnover /
        thresholdAmount
      ) * 100
    );

  let alertLevel =
    "Below Review Level";

  if (
    thresholdUtilization >= 100
  ) {
    alertLevel =
      "Threshold Reached";
  } else if (
    thresholdUtilization >= 90
  ) {
    alertLevel =
      "Registration Urgent";
  } else if (
    thresholdUtilization >= 75
  ) {
    alertLevel =
      "Registration Review";
  }

  const scopeVerified =
    unattributedInvoiceNumbers
      .length === 0;

  return {
    entity: {
      entityCode: code,
      entityName:
        profile.entityName,
      businessType:
        profile.businessType,
    },

    registration: {
      registrationStatus:
        profile.registrationStatus,

      registrationNumber:
        profile.registrationNumber,

      effectiveFrom:
        profile.effectiveFrom,
    },

    monitoringPeriod: period,

    threshold: {
      amount: thresholdAmount,
      currency: "JMD",

      monitoringMonths:
        threshold.monitoringMonths,

      ruleCode:
        threshold.ruleCode,

      sourceName:
        profile.sourceName,

      sourceUrl:
        profile.sourceUrl,

      sourceReference:
        profile.sourceReference,

      sourceVerifiedAt:
        profile.sourceVerifiedAt,
    },

    totals,
    thresholdUtilization,

    remainingBeforeThreshold:
      Math.max(
        0,
        T.round(
          thresholdAmount -
            totals
              .potentiallyTaxableTurnover
        )
      ),

    alertLevel,

    canChargeGct:
      profile.registrationStatus ===
      "Registered",

    scopeVerified,

    unattributedInvoiceNumbers,

    notice: scopeVerified
      ? "Recorded turnover attributed to the selected business only. Unreviewed classifications remain preliminary. Alerts do not automatically register the business or change invoice GCT."
      : "Invoices with missing or conflicting business attribution were excluded. Totals and threshold alerts may be incomplete and require review.",

    invoices,
  };
};

module.exports = {
  normalizeAsOfDate,
  getRollingPeriod,
  calculateInvoiceTurnover,
  getActiveGctProfile,
  generateGctTurnoverMonitor,
};