const crypto = require("crypto");
const mongoose = require("mongoose");

const Package = require("../models/Package");
const Setting = require("../models/Setting");
const Customer = require("../models/Customer");
const BusinessEntity = require("../models/BusinessEntity");
const CustomerNotification = require("../models/CustomerNotification");
const StorageCharge = require("../models/StorageCharge");
const Invoice = require("../models/Invoice");
const JournalEntry = require("../models/JournalEntry");
const ChartOfAccount = require("../models/ChartOfAccount");
const GeneralLedgerTransaction = require("../models/GeneralLedgerTransaction");

const {
  buildEntitySnapshot,
} = require("./entityPostingContextService");

const {
  previewPackageStorage,
} = require("./storagePreviewService");

const {
  SYSTEM_ACCOUNTS,
} = require("./accountingEngine/accountingConstants");

const {
  validateAccountingPeriodOpen,
} = require("./accountingEngine/journalService");

const {
  calculateUpdatedBalance,
  syncFinancialAccountsForChartAccount,
} = require("./accountingEngine/balanceService");

const jamaicaDate = (date) => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Jamaica",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const part = (type) =>
    parts.find((item) => item.type === type).value;

  return `${part("year")}-${part("month")}-${part("day")}`;
};

const buildUnbilledStorageDays = (
  preview,
  period,
  existingDates
) => {
  if (!preview.available || preview.chargeableDays === 0) {
    return [];
  }

  if (
    period.freeBusinessDays !== 7 ||
    period.firstDayFee !== 150 ||
    period.additionalDailyFee !== 50 ||
    period.currency !== "JMD" ||
    period.policyVersion !== "2027-01-01"
  ) {
    throw new Error("The package storage policy needs review.");
  }

  if (
    !Number.isInteger(preview.chargeableDays) ||
    preview.chargeableDays < 0 ||
    preview.chargeableDays > 3660
  ) {
    throw new Error("The storage period needs review.");
  }

  const first = new Date(
    `${preview.firstChargeDate}T00:00:00.000Z`
  );

  if (Number.isNaN(first.getTime())) {
    throw new Error("Invalid storage start date.");
  }

  const days = [];

  for (
    let index = 0;
    index < preview.chargeableDays;
    index += 1
  ) {
    const date = new Date(first);
    date.setUTCDate(date.getUTCDate() + index);

    const chargeDate = date.toISOString().slice(0, 10);

    if (!existingDates.has(chargeDate)) {
      days.push({
        chargeDate,
        amount: index === 0 ? 150 : 50,
      });
    }
  }

  return days;
};

const validateStorageEntity = (entities) => {
  if (entities.length !== 1) {
    throw new Error(
      "Storage billing requires exactly one Active business entity for the billing date."
    );
  }

  const entity = entities[0];

  if (
    !entity.trn ||
    (
      entity.entityType === "Limited Liability Company" &&
      !entity.registrationNumber
    )
  ) {
    throw new Error(
      "The active entity registration or TRN needs review."
    );
  }

  /*
   * Do not assume a tax rate or silently omit registered GCT.
   * A registered entity needs its storage-tax calculation
   * connected before this billing action can proceed.
   */
  if (
    entity.taxTreatment?.gctRegistrationStatus !==
    "Not Registered"
  ) {
    throw new Error(
      "Storage billing requires a reviewed GCT calculation for this entity before it can proceed."
    );
  }

  return entity;
};

