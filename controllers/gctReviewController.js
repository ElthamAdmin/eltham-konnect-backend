const Invoice = require("../models/Invoice");
const Expense = require("../models/Expense");

const TaxRegistrationProfile = require(
  "../models/TaxRegistrationProfile"
);

const GctRegisterEntry = require(
  "../models/GctRegisterEntry"
);

const GctFilingPeriod = require(
  "../models/GctFilingPeriod"
);

const TaxDocument = require(
  "../models/TaxDocument"
);

const T = require("../services/taxControl");
const S = require("../services/taxScopeService");

const {
  transact,
} = require(
  "../services/taxTransactionService"
);

const {
  writeAuditLog,
} = require("../utils/auditLogger");

const reviewSource = (sourceType) =>
  T.handler(async (req, res) => {
    const body = req.body || {};

    const isInvoice =
      sourceType === "Invoice";

    const Model = isInvoice
      ? Invoice
      : Expense;

    const referenceField = isInvoice
      ? "invoiceNumber"
      : "expenseNumber";

    const reference = T.text(
      req.params[referenceField],
      referenceField
    );

    const selectedEntityCode =
      T.text(
        body.entityCode,
        "Selected business"
      ).toUpperCase();

    const data = await transact(
      async (session) => {
        const source =
          await Model.findOne({
            [referenceField]:
              reference,
          }).session(session);

        if (!source) {
          T.fail(
            "Source record not found.",
            404
          );
        }

        if (
          [
            "Draft",
            "Cancelled",
            "Refunded",
          ].includes(source.status)
        ) {
          T.fail(
            "This source is not eligible for GCT review.",
            409
          );
        }

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
              "Source business"
            ).toUpperCase()
          );

        const distinctCodes = [
          ...new Set(codes),
        ];

        if (
          distinctCodes.length !== 1 ||
          distinctCodes[0] !==
            selectedEntityCode
        ) {
          T.fail(
            "Source attribution is missing, conflicting, or belongs to a different selected business.",
            409
          );
        }

        const entityCode =
          distinctCodes[0];

        const sourceDate = T.date(
          isInvoice
            ? source.createdAt
            : source.date,

          "Source date"
        );

        await S.resolve(
          entityCode,
          sourceDate,
          sourceDate,
          session
        );

        const registers =
          await GctRegisterEntry.find({
            sourceDocumentId:
              source._id,
          }).session(session);

        for (const register of registers) {
          if (
            register.entityCode !==
            entityCode
          ) {
            T.fail(
              "The source register has conflicting business attribution.",
              409
            );
          }

          const filingQuery =
            register.filingPeriodId
              ? {
                  _id:
                    register.filingPeriodId,
                }
              : {
                  filingNumber:
                    register.filingNumber,
                };

          const filing =
            await GctFilingPeriod.findOne(
              filingQuery
            ).session(session);

          if (
            !filing ||
            [
              "Reviewed",
              "Approved",
              "Submitted",
              "Paid",
              "Reconciled",
            ].includes(filing.status)
          ) {
            T.fail(
              "This source has a missing or locked filing link. Use a reviewed correction instead of rewriting its evidence.",
              409
            );
          }
        }

        const effectiveDate =
          new Date(
            `${sourceDate}T12:00:00.000Z`
          );

        const profiles =
          await TaxRegistrationProfile.find({
            entityCode,
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
          }).session(session);

        if (profiles.length !== 1) {
          T.fail(
            "Exactly one Active GCT profile must cover this source date.",
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
            "The applicable GCT profile requires verified source information.",
            409
          );
        }

        const beforeValues =
          source.toObject();

        const userName =
          T.actor(req);

        const now = new Date();

        if (isInvoice) {
          const gross =
            T.amount(
              source.finalTotal,
              "Invoice total"
            );

          const recovery =
            T.amount(
              body.customerPurchaseRecovery ??
                0,

              "Customer purchase recovery"
            );

          const customs =
            source.invoiceSource ===
            "Customer Purchases"
              ? T.amount(
                  source
                    .customerPurchaseCustomsDuty ??
                    source.customsDuty ??
                    0,

                  "Customs recovery"
                )
              : T.amount(
                  source.customsDuty ??
                    0,

                  "Customs recovery"
                );

          const exempt =
            T.amount(
              body.exemptTurnover ?? 0,
              "Exempt turnover"
            );

          const zeroRated =
            T.amount(
              body.zeroRatedTurnover ??
                0,

              "Zero-rated turnover"
            );

          const outsideScope =
            T.amount(
              body.outsideScopeAmount ??
                0,

              "Outside-scope amount"
            );

          const outputGct =
            T.amount(
              source.gctTreatment
                ?.outputGct ?? 0,

              "Recorded output GCT"
            );

          if (
            outputGct !==
            T.amount(
              source.gct ?? 0,
              "Invoice GCT"
            )
          ) {
            T.fail(
              "The invoice GCT fields disagree. Review source accounting before classification.",
              409
            );
          }

          const exclusions =
            T.round(
              recovery +
                customs +
                exempt +
                zeroRated +
                outsideScope +
                outputGct
            );

          if (exclusions > gross) {
            T.fail(
              "Recoveries, excluded turnover, and recorded output GCT cannot exceed the invoice total."
            );
          }

          const taxableTurnover =
            T.round(
              gross - exclusions
            );

          const registered =
            profile.registrationStatus ===
            "Registered";

          if (
            !registered &&
            outputGct > 0
          ) {
            T.fail(
              "An unregistered-period invoice contains output GCT and requires source-accounting review.",
              409
            );
          }

          if (registered) {
            const treatment =
              source.gctTreatment
                ?.treatment;

            if (
              ![
                "Taxable Supply",
                "Zero-Rated Supply",
                "Exempt Supply",
                "Outside Scope",
                "Mixed Supply",
              ].includes(treatment)
            ) {
              T.fail(
                "The registered-period invoice requires a reviewed supply treatment in its source accounting.",
                409
              );
            }

            if (
              taxableTurnover > 0 &&
              (
                ![
                  "Taxable Supply",
                  "Mixed Supply",
                ].includes(treatment) ||
                outputGct <= 0
              )
            ) {
              T.fail(
                "Taxable turnover and recorded output GCT require source-accounting review.",
                409
              );
            }
          }

          source.turnoverClassification = {
            grossInvoiceAmount:
              gross,

            customerPurchaseRecovery:
              recovery,

            serviceRevenue:
              taxableTurnover,

            potentiallyTaxableTurnover:
              taxableTurnover,

            exemptTurnover:
              exempt,

            zeroRatedTurnover:
              zeroRated,

            outsideScopeAmount:
              outsideScope,

            classificationStatus:
              "Reviewed",

            classificationNotes:
              T.text(
                body.classificationNotes ??
                  "",

                "Classification notes",
                false
              ),

            classifiedAt: now,
            classifiedBy: userName,
          };
        } else {
          if (
            typeof body
              .supportingDocumentVerified !==
            "boolean"
          ) {
            T.fail(
              "Supporting-document verification must be true or false."
            );
          }

          const gross =
            T.amount(
              source.amount,
              "Expense amount"
            );

          const inputGct =
            T.amount(
              body.inputGctPaid ?? 0,
              "Input GCT paid"
            );

          if (inputGct > gross) {
            T.fail(
              "Input GCT cannot exceed the expense amount."
            );
          }

          const amountExcludingGct =
            body.amountExcludingGct ===
            undefined
              ? T.round(
                  gross - inputGct
                )
              : T.amount(
                  body.amountExcludingGct,
                  "Amount excluding GCT"
                );

          if (
            T.round(
              amountExcludingGct +
                inputGct
            ) > gross
          ) {
            T.fail(
              "Amount excluding GCT plus input GCT cannot exceed the expense."
            );
          }

          const supplierRegistration =
            T.text(
              body.supplierGctRegistrationNumber ??
                "",

              "Supplier GCT registration",
              false
            );

          const supplierInvoice =
            T.text(
              body.supplierInvoiceNumber ??
                "",

              "Supplier invoice number",
              false
            );

          const documentNumber =
            T.text(
              body.supportingDocumentNumber ??
                "",

              "Supporting document number",
              false
            ).toUpperCase();

          if (
            body.supportingDocumentVerified
          ) {
            if (
              !supplierRegistration ||
              !supplierInvoice ||
              !documentNumber
            ) {
              T.fail(
                "Supplier registration, supplier invoice number, and preserved document number are required."
              );
            }

            const document =
              await TaxDocument.findOne({
                documentNumber,
                entityCode,
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
              !document.cloudinaryPublicId ||
              !document.cloudinaryAssetId ||
              !document.verifiedBy ||
              !document.verifiedAt
            ) {
              T.fail(
                "A verified, authenticated Cloudinary supplier tax invoice with preserved asset metadata is required.",
                409
              );
            }

            if (
              document.externalReference !==
              supplierInvoice
            ) {
              T.fail(
                "The preserved document's external reference must match the supplier invoice number.",
                409
              );
            }

            if (
              document.periodKey &&
              document.periodKey !==
                sourceDate.slice(0, 7)
            ) {
              T.fail(
                "The supporting document belongs to a different reporting period.",
                409
              );
            }
          }

          const eligible =
            profile.registrationStatus ===
              "Registered" &&
            inputGct > 0 &&
            body.supportingDocumentVerified &&
            Boolean(
              supplierRegistration &&
                supplierInvoice
            );

          const supportedStatus =
            [
              "Registered",
              "Suspended",
              "Deregistered",
            ].includes(
              profile.registrationStatus
            )
              ? profile.registrationStatus
              : "Not Registered";

          source.gctTreatment = {
            businessRegistrationStatus:
              supportedStatus,

            supplierName:
              T.text(
                body.supplierName ?? "",
                "Supplier name",
                false
              ),

            supplierTrn:
              T.text(
                body.supplierTrn ?? "",
                "Supplier TRN",
                false
              ),

            supplierGctRegistrationNumber:
              supplierRegistration,

            supplierInvoiceNumber:
              supplierInvoice,

            supportingDocumentNumber:
              documentNumber,

            amountExcludingGct,
            inputGctPaid: inputGct,
            inputGctClaimable: eligible,

            claimStatus: eligible
              ? "Potentially Claimable"
              : "Not Claimable",

            nonClaimReason: eligible
              ? ""
              : profile.registrationStatus !==
                  "Registered"
                ? "Business was not registered on the expense date."
                : inputGct === 0
                  ? "No input GCT was recorded."
                  : "Supplier evidence is incomplete.",

            supportingDocumentVerified:
              body.supportingDocumentVerified,

            verifiedBy:
              body.supportingDocumentVerified
                ? userName
                : "",

            verifiedAt:
              body.supportingDocumentVerified
                ? now
                : null,

            filingPeriodKey:
              sourceDate.slice(0, 7),
          };
        }

        await source.save({
          session,
        });

        await writeAuditLog({
          req,
          session,

          action:
            "REVIEW_GCT_SOURCE",

          module: "Tax Center",

          description:
            `Reviewed ${reference}`,

          targetType:
            sourceType,

          targetId:
            reference,

          beforeValues,

          afterValues:
            source.toObject(),
        });

        return source;
      }
    );

    return res.json({
      success: true,

      message:
        "GCT source review saved. Recalculate the unlocked filing period to refresh its register.",

      data,
    });
  });

module.exports = {
  reviewInvoiceTurnoverClassification:
    reviewSource("Invoice"),

  reviewExpenseInputGct:
    reviewSource("Expense"),
};