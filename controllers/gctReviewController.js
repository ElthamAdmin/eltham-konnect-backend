const Invoice = require("../models/Invoice");
const Expense = require("../models/Expense");
const TaxRegistrationProfile = require(
  "../models/TaxRegistrationProfile"
);

const roundMoney = (value) =>
  Math.round(
    (Number(value || 0) + Number.EPSILON) * 100
  ) / 100;

const getUserName = (user) =>
  user?.fullName ||
  user?.name ||
  user?.email ||
  "System User";

const getActiveProfile = async (
  entityCode,
  documentDate
) => {
  const effectiveDate = new Date(
    `${documentDate}T12:00:00.000Z`
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

const reviewInvoiceTurnoverClassification = async (
  req,
  res
) => {
  try {
    const { invoiceNumber } = req.params;

    const {
      customerPurchaseRecovery = 0,
      exemptTurnover = 0,
      zeroRatedTurnover = 0,
      outsideScopeAmount = 0,
      classificationNotes = "",
    } = req.body;

    const invoice = await Invoice.findOne({
      invoiceNumber,
    });

    if (!invoice) {
      return res.status(404).json({
        success: false,
        message: "Invoice not found.",
      });
    }

    const grossInvoiceAmount =
      roundMoney(invoice.finalTotal);

    const recovery =
      Math.max(
        0,
        roundMoney(customerPurchaseRecovery)
      );

    const customsRecovery =
      roundMoney(
        Number(invoice.customsDuty || 0) +
          Number(
            invoice.customerPurchaseCustomsDuty ||
              0
          )
      );

    const exempt =
      Math.max(
        0,
        roundMoney(exemptTurnover)
      );

    const zeroRated =
      Math.max(
        0,
        roundMoney(zeroRatedTurnover)
      );

    const outsideScope =
      Math.max(
        0,
        roundMoney(outsideScopeAmount)
      );

    const totalExcluded =
      roundMoney(
        recovery +
          customsRecovery +
          exempt +
          zeroRated +
          outsideScope
      );

    if (totalExcluded > grossInvoiceAmount) {
      return res.status(400).json({
        success: false,
        message:
          "Recoveries and excluded turnover cannot exceed the invoice total.",
      });
    }

    const potentiallyTaxableTurnover =
      Math.max(
        0,
        roundMoney(
          grossInvoiceAmount -
            totalExcluded
        )
      );

    const documentDate =
      String(invoice.createdAt).slice(0, 10);

    const entityCode =
      invoice.businessEntitySnapshot
        ?.entityCode ||
      "EK-SP-2026";

    const profile =
      await getActiveProfile(
        entityCode,
        documentDate
      );

    if (!profile) {
      return res.status(409).json({
        success: false,
        message:
          "No active GCT profile applies to this invoice.",
      });
    }

    invoice.turnoverClassification = {
      grossInvoiceAmount,
      customerPurchaseRecovery:
        recovery,

      serviceRevenue:
        potentiallyTaxableTurnover,

      potentiallyTaxableTurnover,
      exemptTurnover: exempt,
      zeroRatedTurnover: zeroRated,
      outsideScopeAmount:
        outsideScope,

      classificationStatus:
        "Reviewed",

      classificationNotes:
        String(classificationNotes).trim(),

      classifiedAt: new Date(),

      classifiedBy:
        getUserName(req.user),
    };

    if (
      profile.registrationStatus !==
      "Registered"
    ) {
      invoice.gctTreatment = {
        registrationStatus:
          "Not Registered",

        registrationNumber: "",

        registrationEffectiveDate:
          profile.effectiveFrom
            ? profile.effectiveFrom
                .toISOString()
                .slice(0, 10)
            : "",

        treatment:
          "Not Registered",

        rate: 0,
        taxableAmount:
          potentiallyTaxableTurnover,

        outputGct: 0,

        reason:
          "Turnover reviewed for monitoring only. The business was not registered for GCT.",

        ruleCode:
          profile.registrationCode,

        calculatedAt:
          new Date(),
      };
    }

    await invoice.save();

    res.json({
      success: true,
      message:
        "Invoice turnover classification reviewed successfully",
      data: {
        invoiceNumber:
          invoice.invoiceNumber,

        entityCode,

        gctRegistrationStatus:
          profile.registrationStatus,

        turnoverClassification:
          invoice.turnoverClassification,

        gctTreatment:
          invoice.gctTreatment,
      },
    });
  } catch (error) {
    console.error(
      "Review invoice GCT classification error:",
      error
    );

    res.status(500).json({
      success: false,
      message:
        "Could not review the invoice turnover classification",
      error: error.message,
    });
  }
};

const reviewExpenseInputGct = async (
  req,
  res
) => {
  try {
    const { expenseNumber } = req.params;

    const {
      supplierName = "",
      supplierTrn = "",
      supplierGctRegistrationNumber = "",
      supplierInvoiceNumber = "",
      amountExcludingGct = 0,
      inputGctPaid = 0,
      supportingDocumentVerified = false,
      notes = "",
    } = req.body;

    const expense = await Expense.findOne({
      expenseNumber,
    });

    if (!expense) {
      return res.status(404).json({
        success: false,
        message: "Expense not found.",
      });
    }

    const grossAmount =
      roundMoney(expense.amount);

    const inputTax =
      Math.max(
        0,
        roundMoney(inputGctPaid)
      );

    const amountBeforeTax =
      amountExcludingGct
        ? Math.max(
            0,
            roundMoney(
              amountExcludingGct
            )
          )
        : Math.max(
            0,
            roundMoney(
              grossAmount - inputTax
            )
          );

    if (
      roundMoney(
        amountBeforeTax + inputTax
      ) > grossAmount
    ) {
      return res.status(400).json({
        success: false,
        message:
          "The amount excluding GCT plus input GCT cannot exceed the expense amount.",
      });
    }

    const entityCode =
      expense.businessEntitySnapshot
        ?.entityCode ||
      "EK-SP-2026";

    const documentDate =
      String(expense.date).slice(0, 10);

    const profile =
      await getActiveProfile(
        entityCode,
        documentDate
      );

    if (!profile) {
      return res.status(409).json({
        success: false,
        message:
          "No active GCT profile applies to this expense.",
      });
    }

    const registered =
      profile.registrationStatus ===
      "Registered";

    const evidenceComplete =
      Boolean(
        String(
          supplierGctRegistrationNumber
        ).trim()
      ) &&
      Boolean(
        String(
          supplierInvoiceNumber
        ).trim()
      ) &&
      Boolean(
        supportingDocumentVerified
      );

    const inputGctClaimable =
      registered &&
      inputTax > 0 &&
      evidenceComplete;

    expense.gctTreatment = {
      businessRegistrationStatus:
        profile.registrationStatus,

      supplierName:
        String(supplierName).trim(),

      supplierTrn:
        String(supplierTrn).trim(),

      supplierGctRegistrationNumber:
        String(
          supplierGctRegistrationNumber
        ).trim(),

      supplierInvoiceNumber:
        String(
          supplierInvoiceNumber
        ).trim(),

      amountExcludingGct:
        amountBeforeTax,

      inputGctPaid:
        inputTax,

      inputGctClaimable,

      claimStatus:
        inputGctClaimable
          ? "Potentially Claimable"
          : "Not Claimable",

      nonClaimReason:
        inputGctClaimable
          ? ""
          : !registered
            ? "Business was not registered for GCT on the expense date."
            : inputTax <= 0
              ? "No input GCT was recorded."
              : "Supplier tax-invoice evidence is incomplete.",

      supportingDocumentVerified:
        Boolean(
          supportingDocumentVerified
        ),

      verifiedBy:
        supportingDocumentVerified
          ? getUserName(req.user)
          : "",

      verifiedAt:
        supportingDocumentVerified
          ? new Date()
          : null,

      filingPeriodKey:
        documentDate.slice(0, 7),
    };

    if (notes) {
      expense.description =
        `${expense.description} | GCT review: ${String(
          notes
        ).trim()}`;
    }

    await expense.save();

    res.json({
      success: true,
      message:
        "Expense input-GCT evidence reviewed successfully",
      data: {
        expenseNumber:
          expense.expenseNumber,

        entityCode,

        registrationStatus:
          profile.registrationStatus,

        gctTreatment:
          expense.gctTreatment,
      },
    });
  } catch (error) {
    console.error(
      "Review expense input GCT error:",
      error
    );

    res.status(500).json({
      success: false,
      message:
        "Could not review the expense input-GCT evidence",
      error: error.message,
    });
  }
};

module.exports = {
  reviewInvoiceTurnoverClassification,
  reviewExpenseInputGct,
};