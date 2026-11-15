const mongoose = require("mongoose");
const CustomerPurchase = require("../models/CustomerPurchase");
const CustomerPurchaseRefund = require("../models/CustomerPurchaseRefund");

const {
  recordMerchantRefund,
  payPurchaseCredit,
} = require("../services/customerPurchaseRefundService");
const Customer = require("../models/Customer");
const Package = require("../models/Package");
const FinancialAccount = require("../models/FinancialAccount");
const AccountTransaction = require("../models/AccountTransaction");

const {
  postCustomerPurchase,
  refundCustomerPurchase,
} = require("../services/accountingService");

const { writeAuditLog } = require("../utils/auditLogger");
const { writeFinanceAuditLog } = require("../utils/financeAuditHelper");

const roundMoney = (value) =>
  Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;

const getUserName = (user) =>
  user?.fullName || user?.name || user?.email || "System User";

const getJamaicaDateString = (date = new Date()) => {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Jamaica",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  return formatter.format(date);
};

const escapeRegex = (value = "") =>
  String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const generatePurchaseNumber = () =>
  `CPR-${Date.now()}-${Math.floor(Math.random() * 10000)}`;

const generateTransactionNumber = () =>
  `TRN-${Date.now()}-${Math.floor(Math.random() * 10000)}`;

const calculateBaseCurrencyAmount = ({
  purchaseAmount,
  purchaseCurrency,
  exchangeRate,
}) => {
  const amount = roundMoney(purchaseAmount);
  const currency = String(purchaseCurrency || "JMD").toUpperCase();
  const rate = roundMoney(exchangeRate || 1);

  if (currency === "JMD") {
    return amount;
  }

  return roundMoney(amount * rate);
};

const calculateRecoveryTotals = ({
  itemRecoveryAmount = 0,
  shoppingAssistanceFee = 0,
  weightCharge = 0,
  shippingCharge = 0,
  customsDuty = 0,
  deliveryFee = 0,
  otherCharges = 0,
  recoveredAmount = 0,
}) => {
  const totalCustomerCharge = roundMoney(
    Number(itemRecoveryAmount || 0) +
      Number(shoppingAssistanceFee || 0) +
      Number(weightCharge || 0) +
      Number(shippingCharge || 0) +
      Number(customsDuty || 0) +
      Number(deliveryFee || 0) +
      Number(otherCharges || 0)
  );

  const outstandingAmount = Math.max(
    0,
    roundMoney(totalCustomerCharge - Number(recoveredAmount || 0))
  );

  return {
    totalCustomerCharge,
    outstandingAmount,
  };
};

const getCustomerPurchases = async (req, res) => {
  try {
    const {
      search = "",
      status = "",
      recoveryStatus = "",
      customerEkonId = "",
      branch = "",
      merchant = "",
      paymentAccountNumber = "",
      from = "",
      to = "",
      page = 1,
      limit = 25,
    } = req.query;

    const query = {};

    if (status) query.status = status;
    if (recoveryStatus) query.recoveryStatus = recoveryStatus;
    if (customerEkonId) query.customerEkonId = customerEkonId;
    if (branch) query.branch = branch;
    if (merchant) query.merchant = merchant;
    if (paymentAccountNumber) {
      query.paymentAccountNumber = paymentAccountNumber;
    }

    if (from || to) {
      query.purchaseDate = {};

      if (from) query.purchaseDate.$gte = from;
      if (to) query.purchaseDate.$lte = to;
    }

    if (search) {
      const safeSearch = escapeRegex(search);

      query.$or = [
        { purchaseNumber: { $regex: safeSearch, $options: "i" } },
        { customerEkonId: { $regex: safeSearch, $options: "i" } },
        { customerName: { $regex: safeSearch, $options: "i" } },
        { merchant: { $regex: safeSearch, $options: "i" } },
        { orderNumber: { $regex: safeSearch, $options: "i" } },
        { trackingNumber: { $regex: safeSearch, $options: "i" } },
        { invoiceNumber: { $regex: safeSearch, $options: "i" } },
      ];
    }

    const numericPage = Math.max(1, Number(page || 1));
    const numericLimit = Math.min(100, Math.max(1, Number(limit || 25)));
    const skip = (numericPage - 1) * numericLimit;

    const [purchases, total] = await Promise.all([
      CustomerPurchase.find(query)
        .sort({ purchaseDate: -1, createdAt: -1 })
        .skip(skip)
        .limit(numericLimit),
      CustomerPurchase.countDocuments(query),
    ]);

    res.json({
      success: true,
      message: "Customer purchases retrieved successfully.",
      totalPurchases: total,
      data: purchases,
      pagination: {
        page: numericPage,
        limit: numericLimit,
        pages: Math.ceil(total / numericLimit),
        total,
      },
    });
  } catch (error) {
    console.error("Customer purchase list error:", error);

    res.status(500).json({
      success: false,
      message: "Could not retrieve customer purchases.",
      error: error.message,
    });
  }
};

const getCustomerPurchaseByNumber = async (req, res) => {
  try {
    const { purchaseNumber } = req.params;

    const purchase = await CustomerPurchase.findOne({
      purchaseNumber,
    })
      .populate("customerId", "ekonId name email phone branch status")
      .populate(
        "packageId",
        "trackingNumber customerEkonId customerName courier weight status warehouseLocation invoiceStatus dateReceived"
      );

    if (!purchase) {
      return res.status(404).json({
        success: false,
        message: "Customer purchase not found.",
      });
    }

    res.json({
      success: true,
      data: purchase,
    });
  } catch (error) {
    console.error("Customer purchase detail error:", error);

    res.status(500).json({
      success: false,
      message: "Could not retrieve customer purchase.",
      error: error.message,
    });
  }
};

