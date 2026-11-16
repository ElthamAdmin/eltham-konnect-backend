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

const T = require("./taxControl");
const S = require("./taxScopeService");

const {
  transact,
} = require("./taxTransactionService");

const {
  calculateInvoiceTurnover,
} = require("./gctMonitoringService");

const TaxDocument = require(
  "../models/TaxDocument"
);

const {
  writeAuditLog,
} = require("../utils/auditLogger");

const roundMoney = T.round;

const getPeriodDates = (periodKey) => {
  const normalizedPeriod =
    T.period(periodKey);

  const [year, month] =
    normalizedPeriod
      .split("-")
      .map(Number);

  return {
    periodKey: normalizedPeriod,

    periodStart:
      `${normalizedPeriod}-01`,

    periodEnd: new Date(
      Date.UTC(year, month, 0, 12)
    )
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
  periodEnd,
  session = null,
}) => {
  const start = T.date(
    periodStart,
    "Filing period start"
  );

  const end = T.date(
    periodEnd,
    "Filing period end"
  );

  const profiles =
    await TaxRegistrationProfile.find({
      entityCode,
      taxType: "GCT",
      status: "Active",

      effectiveFrom: {
        $lte: new Date(
          `${start}T12:00:00.000Z`
        ),
      },

      $or: [
        { effectiveTo: null },
        {
          effectiveTo: {
            $gte: new Date(
              `${end}T12:00:00.000Z`
            ),
          },
        },
      ],
    }).session(session);

  if (profiles.length !== 1) {
    T.fail(
      "Exactly one Active GCT profile must cover the complete filing period.",
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

  if (
    profile.filingFrequency &&
    profile.filingFrequency !==
      "Monthly"
  ) {
    T.fail(
      "This calculation supports monthly GCT periods. A different filing frequency requires its own reviewed period calculation.",
      409
    );
  }

  return profile;
};

const getInvoiceDate = (invoice) =>
  T.date(
    invoice.createdAt ||
      invoice.invoiceDate,

    "Invoice date"
  );

const calculateInvoiceEntry = ({
  invoice,
  profile,
  period,
  filingNumber,
  user,
}) => {
  const turnover =
    calculateInvoiceTurnover(invoice);

  const reviewed =
    !turnover.requiresReview;

  const classification =
    invoice.turnoverClassification || {};

  const registered =
    profile.registrationStatus ===
    "Registered";

  const treatment =
    invoice.gctTreatment?.treatment;

  const taxableSupply = [
    "Taxable Supply",
    "Mixed Supply",
  ].includes(treatment);

  if (
    !registered &&
    turnover.outputGct > 0
  ) {
    T.fail(
      `Invoice ${invoice.invoiceNumber} contains output GCT during an unregistered period. Review its source accounting.`,
      409
    );
  }

  if (
    registered &&
    reviewed &&
    turnover.potentiallyTaxableTurnover >
      0 &&
    (
      !taxableSupply ||
      turnover.outputGct <= 0
    )
  ) {
    T.fail(
      `Invoice ${invoice.invoiceNumber} has taxable turnover without matching recorded GCT treatment.`,
      409
    );
  }

  if (
    registered &&
    turnover.outputGct > 0 &&
    !taxableSupply
  ) {
    T.fail(
      `Invoice ${invoice.invoiceNumber} has output GCT inconsistent with its supply treatment.`,
      409
    );
  }

  const canChargeOutputGct =
    registered && taxableSupply;

  const treatmentClassification = {
    "Taxable Supply": "Taxable",
    "Zero-Rated Supply":
      "Zero Rated",
    "Exempt Supply": "Exempt",
    "Outside Scope":
      "Outside Scope",
    "Mixed Supply": "Taxable",
  };

  const entryClassification =
    reviewed
      ? treatmentClassification[
          treatment
        ] ||
        (
          !registered
            ? "Outside Scope"
            : "Pending Review"
        )
      : "Pending Review";

  const sourceRate = Number(
    invoice.gctTreatment?.rate ?? 0
  );

  if (
    !Number.isFinite(sourceRate) ||
    sourceRate < 0 ||
    sourceRate > 1
  ) {
    T.fail(
      `Invoice ${invoice.invoiceNumber} requires a decimal GCT rate between zero and one.`,
      409
    );
  }

  return {
    registerNumber:
      `GCT-OUT-${String(invoice._id)}`,

    entityCode:
      profile.entityCode,

    entityName:
      profile.entityName,

    businessType:
      profile.businessType,

    periodKey:
      period.periodKey,

    periodStart:
      period.periodStart,

    periodEnd:
      period.periodEnd,

    transactionDate:
      getInvoiceDate(invoice),

    registerType:
      "Output GCT",

    sourceDocumentType:
      "Invoice",

    sourceDocumentId:
      invoice._id,

    sourceDocumentNumber:
      invoice.invoiceNumber,

    counterpartyName:
      invoice.customerName || "",

    registrationProfileId:
      profile._id,

    registrationCode:
      profile.registrationCode,

    registrationStatus:
      registered
        ? "Registered"
        : "Not Registered",

    calculationMode:
      registered
        ? "Compliance"
        : "Preview",

    classification:
      entryClassification,

    classificationStatus:
      reviewed
        ? classification
            .classificationStatus
        : "Preliminary",

    grossAmount:
      turnover.grossInvoiceAmount,

    recoveryAmount:
      turnover.customerPurchaseRecovery,

    customsRecovery:
      turnover.customsRecovery,

    exemptAmount:
      T.amount(
        reviewed
          ? classification
              .exemptTurnover ?? 0
          : 0,

        "Exempt amount"
      ),

    zeroRatedAmount:
      T.amount(
        reviewed
          ? classification
              .zeroRatedTurnover ?? 0
          : 0,

        "Zero-rated amount"
      ),

    outsideScopeAmount:
      T.amount(
        reviewed
          ? classification
              .outsideScopeAmount ?? 0
          : 0,

        "Outside-scope amount"
      ),

    taxableAmount:
      turnover.potentiallyTaxableTurnover,

    gctRate:
      canChargeOutputGct
        ? sourceRate
        : 0,

    gctAmount:
      registered
        ? turnover.outputGct
        : 0,

    claimableGctAmount: 0,
    disallowedGctAmount: 0,
    pendingVerificationGctAmount: 0,

    eligibility: {
      canChargeOutputGct,
      canClaimInputGct: false,

      includedInReturn:
        registered &&
        reviewed &&
        entryClassification !==
          "Pending Review",

      blockReason:
        !registered
          ? "Preview only: business was not registered for this period."
          : !reviewed
            ? "Invoice classification requires review."
            : entryClassification ===
                "Pending Review"
              ? "Supply treatment requires review."
              : "",
    },

    filingNumber,

    sourceSnapshot: {
      entityCode:
        profile.entityCode,

      invoiceNumber:
        invoice.invoiceNumber,

      invoiceDate:
        getInvoiceDate(invoice),

      invoiceSource:
        invoice.invoiceSource,

      status:
        invoice.status,

      finalTotal:
        turnover.grossInvoiceAmount,

      gctTreatment:
        JSON.parse(
          JSON.stringify(
            invoice.gctTreatment ||
              {}
          )
        ),

      turnoverClassification:
        JSON.parse(
          JSON.stringify(
            classification
          )
        ),
    },

    notes:
      "Calculated from recorded invoice amounts. No output GCT was generated automatically.",

    createdBy:
      getUserName(user),

    updatedBy:
      getUserName(user),
  };
};

const calculateExpenseEntry = ({
  expense,
  profile,
  period,
  filingNumber,
  user,
}) => {
  const treatment =
    expense.gctTreatment || {};

  const grossAmount =
    T.amount(
      expense.amount,
      "Expense amount"
    );

  const inputGctPaid =
    T.amount(
      treatment.inputGctPaid ?? 0,
      "Input GCT paid"
    );

  const amountExcludingGct =
    T.amount(
      treatment.amountExcludingGct ??
        0,

      "Amount excluding GCT"
    );

  if (
    T.round(
      amountExcludingGct +
        inputGctPaid
    ) > grossAmount
  ) {
    T.fail(
      `Expense ${expense.expenseNumber} has inconsistent input-tax amounts.`,
      409
    );
  }

  const registered =
    profile.registrationStatus ===
    "Registered";

  const documentVerified =
    treatment
      .supportingDocumentVerified ===
      true &&
    Boolean(
      treatment
        .supportingDocumentNumber &&
      treatment
        .supplierGctRegistrationNumber &&
      treatment
        .supplierInvoiceNumber &&
      treatment.verifiedBy &&
      treatment.verifiedAt
    );

  const canClaimInputGct =
    registered &&
    inputGctPaid > 0 &&
    documentVerified &&
    treatment.inputGctClaimable ===
      true;

  const claimableGctAmount =
    canClaimInputGct
      ? inputGctPaid
      : 0;

  const pendingVerificationGctAmount =
    registered &&
    inputGctPaid > 0 &&
    !documentVerified
      ? inputGctPaid
      : 0;

  const disallowedGctAmount =
    T.round(
      inputGctPaid -
        claimableGctAmount -
        pendingVerificationGctAmount
    );

  const transactionDate =
    T.date(
      expense.date,
      "Expense date"
    );

  let blockReason = "";

  if (!registered) {
    blockReason =
      "Preview only: business was not registered for this period.";
  } else if (
    inputGctPaid > 0 &&
    !documentVerified
  ) {
    blockReason =
      "Supplier tax-invoice evidence requires verification.";
  } else if (
    inputGctPaid > 0 &&
    !canClaimInputGct
  ) {
    blockReason =
      "Recorded input GCT is not marked eligible for a claim.";
  }

  return {
    registerNumber:
      `GCT-IN-${String(expense._id)}`,

    entityCode:
      profile.entityCode,

    entityName:
      profile.entityName,

    businessType:
      profile.businessType,

    periodKey:
      period.periodKey,

    periodStart:
      period.periodStart,

    periodEnd:
      period.periodEnd,

    transactionDate,

    registerType:
      "Input GCT",

    sourceDocumentType:
      "Expense",

    sourceDocumentId:
      expense._id,

    sourceDocumentNumber:
      expense.expenseNumber,

    counterpartyName:
      treatment.supplierName || "",

    counterpartyTrn:
      treatment.supplierTrn || "",

    registrationProfileId:
      profile._id,

    registrationCode:
      profile.registrationCode,

    registrationStatus:
      registered
        ? "Registered"
        : "Not Registered",

    calculationMode:
      registered
        ? "Compliance"
        : "Preview",

    classification:
      inputGctPaid === 0
        ? "Outside Scope"
        : documentVerified
          ? "Taxable"
          : "Pending Review",

    classificationStatus:
      inputGctPaid === 0 ||
      documentVerified
        ? "Reviewed"
        : "Preliminary",

    grossAmount,
    recoveryAmount: 0,
    customsRecovery: 0,
    exemptAmount: 0,
    zeroRatedAmount: 0,

    outsideScopeAmount:
      inputGctPaid === 0
        ? grossAmount
        : 0,

    taxableAmount:
      inputGctPaid > 0
        ? amountExcludingGct
        : 0,

    gctRate:
      amountExcludingGct > 0
        ? inputGctPaid /
          amountExcludingGct
        : 0,

    gctAmount:
      inputGctPaid,

    claimableGctAmount,
    disallowedGctAmount,
    pendingVerificationGctAmount,

    supplierEvidence: {
      supplierGctRegistered:
        Boolean(
          treatment
            .supplierGctRegistrationNumber
        ),

      supplierTrn:
        treatment.supplierTrn || "",

      supplierGctRegistrationNumber:
        treatment
          .supplierGctRegistrationNumber ||
        "",

      taxInvoiceNumber:
        treatment
          .supplierInvoiceNumber ||
        "",

      taxInvoiceDate:
        "",

      receiptUrl:
        expense.receiptUrl || "",

      documentVerified,

      verifiedBy:
        documentVerified
          ? treatment.verifiedBy
          : "",

      verifiedAt:
        documentVerified
          ? treatment.verifiedAt
          : null,
    },

    eligibility: {
      canChargeOutputGct: false,
      canClaimInputGct,

      includedInReturn:
        canClaimInputGct,

      blockReason,
    },

    filingNumber,

    sourceSnapshot: {
      entityCode:
        profile.entityCode,

      expenseNumber:
        expense.expenseNumber,

      expenseDate:
        transactionDate,

      category:
        expense.category,

      description:
        expense.description,

      amount:
        grossAmount,

      status:
        expense.status,

      supportingDocumentNumber:
        treatment
          .supportingDocumentNumber ||
        "",

      gctTreatment:
        JSON.parse(
          JSON.stringify(
            treatment
          )
        ),
    },

    notes:
      "Calculated from recorded expense amounts and reviewed supplier evidence. No input-tax accounting entry was created.",

    createdBy:
      getUserName(user),

    updatedBy:
      getUserName(user),
  };
};

const saveRegisterEntry = async (
  entryData,
  session
) => {
  let entry =
    await GctRegisterEntry.findOne({
      sourceDocumentType:
        entryData.sourceDocumentType,

      sourceDocumentId:
        entryData.sourceDocumentId,

      registerType:
        entryData.registerType,
    }).session(session);

  if (entry) {
    if (
      entry.entityCode !==
        entryData.entityCode ||
      entry.periodKey !==
        entryData.periodKey ||
      entry.filingNumber !==
        entryData.filingNumber
    ) {
      T.fail(
        `Source ${entryData.sourceDocumentNumber} already belongs to another register period or business. It will not be moved automatically.`,
        409
      );
    }

    Object.assign(
      entry,
      entryData
    );
  } else {
    entry = new GctRegisterEntry(
      entryData
    );
  }

  await entry.save({ session });

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
  entityCode,
  periodKey,
  user,
}) => {
  const code = T.text(
    entityCode,
    "Business entity"
  ).toUpperCase();

  const period =
    getPeriodDates(periodKey);

  return transact(
    async (session) => {
      const entity = await S.resolve(
        code,
        period.periodStart,
        period.periodEnd,
        session,
        true
      );

      const profile =
        await getActiveGctProfile({
          entityCode: code,
          periodStart:
            period.periodStart,
          periodEnd:
            period.periodEnd,
          session,
        });

      if (
        profile.businessType !==
        entity.entityType
      ) {
        T.fail(
          "The GCT profile business type does not match the selected entity.",
          409
        );
      }

      const registered =
        profile.registrationStatus ===
        "Registered";

      let filingPeriod =
        await GctFilingPeriod.findOne({
          entityCode: code,
          periodKey:
            period.periodKey,
        }).session(session);

      if (
        filingPeriod &&
        ![
          "Preview",
          "Calculated",
        ].includes(
          filingPeriod.status
        )
      ) {
        T.fail(
          "Only a Preview or Calculated filing can be recalculated.",
          409
        );
      }

      if (
        filingPeriod &&
        (
          filingPeriod.taxRecordId ||
          filingPeriod.taxNumber ||
          filingPeriod
            .settlementJournalEntryNumber ||
          Number(
            filingPeriod.adjustments
              ?.outputAdjustment || 0
          ) !== 0 ||
          Number(
            filingPeriod.adjustments
              ?.inputAdjustment || 0
          ) !== 0
        )
      ) {
        T.fail(
          "This filing has accounting links or adjustments requiring separate review before recalculation.",
          409
        );
      }

      const beforeValues =
        filingPeriod
          ? filingPeriod.toObject()
          : null;

      const filingNumber =
        filingPeriod?.filingNumber ||
        T.number("GCT");

      const invoiceRows =
        await Invoice.find({
          createdAt: {
            $gte:
              period.periodStart,
            $lte:
              period.periodEnd,
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
          .session(session);

      const expenseRows =
        await Expense.find({
          date: {
            $gte:
              period.periodStart,
            $lte:
              period.periodEnd,
          },

          status: {
            $ne: "Cancelled",
          },
        })
          .sort({
            date: 1,
            expenseNumber: 1,
          })
          .session(session);

      const unattributedSources = [];

      const selectSources = (
        rows,
        referenceField
      ) =>
        rows.filter((source) => {
          const codes = [
            source.entityCode,
            source.entitySnapshot
              ?.entityCode,
            source.businessEntitySnapshot
              ?.entityCode,
          ]
            .filter(
              (value) =>
                value !== undefined &&
                value !== null &&
                String(value).trim() !== ""
            )
            .map((value) =>
              T.text(
                value,
                "Source entity"
              ).toUpperCase()
            );

          const distinctCodes = [
            ...new Set(codes),
          ];

          if (
            distinctCodes.length !== 1
          ) {
            unattributedSources.push(
              source[referenceField]
            );

            return false;
          }

          return (
            distinctCodes[0] === code
          );
        });

      const invoices =
        selectSources(
          invoiceRows,
          "invoiceNumber"
        );

      const expenses =
        selectSources(
          expenseRows,
          "expenseNumber"
        );

      if (
        registered &&
        unattributedSources.length
      ) {
        T.fail(
          "Sources in this period have missing or conflicting business attribution. Review them before calculating a Compliance filing.",
          409
        );
      }

      // Register models use a smaller
      // registration-status vocabulary.
      const calculationProfile = {
        ...profile.toObject(),

        registrationStatus:
          registered
            ? "Registered"
            : "Not Registered",
      };

      const outputEntries = [];
      const inputEntries = [];

      for (const invoice of invoices) {
        const entry =
          calculateInvoiceEntry({
            invoice,
            profile:
              calculationProfile,
            period,
            filingNumber,
            user,
          });

        outputEntries.push(
          await saveRegisterEntry(
            entry,
            session
          )
        );
      }

      for (const expense of expenses) {
        const treatment =
          expense.gctTreatment || {};

        const gross = T.amount(
          expense.amount,
          "Expense amount"
        );

        const inputTax = T.amount(
          treatment.inputGctPaid ?? 0,
          "Input GCT"
        );

        const base = T.amount(
          treatment.amountExcludingGct ??
            0,

          "Expense amount excluding GCT"
        );

        if (
          T.round(
            base + inputTax
          ) > gross
        ) {
          T.fail(
            `Expense ${expense.expenseNumber} has inconsistent input-tax amounts.`,
            409
          );
        }

        if (
          treatment
            .supportingDocumentVerified
        ) {
          const document =
            await TaxDocument.findOne({
              documentNumber:
                treatment
                  .supportingDocumentNumber,

              entityCode: code,
              taxType: "GCT",

              documentType:
                "Supplier Tax Invoice",

              verificationStatus:
                "Verified",

              storageProvider:
                "Cloudinary",

              storageAccess:
                "Authenticated",
            }).session(session);

          if (
            !document ||
            !document
              .cloudinaryPublicId ||
            !document
              .cloudinaryAssetId ||
            !document.verifiedBy ||
            !document.verifiedAt ||
            document.externalReference !==
              treatment
                .supplierInvoiceNumber ||
            (
              document.periodKey &&
              document.periodKey !==
                period.periodKey
            )
          ) {
            T.fail(
              `Expense ${expense.expenseNumber} requires matching verified Cloudinary supplier evidence.`,
              409
            );
          }
        }

        if (
          treatment.inputGctClaimable &&
          (
            !registered ||
            !treatment
              .supportingDocumentVerified ||
            !treatment
              .supplierGctRegistrationNumber ||
            !treatment
              .supplierInvoiceNumber
          )
        ) {
          T.fail(
            `Expense ${expense.expenseNumber} has a claimable flag without complete registration and supplier evidence.`,
            409
          );
        }

        const entry =
          calculateExpenseEntry({
            expense,
            profile:
              calculationProfile,
            period,
            filingNumber,
            user,
          });

        inputEntries.push(
          await saveRegisterEntry(
            entry,
            session
          )
        );
      }

      const total = (
        rows,
        field
      ) =>
        T.round(
          rows.reduce(
            (sum, row) =>
              sum +
              T.amount(
                row[field] ?? 0,
                field
              ),
            0
          )
        );

      const outputSummary = {
        grossInvoiceAmount:
          total(
            outputEntries,
            "grossAmount"
          ),

        customerPurchaseRecovery:
          total(
            outputEntries,
            "recoveryAmount"
          ),

        customsRecovery:
          total(
            outputEntries,
            "customsRecovery"
          ),

        exemptSales:
          total(
            outputEntries,
            "exemptAmount"
          ),

        zeroRatedSales:
          total(
            outputEntries,
            "zeroRatedAmount"
          ),

        outsideScopeSales:
          total(
            outputEntries,
            "outsideScopeAmount"
          ),

        taxableSales:
          total(
            outputEntries,
            "taxableAmount"
          ),

        outputGct:
          total(
            outputEntries,
            "gctAmount"
          ),
      };

      const inputSummary = {
        grossExpenseAmount:
          total(
            inputEntries,
            "grossAmount"
          ),

        amountExcludingGct:
          T.round(
            expenses.reduce(
              (sum, expense) =>
                sum +
                T.amount(
                  expense.gctTreatment
                    ?.amountExcludingGct ??
                    0,

                  "Amount excluding GCT"
                ),
              0
            )
          ),

        inputGctPaid:
          total(
            inputEntries,
            "gctAmount"
          ),

        claimableInputGct:
          total(
            inputEntries,
            "claimableGctAmount"
          ),

        disallowedInputGct:
          total(
            inputEntries,
            "disallowedGctAmount"
          ),

        pendingVerificationInputGct:
          total(
            inputEntries,
            "pendingVerificationGctAmount"
          ),
      };

      const reviewedInvoiceCount =
        outputEntries.filter(
          (entry) =>
            [
              "Reviewed",
              "Adjusted",
            ].includes(
              entry.classificationStatus
            ) &&
            entry.classification !==
              "Pending Review"
        ).length;

      const verifiedExpenseCount =
        inputEntries.filter(
          (entry) =>
            entry.supplierEvidence
              ?.documentVerified ===
            true
        ).length;

      const standardRate =
        Number(
          profile.standardRate ?? 0
        );

      if (
        !Number.isFinite(
          standardRate
        ) ||
        standardRate < 0 ||
        standardRate > 1
      ) {
        T.fail(
          "The profile standard rate must be a decimal between zero and one.",
          409
        );
      }

      const now = new Date();
      const userName =
        getUserName(user);

      const filingData = {
        filingNumber,

        entityCode: code,
        entityName:
          entity.legalName,

        businessType:
          entity.entityType,

        businessTrn:
          entity.trn || "",

        ...period,

        filingFrequency:
          "Monthly",

        calculationMode:
          registered
            ? "Compliance"
            : "Preview",

        registrationProfileId:
          profile._id,

        registrationCode:
          profile.registrationCode,

        registrationStatus:
          registered
            ? "Registered"
            : "Not Registered",

        registrationNumber:
          profile.registrationNumber ||
          "",

        registrationSnapshot:
          profile.toObject(),

        canChargeGct:
          registered,

        canClaimInputGct:
          registered,

        canFileReturn:
          registered,

        complianceBlockReason:
          registered
            ? ""
            : "Preview only: business was not registered during the complete filing period.",

        standardRate:
          registered
            ? standardRate
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
          calculatedAt: now,

          entitySnapshot:
            S.snapshot(entity),

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

          unattributedSources,

          outputSummary,
          inputSummary,

          sourceSnapshots: [
            ...outputEntries,
            ...inputEntries,
          ].map(
            (entry) => ({
              registerNumber:
                entry.registerNumber,

              sourceSnapshot:
                entry.sourceSnapshot,
            })
          ),
        },

        calculatedBy:
          userName,

        calculatedAt: now,

        status:
          registered
            ? "Calculated"
            : "Preview",

        notes:
          "Calculated from attributed recorded sources. No source tax accounting was created automatically.",

        updatedBy:
          userName,
      };

      if (!filingPeriod) {
        filingPeriod =
          new GctFilingPeriod({
            ...filingData,
            createdBy: userName,
          });
      } else {
        Object.assign(
          filingPeriod,
          filingData
        );
      }

      await filingPeriod.save({
        session,
      });

      const entryIds = [
        ...outputEntries,
        ...inputEntries,
      ].map(
        (entry) => entry._id
      );

      await GctRegisterEntry.deleteMany(
        {
          entityCode: code,
          periodKey:
            period.periodKey,
          filingNumber,

          _id: {
            $nin: entryIds,
          },
        },
        { session }
      );

      await GctRegisterEntry.updateMany(
        {
          _id: {
            $in: entryIds,
          },
        },
        {
          $set: {
            filingPeriodId:
              filingPeriod._id,
          },
        },
        { session }
      );

      await writeAuditLog({
        session,
        action:
          "CALCULATE_GCT_FILING",

        module: "Tax Center",

        description:
          `Calculated ${filingNumber}`,

        targetType:
          "GctFilingPeriod",

        targetId:
          filingNumber,

        beforeValues,

        afterValues:
          filingPeriod.toObject(),

        metadata: {
          performedBy:
            userName,
        },
      });

      return {
        filingPeriod,

        summary: {
          calculationMode:
            filingPeriod
              .calculationMode,

          registrationStatus:
            filingPeriod
              .registrationStatus,

          canChargeGct:
            filingPeriod
              .canChargeGct,

          canClaimInputGct:
            filingPeriod
              .canClaimInputGct,

          canFileReturn:
            filingPeriod
              .canFileReturn,

          invoiceCount:
            filingPeriod
              .invoiceCount,

          expenseCount:
            filingPeriod
              .expenseCount,

          outputGctSummary:
            filingPeriod
              .outputGctSummary,

          inputGctSummary:
            filingPeriod
              .inputGctSummary,

          outputGct:
            filingPeriod
              .outputGct,

          inputGctCredit:
            filingPeriod
              .inputGctCredit,

          netGct:
            filingPeriod.netGct,

          netPosition:
            filingPeriod
              .netPosition,

          complianceBlockReason:
            filingPeriod
              .complianceBlockReason,
        },
      };
    }
  );
};

const getGctRegister = async ({
  entityCode,
  periodKey,
  registerType = "",
}) => {
  const code = T.text(
    entityCode,
    "Business entity"
  ).toUpperCase();

  const period =
    getPeriodDates(periodKey);

  const query = {
    entityCode: code,
    periodKey:
      period.periodKey,
  };

  if (registerType) {
    const type = T.text(
      registerType,
      "Register type"
    );

    if (
      ![
        "Output GCT",
        "Input GCT",
      ].includes(type)
    ) {
      T.fail(
        "Register type must be Output GCT or Input GCT."
      );
    }

    query.registerType = type;
  }

  return GctRegisterEntry.find(
    query
  ).sort({
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