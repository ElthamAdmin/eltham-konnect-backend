const CustomerPurchase = require("../models/CustomerPurchase");
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
    } = req.body;

    if (
      !customerEkonId ||
      !purchaseDate ||
      !merchant ||
      !purchaseAmount ||
      !paymentAccountNumber
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Customer, purchase date, merchant, purchase amount, and payment account are required.",
      });
    }

    const numericPurchaseAmount = roundMoney(purchaseAmount);
    const numericExchangeRate = roundMoney(exchangeRate || 1);

    if (numericPurchaseAmount <= 0) {
      return res.status(400).json({
        success: false,
        message: "Purchase amount must be greater than zero.",
      });
    }

    if (numericExchangeRate <= 0) {
      return res.status(400).json({
        success: false,
        message: "Exchange rate must be greater than zero.",
      });
    }

    const [customer, paymentAccount] = await Promise.all([
      Customer.findOne({
        ekonId: customerEkonId,
        status: { $ne: "Deleted" },
      }),
      FinancialAccount.findOne({
        accountNumber: paymentAccountNumber,
        status: "Active",
      }),
    ]);

    if (!customer) {
      return res.status(404).json({
        success: false,
        message: "Active customer not found.",
      });
    }

    if (!paymentAccount) {
      return res.status(404).json({
        success: false,
        message: "Active payment account not found.",
      });
    }

    if (!paymentAccount.linkedChartAccountCode) {
      return res.status(400).json({
        success: false,
        message:
          "The selected payment account is not linked to the Chart of Accounts.",
      });
    }

    const normalizedOrderNumber = String(orderNumber || "").trim();

    if (normalizedOrderNumber) {
      const duplicateOrder = await CustomerPurchase.findOne({
        merchant: {
          $regex: `^${escapeRegex(String(merchant).trim())}$`,
          $options: "i",
        },
        orderNumber: normalizedOrderNumber,
        status: { $nin: ["Cancelled", "Reversed"] },
      });

      if (duplicateOrder) {
        return res.status(400).json({
          success: false,
          message: `A customer purchase already exists for merchant ${merchant} and order ${normalizedOrderNumber}.`,
          purchaseNumber: duplicateOrder.purchaseNumber,
        });
      }
    }

    const baseCurrencyAmount = calculateBaseCurrencyAmount({
      purchaseAmount: numericPurchaseAmount,
      purchaseCurrency,
      exchangeRate: numericExchangeRate,
    });

    const purchaseNumber = generatePurchaseNumber();
    const performedBy = getUserName(req.user);

    const preparedItems = Array.isArray(items)
      ? items
          .map((item) => {
            const quantity = Math.max(1, Number(item.quantity || 1));
            const unitPrice = roundMoney(item.unitPrice);
            const totalAmount = roundMoney(
              item.totalAmount || quantity * unitPrice
            );

            return {
              itemName: String(item.itemName || "").trim(),
              description: String(item.description || "").trim(),
              quantity,
              unitPrice,
              totalAmount,
              size: String(item.size || "").trim(),
              colour: String(item.colour || "").trim(),
              productUrl: String(item.productUrl || "").trim(),
            };
          })
          .filter((item) => item.itemName)
      : [];

    const purchase = await CustomerPurchase.create({
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
      merchant: String(merchant).trim(),
      website: String(website || "").trim(),
      orderNumber: normalizedOrderNumber,
      items: preparedItems,
      purchaseCurrency: String(purchaseCurrency || "USD").toUpperCase(),
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
    });

    try {
      const journalEntry = await postCustomerPurchase({
        purchase,
        paymentAccount,
        user: req.user,
      });

      purchase.journalEntryNumber = journalEntry.entryNumber;
      purchase.status = "Purchased";
      purchase.updatedBy = performedBy;

      await purchase.save();

      const accountTransaction = await AccountTransaction.create({
        transactionNumber: generateTransactionNumber(),
        accountNumber: paymentAccount.accountNumber,
        accountName: paymentAccount.accountName,
        linkedChartAccountCode:
          paymentAccount.linkedChartAccountCode,
        journalEntryNumber: journalEntry.entryNumber,
        ledgerReference: journalEntry.entryNumber,
        transactionType: "Customer Purchase",
        amount: baseCurrencyAmount,
        paymentMethod:
          paymentAccount.accountType === "Credit Card"
            ? "Business Credit Card"
            : paymentAccount.accountType,
        reference: purchase.purchaseNumber,
        notes: `${purchase.customerName} purchase from ${purchase.merchant}`,
        transactionDate: new Date(purchase.purchaseDate),
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
      });

      purchase.accountTransactionNumber =
        accountTransaction.transactionNumber;

      await purchase.save();

      customer.lastActivityDate = getJamaicaDateString();
      await customer.save();

      await writeFinanceAuditLog({
        req,
        action: "CUSTOMER_PURCHASE_POSTED",
        description: `Customer purchase ${purchase.purchaseNumber} posted for ${purchase.customerName}`,
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

      await writeAuditLog({
        req,
        action: "CREATE_CUSTOMER_PURCHASE",
        module: "Customer Purchases",
        description: `Customer purchase ${purchase.purchaseNumber} created for ${purchase.customerName}`,
        targetType: "CustomerPurchase",
        targetId: purchase.purchaseNumber,
        financeReference: purchase.purchaseNumber,
        journalEntryNumber: journalEntry.entryNumber,
        accountNumber: paymentAccount.accountNumber,
        accountName: paymentAccount.accountName,
        metadata: {
          customerEkonId: purchase.customerEkonId,
          merchant: purchase.merchant,
          orderNumber: purchase.orderNumber,
          baseCurrencyAmount: purchase.baseCurrencyAmount,
          accountTransactionNumber:
            purchase.accountTransactionNumber,
          status: purchase.status,
        },
      });

      return res.status(201).json({
        success: true,
        message:
          "Customer purchase created and posted successfully.",
        data: purchase,
        journalEntryNumber: journalEntry.entryNumber,
        accountTransactionNumber:
          accountTransaction.transactionNumber,
      });
    } catch (postingError) {
      purchase.status = "Pending Purchase";
      purchase.notes = [
        purchase.notes,
        `Posting failed: ${postingError.message}`,
      ]
        .filter(Boolean)
        .join("\n");

      await purchase.save();

      return res.status(500).json({
        success: false,
        message:
          "Customer purchase was saved but could not be posted to accounting.",
        error: postingError.message,
        purchaseNumber: purchase.purchaseNumber,
      });
    }
  } catch (error) {
    console.error("Customer purchase creation error:", error);

    res.status(500).json({
      success: false,
      message: "Could not create customer purchase.",
      error: error.message,
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
  try {
    const { purchaseNumber } = req.params;
    const {
      trackingNumber = "",
      warehouse = "",
      weight = 0,
      chargeableWeight = 0,
      packageReceivedDate,
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
      !trackingNumber &&
      !purchase.trackingNumber
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Record the shipment tracking number before recording warehouse arrival.",
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
          "This customer purchase cannot be marked as received.",
      });
    }

        const numericWeight = roundMoney(weight);

    if (numericWeight <= 0) {
      return res.status(400).json({
        success: false,
        message:
          "Actual warehouse weight must be greater than zero.",
      });
    }

    if (!warehouse && !purchase.warehouse) {
      return res.status(400).json({
        success: false,
        message: "Warehouse location is required.",
      });
    }
    const billedWeight =
      Number(chargeableWeight || 0) > 0
        ? roundMoney(chargeableWeight)
        : numericWeight > 0
        ? Math.ceil(numericWeight)
        : 0;

    const beforeValues = purchase.toObject();

    if (trackingNumber) {
      purchase.trackingNumber = trackingNumber;
    }

    purchase.warehouse =
      warehouse || purchase.warehouse || "";
    purchase.weight = numericWeight;
    purchase.chargeableWeight = billedWeight;
    purchase.packageReceivedDate =
      packageReceivedDate
        ? new Date(packageReceivedDate)
        : new Date();
        purchase.status = "At Warehouse";
    purchase.lastPackageStatus = "At Warehouse";
    purchase.lastPackageSyncAt = new Date();
    purchase.invoiceReady = false;
    purchase.updatedBy = getUserName(req.user);

    await purchase.save();

    if (purchase.packageId) {
      await Package.findByIdAndUpdate(
        purchase.packageId,
        {
          $set: {
            trackingNumber:
              purchase.trackingNumber || undefined,
            weight: numericWeight,
            warehouseLocation: purchase.warehouse,
            status: "At Warehouse",
            dateReceived:
              purchase.packageReceivedDate,
            statusUpdatedAt: new Date(),
          },
        },
        {
          runValidators: true,
        }
      );
    } else if (purchase.trackingNumber) {
      const linkedPackage = await Package.findOne({
        trackingNumber: purchase.trackingNumber,
      });

      if (linkedPackage) {
        if (
          linkedPackage.customerEkonId !==
          purchase.customerEkonId
        ) {
          return res.status(400).json({
            success: false,
            message:
              "Tracking number belongs to a different customer.",
          });
        }

        linkedPackage.weight = numericWeight;
        linkedPackage.warehouseLocation =
          purchase.warehouse;
        linkedPackage.status = "At Warehouse";
        linkedPackage.dateReceived =
          purchase.packageReceivedDate;
        linkedPackage.statusUpdatedAt = new Date();

        await linkedPackage.save();

        purchase.packageId = linkedPackage._id;
        await purchase.save();
      }
    }

    await writeAuditLog({
      req,
      action: "RECEIVE_CUSTOMER_PURCHASE",
      module: "Customer Purchases",
      description: `Customer purchase ${purchase.purchaseNumber} marked received at warehouse`,
      targetType: "CustomerPurchase",
      targetId: purchase.purchaseNumber,
      beforeValues,
      afterValues: purchase.toObject(),
      metadata: {
        trackingNumber: purchase.trackingNumber,
        warehouse: purchase.warehouse,
        weight: purchase.weight,
        chargeableWeight:
          purchase.chargeableWeight,
        packageReceivedDate:
          purchase.packageReceivedDate,
      },
    });

    res.json({
      success: true,
      message:
        "Customer purchase warehouse arrival recorded successfully.",
      data: purchase,
    });
  } catch (error) {
    console.error("Customer purchase receipt error:", error);

    res.status(500).json({
      success: false,
      message:
        "Could not record customer purchase arrival.",
      error: error.message,
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

    purchase.itemRecoveryAmount = roundMoney(
      itemRecoveryAmount !== undefined
        ? itemRecoveryAmount
        : purchase.baseCurrencyAmount
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
    const { purchaseNumber } = req.params;
    const {
      refundAmount,
      refundDate,
      notes = "",
    } = req.body;

    const numericRefundAmount = roundMoney(refundAmount);

    if (numericRefundAmount <= 0) {
      return res.status(400).json({
        success: false,
        message:
          "Refund amount must be greater than zero.",
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

    if (!purchase.journalEntryNumber) {
      return res.status(400).json({
        success: false,
        message:
          "An unposted purchase does not require an accounting refund.",
      });
    }

    if (
      ["Cancelled", "Reversed"].includes(purchase.status)
    ) {
      return res.status(400).json({
        success: false,
        message:
          "This purchase cannot be refunded.",
      });
    }

    const remainingRefundable = roundMoney(
      Number(purchase.baseCurrencyAmount || 0) -
        Number(purchase.refundedAmount || 0)
    );

    if (numericRefundAmount > remainingRefundable) {
      return res.status(400).json({
        success: false,
        message:
          "Refund amount exceeds the remaining refundable purchase amount.",
      });
    }

    const paymentAccount =
      await FinancialAccount.findOne({
        accountNumber:
          purchase.paymentAccountNumber,
        status: "Active",
      });

    if (!paymentAccount) {
      return res.status(404).json({
        success: false,
        message:
          "Original payment account was not found.",
      });
    }

    const beforeValues = purchase.toObject();

    const journalEntry = await refundCustomerPurchase({
      purchase,
      paymentAccount,
      refundAmount: numericRefundAmount,
      refundDate:
        refundDate || getJamaicaDateString(),
      user: req.user,
    });

    const accountTransaction =
      await AccountTransaction.create({
        transactionNumber:
          generateTransactionNumber(),
        accountNumber:
          paymentAccount.accountNumber,
        accountName: paymentAccount.accountName,
        linkedChartAccountCode:
          paymentAccount.linkedChartAccountCode,
        journalEntryNumber:
          journalEntry.entryNumber,
        ledgerReference: journalEntry.entryNumber,
        transactionType: "Customer Purchase Refund",
        amount: numericRefundAmount,
        paymentMethod:
          paymentAccount.accountType === "Credit Card"
            ? "Credit Card Refund"
            : `${paymentAccount.accountType} Refund`,
        reference: purchase.purchaseNumber,
        notes:
          notes ||
          `Refund received from ${purchase.merchant}`,
        transactionDate: new Date(
          refundDate || new Date()
        ),
        customerPurchaseNumber:
          purchase.purchaseNumber,
        customerEkonId:
          purchase.customerEkonId,
        customerName: purchase.customerName,
        merchant: purchase.merchant,
        transactionCurrency:
          purchase.baseCurrency,
        exchangeRate: purchase.exchangeRate,
      });

    purchase.refundedAmount = roundMoney(
      Number(purchase.refundedAmount || 0) +
        numericRefundAmount
    );

    purchase.refundJournalEntryNumber =
      journalEntry.entryNumber;

    purchase.itemRecoveryAmount = Math.max(
      0,
      roundMoney(
        Number(purchase.itemRecoveryAmount || 0) -
          numericRefundAmount
      )
    );

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

    if (
      purchase.refundedAmount >=
      purchase.baseCurrencyAmount
    ) {
      purchase.status = "Refunded";
      purchase.recoveryStatus = "Refunded";
      purchase.outstandingAmount = 0;
    }

    purchase.updatedBy = getUserName(req.user);

    if (notes) {
      purchase.notes = [purchase.notes, notes]
        .filter(Boolean)
        .join("\n");
    }

    await purchase.save();

    await writeFinanceAuditLog({
      req,
      action: "CUSTOMER_PURCHASE_REFUNDED",
      description: `Refund posted for customer purchase ${purchase.purchaseNumber}`,
      targetType: "CustomerPurchase",
      targetId: purchase.purchaseNumber,
      postingDate:
        refundDate || getJamaicaDateString(),
      journalEntry,
      accountNumber:
        paymentAccount.accountNumber,
      accountName: paymentAccount.accountName,
      performedByName: getUserName(req.user),
      beforeValues,
      afterValues: purchase.toObject(),
      metadata: {
        refundAmount: numericRefundAmount,
        totalRefunded: purchase.refundedAmount,
        accountTransactionNumber:
          accountTransaction.transactionNumber,
        recoveryStatus:
          purchase.recoveryStatus,
      },
    });

    res.json({
      success: true,
      message:
        "Customer purchase refund posted successfully.",
      data: purchase,
      journalEntryNumber:
        journalEntry.entryNumber,
      accountTransactionNumber:
        accountTransaction.transactionNumber,
    });
  } catch (error) {
    console.error("Customer purchase refund error:", error);

    res.status(500).json({
      success: false,
      message:
        "Could not post customer purchase refund.",
      error: error.message,
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
};