const getCustomerPurchaseDashboard = async (req, res) => {
  try {
    const activeStatuses = {
      $nin: ["Cancelled", "Refunded", "Reversed"],
    };

        const [
      totalPurchases,
      pendingPurchase,
      purchased,
      trackingReceived,
      inTransit,
      atWarehouse,
      recoveryCalculated,
      readyToInvoice,
      invoiced,
      recovered,
      outstandingSummary,
      cardExposureSummary,
      recentPurchases,
    ] = await Promise.all([
      CustomerPurchase.countDocuments(),
            CustomerPurchase.countDocuments({
        status: "Pending Purchase",
      }),

      CustomerPurchase.countDocuments({
        status: "Purchased",
      }),

      CustomerPurchase.countDocuments({
        status: "Tracking Received",
      }),

      CustomerPurchase.countDocuments({
        status: "In Transit",
      }),

      CustomerPurchase.countDocuments({
        status: "At Warehouse",
      }),

      CustomerPurchase.countDocuments({
        status: "Recovery Calculated",
      }),

      CustomerPurchase.countDocuments({
        status: "Ready to Invoice",
      }),

      CustomerPurchase.countDocuments({
        status: "Invoiced",
      }),
      CustomerPurchase.countDocuments({
        status: { $in: ["Recovered", "Refunded"] },
      }),
      CustomerPurchase.aggregate([
        {
          $match: {
            status: activeStatuses,
            outstandingAmount: { $gt: 0 },
          },
        },
        {
          $group: {
            _id: null,
            totalOutstanding: { $sum: "$outstandingAmount" },
            outstandingPurchases: { $sum: 1 },
          },
        },
      ]),
      CustomerPurchase.aggregate([
        {
          $match: {
            status: activeStatuses,
            paymentAccountType: "Credit Card",
          },
        },
        {
          $group: {
            _id: null,
            totalCreditCardExposure: { $sum: "$baseCurrencyAmount" },
            creditCardPurchaseCount: { $sum: 1 },
          },
        },
      ]),
      CustomerPurchase.find()
        .sort({ createdAt: -1 })
        .limit(10),
    ]);

    const outstanding = outstandingSummary[0] || {
      totalOutstanding: 0,
      outstandingPurchases: 0,
    };

    const creditCardExposure = cardExposureSummary[0] || {
      totalCreditCardExposure: 0,
      creditCardPurchaseCount: 0,
    };

    res.json({
      success: true,
      data: {
        totalPurchases,
        pendingPurchase,
        purchased,
        trackingReceived,
        inTransit,
        atWarehouse,
        recoveryCalculated,
        readyToInvoice,
        invoiced,
        recovered,
        outstandingPurchases: outstanding.outstandingPurchases,
        totalOutstanding: roundMoney(outstanding.totalOutstanding),
        creditCardPurchaseCount:
          creditCardExposure.creditCardPurchaseCount,
        totalCreditCardExposure: roundMoney(
          creditCardExposure.totalCreditCardExposure
        ),
        recentPurchases,
      },
    });
  } catch (error) {
    console.error("Customer purchase dashboard error:", error);

    res.status(500).json({
      success: false,
      message: "Could not retrieve customer purchase dashboard.",
      error: error.message,
    });
  }
};