const createStorageInvoice = async ({
  packageId,
  user,
}) => {
  if (!mongoose.isValidObjectId(packageId)) {
    throw new Error("Invalid package reference.");
  }

  /*
   * Ensure duplicate-day protection exists before opening
   * the transaction. No charge records are created here.
   */
  await StorageCharge.collection.createIndex(
    { packageId: 1, chargeDate: 1 },
    { unique: true }
  );

  return mongoose.connection.transaction(async (session) => {
    const now = new Date();
    const today = jamaicaDate(now);

    const settings = await Setting.findOne({
      settingKey: "main",
    }).session(session);

    if (settings?.storageFees?.enabled !== true) {
      throw new Error("Storage charging is disabled.");
    }

    if (
      settings.storageFees.effectiveFrom !== "2027-01-01" ||
      today < "2027-01-01"
    ) {
      throw new Error(
        "Storage charging has not reached its effective date."
      );
    }

    const pkg = await Package.findById(packageId)
      .session(session)
      .lean();

    if (
      !pkg ||
      ["Deleted", "Deleted by KP"].includes(pkg.status)
    ) {
      throw new Error("Package not found.");
    }

    if (
      !pkg.collectedAt &&
      pkg.status !== "Ready for Pickup"
    ) {
      throw new Error(
        "The package is not ready for collection."
      );
    }

    const customer = await Customer.findOne({
      ekonId: pkg.customerEkonId,
    }).session(session);

    if (!customer) {
      throw new Error("Customer not found.");
    }

    const period = pkg.storagePeriod;

    if (
      !period?.noticeNumber ||
      !period.noticeSentAt
    ) {
      throw new Error(
        "A storage notice is required first."
      );
    }

    const notice = await CustomerNotification.findOne({
      notificationNumber: period.noticeNumber,
      customerEkonId: pkg.customerEkonId,
    })
      .session(session)
      .lean();

    if (
      !notice ||
      jamaicaDate(notice.createdAt) !==
        jamaicaDate(period.noticeSentAt)
    ) {
      throw new Error(
        "The saved storage notice needs review."
      );
    }

    /*
     * Uses the real holiday calendar.
     * An unconfirmed year blocks billing.
     * The preview stops on the collection date when recorded.
     */
    const preview = previewPackageStorage({
      pkg,
      asOf: now,
    });

    const existing = await StorageCharge.find({
      packageId: pkg._id,
    })
      .session(session)
      .lean();

    if (
      existing.some(
        (charge) =>
          !charge.invoiceNumber ||
          !charge.journalEntryNumber
      )
    ) {
      throw new Error(
        "An existing storage charge needs accounting review."
      );
    }

    const days = buildUnbilledStorageDays(
      preview,
      period,
      new Set(
        existing.map((charge) => charge.chargeDate)
      )
    );

    if (!days.length) {
      return {
        created: false,
        message: "No new storage days to invoice.",
      };
    }

    const entities = await BusinessEntity.find({
      lifecycleStatus: "Active",
      effectiveFrom: { $lte: today },
      $or: [
        { effectiveTo: "" },
        { effectiveTo: { $gte: today } },
        { effectiveTo: { $exists: false } },
      ],
    })
      .limit(2)
      .session(session)
      .lean();

    const entity = validateStorageEntity(entities);

    const entityContext = {
      entityId: entity._id,
      entityCode: entity.entityCode,
      entitySnapshot: buildEntitySnapshot(entity),
    };

    /*
     * Updating this package inside the transaction makes
     * concurrent billing or collection updates conflict
     * and retry instead of using conflicting package data.
     */
    await Package.updateOne(
      { _id: pkg._id },
      { $inc: { editVersion: 1 } },
      { session }
    );

    await validateAccountingPeriodOpen(today);

    const amount = days.reduce(
      (sum, day) => sum + day.amount,
      0
    );

    const invoiceNumber =
      `INV-ST-${crypto.randomUUID()}`;

    const entryNumber =
      `JE-${crypto.randomUUID()}`;

    const actor =
      user?.fullName ||
      user?.name ||
      user?.email ||
      "System User";

    const postingLines = [
      {
        accountCode:
          SYSTEM_ACCOUNTS.ACCOUNTS_RECEIVABLE,
        debit: amount,
        credit: 0,
      },
      {
        accountCode:
          SYSTEM_ACCOUNTS.STORAGE_REVENUE,
        debit: 0,
        credit: amount,
      },
    ];

    const prepared = [];

    for (const line of postingLines) {
      const account = await ChartOfAccount.findOne({
        accountCode: line.accountCode,
        status: "Active",
      }).session(session);

      if (!account) {
        throw new Error(
          `Active account ${line.accountCode} was not found.`
        );
      }

      if (
        line.accountCode ===
          SYSTEM_ACCOUNTS.STORAGE_REVENUE &&
        (
          account.accountCategory !== "Revenue" ||
          account.normalBalance !== "Credit"
        )
      ) {
        throw new Error(
          "The Storage Revenue account needs review."
        );
      }

      account.currentBalance =
        calculateUpdatedBalance({
          currentBalance: account.currentBalance,
          normalBalance: account.normalBalance,
          debit: line.debit,
          credit: line.credit,
        });

      await account.save({ session });

      prepared.push({
        ...line,
        accountName: account.accountName,
        accountCategory: account.accountCategory,
        normalBalance: account.normalBalance,
        runningBalance: account.currentBalance,
        description:
          `Storage for ${pkg.trackingNumber}`,
      });
    }

    await JournalEntry.create(
      [
        {
          entryNumber,
          entryDate: today,
          reference: invoiceNumber,
          sourceModule: "Invoices",
          sourceDocumentType: "Invoice",
          sourceDocumentNumber: invoiceNumber,
          ...entityContext,
          memo:
            `Storage invoice for ${customer.name}`,
          createdBy: actor,
          postedBy: actor,
          postedAt: now,
          status: "Posted",
          locked: true,
          totalDebit: amount,
          totalCredit: amount,
          lines: prepared.map((line) => ({
            accountCode: line.accountCode,
            accountName: line.accountName,
            debit: line.debit,
            credit: line.credit,
            description: line.description,
          })),
        },
      ],
      { session }
    );

    for (const line of prepared) {
      await GeneralLedgerTransaction.create(
        [
          {
            ...line,
            ledgerNumber:
              `GL-${crypto.randomUUID()}`,
            entryNumber,
            entryDate: today,
            reference: invoiceNumber,
            sourceModule: "Invoices",
            sourceDocumentType: "Invoice",
            sourceDocumentNumber: invoiceNumber,
            ...entityContext,
            memo:
              `Storage invoice for ${customer.name}`,
            postedBy: actor,
            postedAt: now,
            locked: true,
          },
        ],
        { session }
      );

      await syncFinancialAccountsForChartAccount(
        line.accountCode,
        session
      );
    }

    const [invoice] = await Invoice.create(
      [
        {
          invoiceNumber,
          customerEkonId: customer.ekonId,
          customerName: customer.name,
          invoiceSource: "Storage",
          packageCount: 1,
          packages: [],
          subtotal: 0,
          ...entityContext,

          businessEntitySnapshot: {
            entityCode: entity.entityCode,
            legalName: entity.legalName,
            businessType: entity.entityType,
            registrationNumber:
              entity.registrationNumber || "",
            trn: entity.trn,
            effectiveFrom: entity.effectiveFrom,
          },

          storageFeeTotal: amount,

          storageFeeLines: [
            {
              packageId: pkg._id,
              trackingNumber: pkg.trackingNumber,
              fromDate: days[0].chargeDate,
              throughDate:
                days[days.length - 1].chargeDate,
              chargeableDays: days.length,
              amount,
            },
          ],

          finalTotal: amount,
          amountPaid: 0,
          balanceDue: amount,
          dueDate: today,
          paymentTerms: "Due on Receipt",
          status: "Unpaid",
          journalEntryNumber: entryNumber,
          journalStatus: "Posted",
          journalPostedAt: now,
          createdAt: today,
        },
      ],
      { session }
    );

    await StorageCharge.create(
      days.map((day) => ({
        packageId: pkg._id,
        customerEkonId: customer.ekonId,
        trackingNumberAtCharge:
          pkg.trackingNumber,
        ...day,
        currency: "JMD",
        policyVersion: period.policyVersion,
        storageNoticeNumber:
          period.noticeNumber,
        invoiceNumber,
        journalEntryNumber: entryNumber,
      })),
      { session }
    );

    return {
      created: true,
      message:
        "Storage invoice created successfully.",
      invoice,
    };
  });
};

module.exports = {
  createStorageInvoice,
  buildUnbilledStorageDays,
  validateStorageEntity,
};