const createCustomerPurchase = async (req, res) => {
  const reject = (message, statusCode = 400) => {
    const error = new Error(message);
    error.statusCode = statusCode;
    throw error;
  };

  try {
    const {
      customerEkonId,
      requestDate,
      purchaseDate,
      merchant,
      website,
      orderNumber,
      items = [],
      purchaseCurrency = "USD",
      purchaseAmount,
      exchangeRate = 1,
      paymentAccountNumber,
      branch,
      receiptUrl,
      orderConfirmationUrl,
      notes,
    } = req.body || {};

    if (
      !customerEkonId ||
      !purchaseDate ||
      !String(merchant || "").trim() ||
      !paymentAccountNumber
    ) {
      reject(
        "Customer, purchase date, merchant and payment account are required."
      );
    }

    const numericPurchaseAmount = roundMoney(purchaseAmount);
    const numericExchangeRate = roundMoney(exchangeRate);

    if (
      !Number.isFinite(Number(purchaseAmount)) ||
      !Number.isFinite(numericPurchaseAmount) ||
      numericPurchaseAmount <= 0
    ) {
      reject(
        "Purchase amount must be a finite amount greater than zero."
      );
    }

    if (
      !Number.isFinite(Number(exchangeRate)) ||
      !Number.isFinite(numericExchangeRate) ||
      numericExchangeRate <= 0
    ) {
      reject(
        "Exchange rate must be a finite number greater than zero."
      );
    }

    const currency = String(purchaseCurrency)
      .trim()
      .toUpperCase();

    if (!["JMD", "USD"].includes(currency)) {
      reject("Select JMD or USD as the purchase currency.");
    }

    const parsedDate = new Date(
      `${purchaseDate}T00:00:00.000Z`
    );

    if (
      typeof purchaseDate !== "string" ||
      !/^\d{4}-\d{2}-\d{2}$/.test(purchaseDate) ||
      !Number.isFinite(parsedDate.getTime()) ||
      parsedDate.toISOString().slice(0, 10) !== purchaseDate
    ) {
      reject(
        "Purchase date must be a valid YYYY-MM-DD date."
      );
    }

    if (!Array.isArray(items)) {
      reject("Purchase items must be a list.");
    }

    const preparedItems = items
      .map((item) => {
        if (
          !item ||
          typeof item !== "object" ||
          Array.isArray(item)
        ) {
          reject("Each purchase item must be an object.");
        }

        const itemName = String(item.itemName || "").trim();

        if (!itemName) return null;

        const quantity = Number(item.quantity ?? 1);
        const unitPrice = roundMoney(item.unitPrice ?? 0);

        const totalAmount = roundMoney(
          item.totalAmount ?? quantity * unitPrice
        );

        if (
          !Number.isFinite(quantity) ||
          quantity < 1 ||
          !Number.isFinite(unitPrice) ||
          unitPrice < 0 ||
          !Number.isFinite(totalAmount) ||
          totalAmount < 0
        ) {
          reject(
            "Item quantities must be at least one, and item prices and totals must be finite, nonnegative amounts."
          );
        }

        return {
          itemName,
          description: String(item.description || "").trim(),
          quantity,
          unitPrice,
          totalAmount,
          size: String(item.size || "").trim(),
          colour: String(item.colour || "").trim(),
          productUrl: String(item.productUrl || "").trim(),
        };
      })
      .filter(Boolean);

    const normalizedMerchant = String(merchant).trim();
    const normalizedOrderNumber =
      String(orderNumber || "").trim();

    const baseCurrencyAmount = calculateBaseCurrencyAmount({
      purchaseAmount: numericPurchaseAmount,
      purchaseCurrency: currency,
      exchangeRate: numericExchangeRate,
    });

    if (
      !Number.isFinite(baseCurrencyAmount) ||
      baseCurrencyAmount <= 0 ||
      !Number.isSafeInteger(
        Math.round(baseCurrencyAmount * 100)
      )
    ) {
      reject(
        "The JMD purchase amount is invalid or exceeds the supported amount range."
      );
    }

    const performedBy = getUserName(req.user);
    const purchaseNumber = generatePurchaseNumber();

    const result = await mongoose.connection.transaction(
      async (session) => {
        const customer = await Customer.findOne({
          ekonId: customerEkonId,
          status: { $ne: "Deleted" },
        }).session(session);

        if (!customer) {
          reject("Customer not found or deleted.", 404);
        }

        const paymentAccount = await FinancialAccount.findOne({
          accountNumber: paymentAccountNumber,
          status: "Active",
        }).session(session);

        if (!paymentAccount) {
          reject("Active payment account not found.", 404);
        }

        if (!paymentAccount.linkedChartAccountCode) {
          reject(
            "The selected payment account is not linked to the Chart of Accounts."
          );
        }

        if (normalizedOrderNumber) {
          const duplicateOrder = await CustomerPurchase.findOne({
            merchant: {
              $regex: `^${escapeRegex(normalizedMerchant)}$`,
              $options: "i",
            },
            orderNumber: normalizedOrderNumber,
            status: { $nin: ["Cancelled", "Reversed"] },
          }).session(session);

          if (duplicateOrder) {
            reject(
              `Purchase ${duplicateOrder.purchaseNumber} already uses this merchant and order number.`,
              409
            );
          }
        }

        const created = await CustomerPurchase.create(
          [
            {
              purchaseNumber,
              customerId: customer._id,
              customerEkonId: customer.ekonId,
              customerName: customer.name,
              customerEmail: customer.email || "",
              customerPhone: customer.phone || "",

              branch:
                branch ||
                customer.branch ||
                "Eltham Park Mainstore",

              requestDate: requestDate || "",
              purchaseDate,
              merchant: normalizedMerchant,
              website: String(website || "").trim(),
              orderNumber: normalizedOrderNumber,
              items: preparedItems,

              purchaseCurrency: currency,
              purchaseAmount: numericPurchaseAmount,
              exchangeRate: numericExchangeRate,
              baseCurrency: "JMD",
              baseCurrencyAmount,

              paymentAccountNumber: paymentAccount.accountNumber,
              paymentAccountName: paymentAccount.accountName,
              paymentAccountType: paymentAccount.accountType,
              paymentChartAccountCode:
                paymentAccount.linkedChartAccountCode,

              itemRecoveryAmount: baseCurrencyAmount,
              totalCustomerCharge: baseCurrencyAmount,
              recoveredAmount: 0,
              outstandingAmount: baseCurrencyAmount,
              recoveryStatus: "Not Invoiced",
              status: "Pending Purchase",

              receiptUrl: receiptUrl || "",
              orderConfirmationUrl: orderConfirmationUrl || "",
              notes: notes || "",
              createdBy: performedBy,
            },
          ],
          { session }
        );

        const purchase = created[0];

        const journalEntry = await postCustomerPurchase({
          purchase,
          paymentAccount,
          user: req.user,
          session,
        });

        if (!journalEntry?.entryNumber) {
          reject(
            "Purchase posting did not return a journal reference.",
            409
          );
        }

        const transactions = await AccountTransaction.create(
          [
            {
              transactionNumber: generateTransactionNumber(),
              accountNumber: paymentAccount.accountNumber,
              accountName: paymentAccount.accountName,
              linkedChartAccountCode:
                paymentAccount.linkedChartAccountCode,

              journalEntryNumber: journalEntry.entryNumber,
              ledgerReference: journalEntry.entryNumber,
              transactionType: "Customer Purchase",
              transactionDirection: "Withdrawal",
              amount: baseCurrencyAmount,

              paymentMethod:
                paymentAccount.accountType === "Credit Card"
                  ? "Business Credit Card"
                  : paymentAccount.accountType,

              reference: purchase.purchaseNumber,
              notes:
                `${purchase.customerName} purchase from ` +
                purchase.merchant,

              transactionDate: new Date(
                `${purchase.purchaseDate}T00:00:00.000Z`
              ),

              customerPurchaseNumber: purchase.purchaseNumber,
              customerEkonId: purchase.customerEkonId,
              customerName: purchase.customerName,
              merchant: purchase.merchant,
              transactionCurrency: purchase.baseCurrency,

              foreignCurrencyAmount:
                purchase.purchaseCurrency === purchase.baseCurrency
                  ? 0
                  : purchase.purchaseAmount,

              exchangeRate: purchase.exchangeRate,
            },
          ],
          { session }
        );

        const accountTransaction = transactions[0];

        purchase.journalEntryNumber = journalEntry.entryNumber;
        purchase.accountTransactionNumber =
          accountTransaction.transactionNumber;
        purchase.status = "Purchased";
        purchase.updatedBy = performedBy;

        await purchase.save({ session });

        customer.lastActivityDate = getJamaicaDateString();
        await customer.save({ session });

        await writeFinanceAuditLog({
          req,
          session,
          action: "CUSTOMER_PURCHASE_POSTED",

          description:
            `Customer purchase ${purchase.purchaseNumber} ` +
            `posted for ${purchase.customerName}`,

          targetType: "CustomerPurchase",
          targetId: purchase.purchaseNumber,
          postingDate: purchase.purchaseDate,
          journalEntry,
          accountNumber: paymentAccount.accountNumber,
          accountName: paymentAccount.accountName,
          performedByName: performedBy,

          metadata: {
            customerEkonId: purchase.customerEkonId,
            merchant: purchase.merchant,
            orderNumber: purchase.orderNumber,
            purchaseCurrency: purchase.purchaseCurrency,
            purchaseAmount: purchase.purchaseAmount,
            exchangeRate: purchase.exchangeRate,
            baseCurrencyAmount: purchase.baseCurrencyAmount,
            paymentAccountType: purchase.paymentAccountType,
            accountTransactionNumber:
              accountTransaction.transactionNumber,
          },
        });

        return {
          purchase,
          journalEntry,
          accountTransaction,
        };
      }
    );

    const {
      purchase,
      journalEntry,
      accountTransaction,
    } = result;

    // This separate operational log must not turn a committed
    // purchase into a reported posting failure.
    try {
      await writeAuditLog({
        req,
        action: "CREATE_CUSTOMER_PURCHASE",
        module: "Customer Purchases",

        description:
          `Customer purchase ${purchase.purchaseNumber} ` +
          `created for ${purchase.customerName}`,

        targetType: "CustomerPurchase",
        targetId: purchase.purchaseNumber,
        financeReference: purchase.purchaseNumber,
        journalEntryNumber: journalEntry.entryNumber,
        accountNumber: purchase.paymentAccountNumber,
        accountName: purchase.paymentAccountName,

        metadata: {
          customerEkonId: purchase.customerEkonId,
          merchant: purchase.merchant,
          orderNumber: purchase.orderNumber,
          baseCurrencyAmount: purchase.baseCurrencyAmount,
          accountTransactionNumber:
            accountTransaction.transactionNumber,
          status: purchase.status,
        },
      });
    } catch (auditError) {
      console.error(
        "Operational audit log failed after purchase commit:",
        auditError
      );
    }

    return res.status(201).json({
      success: true,
      message: "Customer purchase created and posted successfully.",
      data: purchase,
      journalEntryNumber: journalEntry.entryNumber,
      accountTransactionNumber:
        accountTransaction.transactionNumber,
    });
  } catch (error) {
    console.error("Customer purchase creation error:", error);

    const status =
      error.code === 11000
        ? 409
        : [400, 403, 404, 409].includes(error.statusCode)
        ? error.statusCode
        : 500;

    return res.status(status).json({
      success: false,

      message:
        status === 500
          ? "Could not confirm purchase creation. Check the purchase register before retrying."
          : error.code === 11000
          ? "A conflicting purchase or transaction already exists. Check the register before retrying."
          : error.message,
    });
  }
};

const updateUnpostedCustomerPurchase = async (req, res) => {
  try {
    const { purchaseNumber } = req.params;

    const purchase = await CustomerPurchase.findOne({
      purchaseNumber,
    });

    if (!purchase) {
      return res.status(404).json({
        success: false,
        message: "Customer purchase not found.",
      });
    }

    if (purchase.journalEntryNumber) {
      return res.status(400).json({
        success: false,
        message:
          "Posted customer purchases cannot be edited directly. Use a refund or reversal workflow.",
      });
    }

    const beforeValues = purchase.toObject();

    const editableFields = [
      "requestDate",
      "purchaseDate",
      "merchant",
      "website",
      "orderNumber",
      "items",
      "purchaseCurrency",
      "purchaseAmount",
      "exchangeRate",
      "branch",
      "receiptUrl",
      "orderConfirmationUrl",
      "notes",
    ];

    editableFields.forEach((field) => {
      if (req.body[field] !== undefined) {
        purchase[field] = req.body[field];
      }
    });

    purchase.purchaseCurrency = String(
      purchase.purchaseCurrency || "USD"
    ).toUpperCase();

    purchase.purchaseAmount = roundMoney(
      purchase.purchaseAmount
    );

    purchase.exchangeRate = roundMoney(
      purchase.exchangeRate || 1
    );

    purchase.baseCurrencyAmount =
      calculateBaseCurrencyAmount({
        purchaseAmount: purchase.purchaseAmount,
        purchaseCurrency: purchase.purchaseCurrency,
        exchangeRate: purchase.exchangeRate,
      });

    purchase.itemRecoveryAmount =
      purchase.baseCurrencyAmount;

    const recoveryTotals = calculateRecoveryTotals({
      itemRecoveryAmount: purchase.itemRecoveryAmount,
      shoppingAssistanceFee:
        purchase.shoppingAssistanceFee,
      weightCharge: purchase.weightCharge,
      shippingCharge: purchase.shippingCharge,
      customsDuty: purchase.customsDuty,
      deliveryFee: purchase.deliveryFee,
      otherCharges: purchase.otherCharges,
      recoveredAmount: purchase.recoveredAmount,
    });

    purchase.totalCustomerCharge =
      recoveryTotals.totalCustomerCharge;

    purchase.outstandingAmount =
      recoveryTotals.outstandingAmount;

    purchase.updatedBy = getUserName(req.user);

    await purchase.save();

    await writeAuditLog({
      req,
      action: "UPDATE_UNPOSTED_CUSTOMER_PURCHASE",
      module: "Customer Purchases",
      description: `Unposted customer purchase ${purchase.purchaseNumber} updated`,
      targetType: "CustomerPurchase",
      targetId: purchase.purchaseNumber,
      beforeValues,
      afterValues: purchase.toObject(),
      metadata: {
        customerEkonId: purchase.customerEkonId,
        status: purchase.status,
      },
    });

    res.json({
      success: true,
      message: "Customer purchase updated successfully.",
      data: purchase,
    });
  } catch (error) {
    console.error("Customer purchase update error:", error);

    res.status(500).json({
      success: false,
      message: "Could not update customer purchase.",
      error: error.message,
    });
  }
};

const recordCustomerPurchaseTracking = async (req, res) => {
  try {
    const { purchaseNumber } = req.params;

    const {
      trackingNumber,
      carrier = "",
      shipmentDate,
      shippingMethod = "",
      expectedWarehouse = "",
      estimatedArrivalDate,
      trackingNotes = "",
    } = req.body;

    if (!trackingNumber || !String(trackingNumber).trim()) {
      return res.status(400).json({
        success: false,
        message: "Tracking number is required.",
      });
    }

    const purchase = await CustomerPurchase.findOne({
      purchaseNumber,
    });

    if (!purchase) {
      return res.status(404).json({
        success: false,
        message: "Customer purchase not found.",
      });
    }

    if (
      [
        "Invoiced",
        "Partially Recovered",
        "Recovered",
        "Cancelled",
        "Refunded",
        "Reversed",
      ].includes(purchase.status)
    ) {
      return res.status(400).json({
        success: false,
        message: `Tracking cannot be recorded while the purchase status is ${purchase.status}.`,
      });
    }

    const normalizedTrackingNumber = String(
      trackingNumber
    ).trim();

    const duplicateTracking =
      await CustomerPurchase.findOne({
        trackingNumber: normalizedTrackingNumber,
        purchaseNumber: { $ne: purchaseNumber },
        status: {
          $nin: ["Cancelled", "Refunded", "Reversed"],
        },
      });

    if (duplicateTracking) {
      return res.status(400).json({
        success: false,
        message: `Tracking number ${normalizedTrackingNumber} is already linked to purchase ${duplicateTracking.purchaseNumber}.`,
      });
    }

    const beforeValues = purchase.toObject();
    const performedBy = getUserName(req.user);

    purchase.trackingNumber =
      normalizedTrackingNumber;

    purchase.carrier = String(carrier || "").trim();

    purchase.shipmentDate = shipmentDate
      ? new Date(shipmentDate)
      : purchase.shipmentDate;

    purchase.shippingMethod =
      String(shippingMethod || "").trim();

    purchase.expectedWarehouse =
      String(expectedWarehouse || "").trim();

    purchase.estimatedArrivalDate =
      estimatedArrivalDate
        ? new Date(estimatedArrivalDate)
        : null;

    purchase.trackingRecordedAt = new Date();
    purchase.trackingRecordedBy = performedBy;
    purchase.trackingNotes =
      String(trackingNotes || "").trim();

    purchase.lastPackageStatus =
      "Tracking Received";

    purchase.status = "Tracking Received";
    purchase.invoiceReady = false;
    purchase.updatedBy = performedBy;

    await purchase.save();

    let linkedPackage = null;

    linkedPackage = await Package.findOne({
      trackingNumber: normalizedTrackingNumber,
    });

    if (linkedPackage) {
      if (
        linkedPackage.customerEkonId !==
        purchase.customerEkonId
      ) {
        return res.status(400).json({
          success: false,
          message:
            "The matching package belongs to a different customer.",
        });
      }

      purchase.packageId = linkedPackage._id;

      if (linkedPackage.status === "At Warehouse") {
        purchase.status = "At Warehouse";
        purchase.warehouse =
          linkedPackage.warehouseLocation ||
          purchase.expectedWarehouse ||
          "";

        purchase.weight = roundMoney(
          linkedPackage.weight || 0
        );

        purchase.chargeableWeight =
          Number(linkedPackage.weight || 0) > 0
            ? Math.ceil(
                Number(linkedPackage.weight || 0)
              )
            : 0;

        purchase.packageReceivedDate =
          linkedPackage.dateReceived || new Date();
      } else if (
        [
          "Manifest Assigned",
          "In Transit",
          "Cleared Customs",
          "In Transit to Branch",
        ].includes(linkedPackage.status)
      ) {
        purchase.status = "In Transit";
      }

      purchase.lastPackageStatus =
        linkedPackage.status || purchase.status;

      purchase.lastPackageSyncAt = new Date();

      await purchase.save();

      linkedPackage.customerPurchaseId =
        purchase._id;

      linkedPackage.customerPurchaseNumber =
        purchase.purchaseNumber;

      linkedPackage.customerPurchaseLinked = true;

      linkedPackage.customerPurchaseLinkedAt =
        linkedPackage.customerPurchaseLinkedAt ||
        new Date();

      linkedPackage.customerPurchaseLinkedBy =
        linkedPackage.customerPurchaseLinkedBy ||
        performedBy;

      await linkedPackage.save();
    }

    await writeAuditLog({
      req,
      action: "RECORD_CUSTOMER_PURCHASE_TRACKING",
      module: "Customer Purchases",
      description: `Tracking ${purchase.trackingNumber} recorded for customer purchase ${purchase.purchaseNumber}`,
      targetType: "CustomerPurchase",
      targetId: purchase.purchaseNumber,
      beforeValues,
      afterValues: purchase.toObject(),
      metadata: {
        trackingNumber: purchase.trackingNumber,
        carrier: purchase.carrier,
        shipmentDate: purchase.shipmentDate,
        shippingMethod: purchase.shippingMethod,
        expectedWarehouse:
          purchase.expectedWarehouse,
        estimatedArrivalDate:
          purchase.estimatedArrivalDate,
        trackingRecordedBy:
          purchase.trackingRecordedBy,
        linkedPackageId: linkedPackage
          ? String(linkedPackage._id)
          : "",
        resultingStatus: purchase.status,
      },
    });

    res.json({
      success: true,
      message: linkedPackage
        ? "Tracking recorded and matching package linked successfully."
        : "Tracking information recorded successfully.",
      data: purchase,
      package: linkedPackage,
    });
  } catch (error) {
    console.error(
      "Customer purchase tracking error:",
      error
    );

    res.status(500).json({
      success: false,
      message:
        "Could not record customer purchase tracking information.",
      error: error.message,
    });
  }
};

const linkCustomerPurchasePackage = async (req, res) => {
  try {
    const { purchaseNumber } = req.params;
    const {
      packageId = "",
      trackingNumber = "",
    } = req.body;

    if (!packageId && !trackingNumber) {
      return res.status(400).json({
        success: false,
        message:
          "Package ID or tracking number is required.",
      });
    }

    const purchase = await CustomerPurchase.findOne({
      purchaseNumber,
    });

    if (!purchase) {
      return res.status(404).json({
        success: false,
        message: "Customer purchase not found.",
      });
    }

    if (
      ["Cancelled", "Refunded", "Reversed"].includes(
        purchase.status
      )
    ) {
      return res.status(400).json({
        success: false,
        message:
          "This customer purchase cannot be linked to a package.",
      });
    }

    const packageQuery = packageId
      ? { _id: packageId }
      : { trackingNumber };

    const pkg = await Package.findOne(packageQuery);

    if (!pkg) {
      return res.status(404).json({
        success: false,
        message: "Package not found.",
      });
    }

    if (
      pkg.customerEkonId !== purchase.customerEkonId
    ) {
      return res.status(400).json({
        success: false,
        message:
          "The package belongs to a different customer.",
      });
    }

    const beforeValues = purchase.toObject();

    purchase.packageId = pkg._id;
    purchase.trackingNumber = pkg.trackingNumber;
    purchase.warehouse =
      pkg.warehouseLocation || purchase.warehouse || "";
    purchase.weight = roundMoney(pkg.weight || 0);
    purchase.chargeableWeight =
      Number(pkg.weight || 0) > 0
        ? Math.ceil(Number(pkg.weight || 0))
        : 0;

    if (pkg.status === "At Warehouse") {
      purchase.status = "At Warehouse";
      purchase.packageReceivedDate =
        pkg.dateReceived || new Date();
    } else if (
      ["In Transit", "Manifest Assigned"].includes(
        pkg.status
      )
    ) {
      purchase.status = "In Transit";
    }

    purchase.updatedBy = getUserName(req.user);

    await purchase.save();

    await writeAuditLog({
      req,
      action: "LINK_CUSTOMER_PURCHASE_PACKAGE",
      module: "Customer Purchases",
      description: `Package ${pkg.trackingNumber} linked to customer purchase ${purchase.purchaseNumber}`,
      targetType: "CustomerPurchase",
      targetId: purchase.purchaseNumber,
      beforeValues,
      afterValues: purchase.toObject(),
      metadata: {
        packageId: String(pkg._id),
        trackingNumber: pkg.trackingNumber,
        packageStatus: pkg.status,
        weight: pkg.weight,
      },
    });

    res.json({
      success: true,
      message:
        "Package linked to customer purchase successfully.",
      data: purchase,
      package: pkg,
    });
  } catch (error) {
    console.error("Customer purchase package-link error:", error);

    res.status(500).json({
      success: false,
      message:
        "Could not link package to customer purchase.",
      error: error.message,
    });
  }
};

const receiveCustomerPurchase = async (req, res) => {
  const reject = (message, statusCode = 400) => {
    const error = new Error(message);
    error.statusCode = statusCode;
    throw error;
  };

  try {
    const { purchaseNumber } = req.params;

    const {
      trackingNumber = "",
      warehouse = "",
      weight,
      chargeableWeight = 0,
      packageReceivedDate,
    } = req.body || {};

    if (
      typeof trackingNumber !== "string" ||
      typeof warehouse !== "string"
    ) {
      reject("Tracking number and warehouse must be text.");
    }

    const numericWeight = roundMoney(weight);

    if (
      !Number.isFinite(Number(weight)) ||
      !Number.isFinite(numericWeight) ||
      numericWeight <= 0
    ) {
      reject(
        "Actual warehouse weight must be a finite amount greater than zero."
      );
    }

    const suppliedChargeable = Number(chargeableWeight);

    if (
      !Number.isFinite(suppliedChargeable) ||
      suppliedChargeable < 0
    ) {
      reject(
        "Chargeable weight must be a finite, nonnegative number."
      );
    }

    const billedWeight =
      suppliedChargeable > 0
        ? roundMoney(suppliedChargeable)
        : Math.ceil(numericWeight);

    if (
      !Number.isFinite(billedWeight) ||
      billedWeight < numericWeight
    ) {
      reject(
        "Chargeable weight cannot be lower than the actual warehouse weight."
      );
    }

    let receivedDate = new Date();

    if (packageReceivedDate) {
      if (typeof packageReceivedDate !== "string") {
        reject("Arrival date must be a valid date.");
      }

      const dateOnly =
        /^\d{4}-\d{2}-\d{2}$/.test(packageReceivedDate);

      const check = new Date(
        dateOnly
          ? `${packageReceivedDate}T00:00:00.000Z`
          : packageReceivedDate
      );

      if (
        !Number.isFinite(check.getTime()) ||
        (dateOnly &&
          check.toISOString().slice(0, 10) !==
            packageReceivedDate)
      ) {
        reject("Arrival date must be a valid date.");
      }

      receivedDate = dateOnly
        ? new Date(`${packageReceivedDate}T12:00:00-05:00`)
        : check;
    }

    const result = await mongoose.connection.transaction(
      async (session) => {
        const purchase = await CustomerPurchase.findOne({
          purchaseNumber,
        }).session(session);

        if (!purchase) {
          reject("Customer purchase not found.", 404);
        }

        const allowedStatuses = [
          "Purchased",
          "Tracking Received",
          "In Transit",
          "At Warehouse",
          "Recovery Calculated",
          "Ready to Invoice",
        ];

        if (
          !allowedStatuses.includes(purchase.status) ||
          !purchase.journalEntryNumber ||
          purchase.invoiceNumber ||
          purchase.invoiceJournalEntryNumber ||
          purchase.invoicedAt ||
          purchase.invoiceHistory?.length ||
          purchase.paymentAllocations?.length ||
          Number(purchase.recoveredAmount || 0) > 0
        ) {
          reject(
            "Only a posted, uninvoiced purchase can have warehouse arrival recorded here. Invoiced, recovered or closed purchases require separate review.",
            409
          );
        }

        const tracking =
          trackingNumber.trim() ||
          String(purchase.trackingNumber || "").trim();

        if (!tracking) {
          reject(
            "Record the shipment tracking number before recording warehouse arrival."
          );
        }

        const previouslyLinked = Boolean(purchase.packageId);
        let pkg = null;

        if (purchase.packageId) {
          pkg = await Package.findById(
            purchase.packageId
          ).session(session);

          if (!pkg) {
            reject(
              "The linked package no longer exists. Review the package link first.",
              409
            );
          }

          if (
            pkg.customerEkonId !== purchase.customerEkonId
          ) {
            reject(
              "The linked package belongs to another customer.",
              409
            );
          }

          if (pkg.trackingNumber !== tracking) {
            reject(
              "The tracking number differs from the linked package. Review the tracking link first.",
              409
            );
          }
        }

        const trackedPackage = await Package.findOne({
          trackingNumber: tracking,
        }).session(session);

        if (trackedPackage) {
          if (
            trackedPackage.customerEkonId !==
            purchase.customerEkonId
          ) {
            reject(
              "Tracking number belongs to a different customer.",
              409
            );
          }

          if (
            pkg &&
            String(pkg._id) !== String(trackedPackage._id)
          ) {
            reject(
              "The package ID and tracking number identify different packages.",
              409
            );
          }

          pkg = trackedPackage;
        }

        if (
          pkg &&
          (
            pkg.invoiceNumber ||
            ["Paid", "Invoiced"].includes(pkg.invoiceStatus) ||
            [
              "delivered",
              "collected",
              "released",
              "cancelled",
              "returned",
              "refunded",
            ].includes(
              String(pkg.status || "").toLowerCase()
            )
          )
        ) {
          reject(
            "The linked package is already invoiced or closed. Its warehouse status cannot be reset here.",
            409
          );
        }

        const location =
          warehouse.trim() ||
          String(purchase.warehouse || "").trim() ||
          String(pkg?.warehouseLocation || "").trim();

        if (!location) {
          reject("Warehouse location is required.");
        }

        const beforeValues = purchase.toObject();

        purchase.trackingNumber = tracking;
        purchase.warehouse = location;
        purchase.weight = numericWeight;
        purchase.chargeableWeight = billedWeight;
        purchase.packageReceivedDate = receivedDate;
        purchase.status = "At Warehouse";
        purchase.lastPackageStatus = "At Warehouse";
        purchase.lastPackageSyncAt = new Date();
        purchase.invoiceReady = false;
        purchase.updatedBy = getUserName(req.user);

        if (pkg) {
          purchase.packageId = pkg._id;

          pkg.weight = numericWeight;
          pkg.warehouseLocation = location;
          pkg.status = "At Warehouse";
          pkg.dateReceived = receivedDate;
          pkg.statusUpdatedAt = new Date();

          // Preserve the existing update method for each link path.
          if (previouslyLinked) {
            await Package.findByIdAndUpdate(
              pkg._id,
              {
                $set: {
                  weight: numericWeight,
                  warehouseLocation: location,
                  status: "At Warehouse",
                  dateReceived: receivedDate,
                  statusUpdatedAt: pkg.statusUpdatedAt,
                },
              },
              {
                session,
                runValidators: true,
              }
            );
          } else {
            await pkg.save({ session });
          }
        }

        await purchase.save({ session });

        return {
          purchase,
          beforeValues,
        };
      }
    );

    const { purchase, beforeValues } = result;

    try {
      await writeAuditLog({
        req,
        action: "RECEIVE_CUSTOMER_PURCHASE",
        module: "Customer Purchases",

        description:
          `Customer purchase ${purchase.purchaseNumber} ` +
          "marked received at warehouse",

        targetType: "CustomerPurchase",
        targetId: purchase.purchaseNumber,
        beforeValues,
        afterValues: purchase.toObject(),

        metadata: {
          trackingNumber: purchase.trackingNumber,
          warehouse: purchase.warehouse,
          weight: purchase.weight,
          chargeableWeight: purchase.chargeableWeight,
          packageReceivedDate: purchase.packageReceivedDate,
        },
      });
    } catch (auditError) {
      console.error(
        "Operational audit log failed after warehouse receipt commit:",
        auditError
      );
    }

    return res.json({
      success: true,
      message:
        "Customer purchase warehouse arrival recorded successfully.",
      data: purchase,
    });
  } catch (error) {
    console.error("Customer purchase receipt error:", error);

    const status =
      error.code === 11000
        ? 409
        : [400, 403, 404, 409].includes(error.statusCode)
        ? error.statusCode
        : ["ValidationError", "CastError"].includes(error.name)
        ? 400
        : 500;

    return res.status(status).json({
      success: false,

      message:
        status === 500
          ? "Could not confirm warehouse arrival. Check the purchase and package before retrying."
          : error.code === 11000
          ? "A conflicting tracking or package record exists. Review the link before retrying."
          : error.message,
    });
  }
};

const prepareCustomerPurchaseRecovery = async (req, res) => {
  try {
    const { purchaseNumber } = req.params;
    const {
      itemRecoveryAmount,
      shoppingAssistanceFee = 0,
      weightCharge = 0,
      shippingCharge = 0,
      customsDuty = 0,
      deliveryFee = 0,
      otherCharges = 0,
      notes = "",
    } = req.body;

    const purchase = await CustomerPurchase.findOne({
      purchaseNumber,
    });

    if (!purchase) {
      return res.status(404).json({
        success: false,
        message: "Customer purchase not found.",
      });
    }

    if (
      ["Cancelled", "Refunded", "Reversed"].includes(
        purchase.status
      )
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Recovery cannot be prepared for this purchase.",
      });
    }

        if (
      purchase.status !== "At Warehouse" &&
      purchase.status !== "Recovery Calculated"
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Recovery charges can only be calculated after the package reaches the warehouse.",
      });
    }

    if (
      Number(purchase.weight || 0) <= 0 ||
      Number(purchase.chargeableWeight || 0) <= 0
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Warehouse weight and chargeable weight must be recorded before recovery calculation.",
      });
    }

    if (purchase.invoiceNumber) {
      return res.status(400).json({
        success: false,
        message:
          "This purchase is already linked to an invoice.",
      });
    }

    const beforeValues = purchase.toObject();

        const nextItemRecovery = Number(
      itemRecoveryAmount !== undefined
        ? itemRecoveryAmount
        : purchase.itemRecoveryAmount
    );

    const remainingGoodsCost = roundMoney(
      Number(purchase.baseCurrencyAmount || 0) -
        Number(purchase.refundedAmount || 0)
    );

    if (
      !Number.isFinite(nextItemRecovery) ||
      nextItemRecovery < 0 ||
      (
        Number(purchase.refundedAmount || 0) > 0 &&
        roundMoney(nextItemRecovery) > remainingGoodsCost
      )
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Recoverable goods cannot include an amount already refunded by the merchant.",
      });
    }

    purchase.itemRecoveryAmount = roundMoney(
      nextItemRecovery
    );

    purchase.shoppingAssistanceFee = roundMoney(
      shoppingAssistanceFee
    );
    purchase.weightCharge = roundMoney(weightCharge);
    purchase.shippingCharge =
      roundMoney(shippingCharge);
    purchase.customsDuty = roundMoney(customsDuty);
    purchase.deliveryFee = roundMoney(deliveryFee);
    purchase.otherCharges = roundMoney(otherCharges);

    const recoveryTotals = calculateRecoveryTotals({
      itemRecoveryAmount:
        purchase.itemRecoveryAmount,
      shoppingAssistanceFee:
        purchase.shoppingAssistanceFee,
      weightCharge: purchase.weightCharge,
      shippingCharge: purchase.shippingCharge,
      customsDuty: purchase.customsDuty,
      deliveryFee: purchase.deliveryFee,
      otherCharges: purchase.otherCharges,
      recoveredAmount: purchase.recoveredAmount,
    });

    purchase.totalCustomerCharge =
      recoveryTotals.totalCustomerCharge;
    purchase.outstandingAmount =
      recoveryTotals.outstandingAmount;
        purchase.recoveryStatus = "Not Invoiced";

    purchase.status = "Recovery Calculated";
    purchase.invoiceReady = true;
    purchase.updatedBy = getUserName(req.user);

    await purchase.save();

    purchase.status = "Ready to Invoice";

    if (notes) {
      purchase.notes = [purchase.notes, notes]
        .filter(Boolean)
        .join("\n");
    }

    await purchase.save();

    await writeAuditLog({
      req,
      action: "PREPARE_CUSTOMER_PURCHASE_RECOVERY",
      module: "Customer Purchases",
      description: `Recovery charges prepared for customer purchase ${purchase.purchaseNumber}`,
      targetType: "CustomerPurchase",
      targetId: purchase.purchaseNumber,
      beforeValues,
      afterValues: purchase.toObject(),
      metadata: {
        itemRecoveryAmount:
          purchase.itemRecoveryAmount,
        shoppingAssistanceFee:
          purchase.shoppingAssistanceFee,
        weightCharge: purchase.weightCharge,
        shippingCharge: purchase.shippingCharge,
        customsDuty: purchase.customsDuty,
        deliveryFee: purchase.deliveryFee,
        otherCharges: purchase.otherCharges,
        totalCustomerCharge:
          purchase.totalCustomerCharge,
        outstandingAmount:
          purchase.outstandingAmount,
      },
    });

    res.json({
      success: true,
      message:
        "Customer purchase recovery data prepared successfully.",
      data: purchase,
      invoiceReadyData: {
        purchaseNumber: purchase.purchaseNumber,
        customerEkonId: purchase.customerEkonId,
        customerName: purchase.customerName,
        trackingNumber: purchase.trackingNumber,
        itemRecoveryAmount:
          purchase.itemRecoveryAmount,
        shoppingAssistanceFee:
          purchase.shoppingAssistanceFee,
        weightCharge: purchase.weightCharge,
        shippingCharge: purchase.shippingCharge,
        customsDuty: purchase.customsDuty,
        deliveryFee: purchase.deliveryFee,
        otherCharges: purchase.otherCharges,
        totalCustomerCharge:
          purchase.totalCustomerCharge,
      },
    });
  } catch (error) {
    console.error("Customer purchase recovery error:", error);

    res.status(500).json({
      success: false,
      message:
        "Could not prepare customer purchase recovery.",
      error: error.message,
    });
  }
};

const refundCustomerPurchaseRecord = async (req, res) => {
  try {
    const result = await recordMerchantRefund({
      purchaseNumber: req.params.purchaseNumber,
      body: req.body || {},
      req,
    });

    res.json({
      success: true,
      message: result.replayed
        ? "This merchant refund was already recorded."
        : "Merchant refund recorded successfully.",
      data: result.refund,
      replayed: result.replayed,
    });
  } catch (error) {
    console.error("Merchant refund error:", error);

    res.status(error.statusCode || 500).json({
      success: false,
      message: error.statusCode
        ? error.message
        : "Could not confirm the merchant refund. Check refund history before retrying.",
    });
  }
};

const getCustomerPurchaseRefunds = async (req, res) => {
  try {
    const records = await CustomerPurchaseRefund.find({
      purchaseNumber: req.params.purchaseNumber,
    })
      .select("-requestHash")
      .sort({ createdAt: -1, _id: -1 });

    res.json({
      success: true,
      data: records,
    });
  } catch (error) {
    console.error("Purchase refund history error:", error);

    res.status(500).json({
      success: false,
      message:
        "Could not load merchant refunds and customer credits.",
    });
  }
};

const payCustomerPurchaseCredit = async (req, res) => {
  try {
    const result = await payPurchaseCredit({
      purchaseNumber: req.params.purchaseNumber,
      refundNumber: req.params.refundNumber,
      body: req.body || {},
      req,
    });

    res.json({
      success: true,
      message: result.replayed
        ? "This customer payout was already recorded."
        : "Customer credit payout recorded successfully.",
      data: result.refund,
      replayed: result.replayed,
    });
  } catch (error) {
    console.error("Customer credit payout error:", error);

    res.status(error.statusCode || 500).json({
      success: false,
      message: error.statusCode
        ? error.message
        : "Could not confirm the customer payout. Check refund history before retrying.",
    });
  }
};

module.exports = {
  getCustomerPurchases,
  getCustomerPurchaseByNumber,
  getCustomerPurchaseDashboard,
  createCustomerPurchase,
  updateUnpostedCustomerPurchase,
  recordCustomerPurchaseTracking,
  linkCustomerPurchasePackage,
  receiveCustomerPurchase,
  prepareCustomerPurchaseRecovery,
  refundCustomerPurchaseRecord,
  getCustomerPurchaseRefunds,
  payCustomerPurchaseCredit,
};