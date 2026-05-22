const Package = require("../models/Package");
const Customer = require("../models/Customer");
const FreightPartner = require("../models/FreightPartner");
const PointsHistory = require("../models/PointsHistory");
const CustomerNotification = require("../models/CustomerNotification");
const IntegrationLog = require("../models/IntegrationLog");
const UnmatchedPackage = require("../models/UnmatchedPackage");
const { completeReferral } = require("./referralController");
const { writeAuditLog } = require("../utils/auditLogger");

const getJamaicaDateString = (date = new Date()) => {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Jamaica",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  return formatter.format(date);
};

const createIntegrationLog = async ({
  source = "Freight Partner",
  eventType = "PACKAGE_ARRIVAL",
  status = "Success",
  trackingNumber = "",
  customerEkonId = "",
  message = "",
  payload = {},
  errorDetails = "",
}) => {
  await IntegrationLog.create({
    logNumber: `INT-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
    source,
    eventType,
    status,
    trackingNumber,
    customerEkonId,
    message,
    payload,
    errorDetails,
  });
};

const createUnmatchedPackage = async ({
  trackingNumber = "",
  customerEkonId = "",
  customerName = "",
  courier = "",
  weight = 0,
  warehouseLocation = "",
  dateReceived = null,
  externalPackageId = "",
  externalWarehouseId = "",
  externalStatus = "",
  integrationSource = "Freight Partner",
  issueReason = "",
  rawPayload = {},
}) => {
  return await UnmatchedPackage.create({
    unmatchedNumber: `UNM-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
    trackingNumber,
    customerEkonId,
    customerName,
    courier,
    weight: Number(weight || 0),
    warehouseLocation,
    dateReceived: dateReceived || new Date(),
    externalPackageId,
    externalWarehouseId,
    externalStatus,
    integrationSource,
    issueReason,
    status: "Pending Review",
    rawPayload,
  });
};

const awardWarehousePointsIfEligible = async (customer, pkg, req) => {
  if (!customer || !pkg) return 0;
  if (pkg.status !== "At Warehouse") return 0;

  const oldPoints = Number(customer.pointsBalance || 0);
  const newPoints = Math.min(oldPoints + 100, 1500);
  const pointsAwarded = newPoints - oldPoints;

  if (pointsAwarded > 0) {
    customer.pointsBalance = newPoints;
    customer.lastActivityDate = getJamaicaDateString();
    await customer.save();

    await PointsHistory.create({
      customerEkonId: customer.ekonId,
      customerName: customer.name,
      action: `Package ${pkg.trackingNumber} marked At Warehouse by freight integration`,
      points: pointsAwarded,
      date: getJamaicaDateString(),
    });

    await writeAuditLog({
      req,
      action: "AWARD_POINTS_INTEGRATION",
      module: "Points History",
      description: `${pointsAwarded} EK points awarded to ${customer.name} (${customer.ekonId}) from freight integration package ${pkg.trackingNumber}`,
      targetType: "Customer",
      targetId: customer.ekonId,
      metadata: {
        trackingNumber: pkg.trackingNumber,
        pointsAwarded,
        newPointsBalance: customer.pointsBalance,
        integrationSource: pkg.integrationSource,
      },
    });
  }

  return pointsAwarded;
};

const fetchLtwPackagesPage = async ({ page = 1, limit = 25 }) => {
  const baseUrl = process.env.LTW_API_BASE_URL;
  const apiUrlSlug = process.env.LTW_API_URL_SLUG;
  const apiToken = process.env.LTW_API_TOKEN;

  if (!baseUrl || !apiUrlSlug || !apiToken) {
    throw new Error("LTW API credentials are missing from environment variables.");
  }

  const url = `${baseUrl}/api/v1/shipments/${apiUrlSlug}/package?page=${page}&limit=${limit}&search=`;

  const response = await fetch(url, {
    method: "GET",
    headers: {
      "x-api": apiToken,
      "Content-Type": "application/json",
    },
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data?.message || "LTW API request failed.");
  }

  return data;
};

const syncLtwPackages = async (req, res) => {
  try {
    const page = Math.max(1, Number(req.query.page || 1));
    const limit = Math.min(100, Math.max(1, Number(req.query.limit || 25)));

    const ltwData = await fetchLtwPackagesPage({ page, limit });
    const ltwPackages = ltwData.packages || [];

    let importedCount = 0;
    let duplicateCount = 0;
    let unmatchedCount = 0;
    let failedCount = 0;

    const results = [];

    for (const ltwPkg of ltwPackages) {
      try {
        const trackingNumber = String(ltwPkg.tracking_number || "").trim();
        const customerEkonId = String(ltwPkg.airWayBill || "").trim().toUpperCase();
        const customerName = String(ltwPkg.consignee || "").trim();
        const weight = Number(ltwPkg.weight || 0);
        const courier = ltwPkg.description || "LTW";
        const warehouseLocation = "LTW Warehouse";
        const externalPackageId = ltwPkg.id || "";
        const externalWarehouseId = ltwPkg.shipper_id || "";
        const externalStatus = ltwPkg.current_status_id || "";
        const dateReceived = ltwPkg.created_at || new Date();

        if (!trackingNumber) {
          failedCount += 1;
          results.push({
            status: "Failed",
            reason: "Missing tracking number",
            ltwPackageId: externalPackageId,
          });
          continue;
        }

        const existingPackage = await Package.findOne({ trackingNumber });

        if (existingPackage) {
          duplicateCount += 1;
          results.push({
            trackingNumber,
            status: "Duplicate",
            message: "Package already exists in EKOS.",
          });
          continue;
        }

        const existingUnmatched = await UnmatchedPackage.findOne({
          trackingNumber,
          status: "Pending Review",
        });

        if (existingUnmatched) {
          duplicateCount += 1;
          results.push({
            trackingNumber,
            status: "Duplicate Unmatched",
            message: "Package already exists in unmatched review queue.",
          });
          continue;
        }

        let customer = customerEkonId
  ? await Customer.findOne({ ekonId: customerEkonId })
  : null;

let customerMatchMethod = customer ? "EKON ID" : "";

if (!customer && customerName) {
  customer = await Customer.findOne({
    name: { $regex: `^${customerName.trim()}$`, $options: "i" },
  });

  if (customer) {
    customerMatchMethod = "LTW consignee name";
  }
}

        if (!customer) {
          await UnmatchedPackage.create({
            unmatchedNumber: `UNM-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
            trackingNumber,
            customerEkonId,
            customerName,
            courier,
            weight,
            warehouseLocation,
            dateReceived,
            externalPackageId,
            externalWarehouseId,
            externalStatus,
            integrationSource: "LTW API",
            issueReason: customerEkonId
              ? `Customer not found for EKON ID ${customerEkonId}.`
              : "Missing customer EKON ID from LTW airWayBill.",
            status: "Pending Review",
            rawPayload: ltwPkg,
          });

          unmatchedCount += 1;

          await createIntegrationLog({
            source: "LTW API",
            status: "Failed",
            trackingNumber,
            customerEkonId,
            message: "LTW package saved to unmatched review queue.",
            payload: ltwPkg,
            errorDetails: customerEkonId
              ? `Customer not found for EKON ID ${customerEkonId}.`
              : "Missing customer EKON ID from LTW airWayBill.",
          });

          results.push({
            trackingNumber,
            status: "Unmatched",
            customerEkonId,
          });

          continue;
        }

        const now = new Date();

        const newPackage = await Package.create({
          trackingNumber,
          customerEkonId: customer.ekonId,
          customerName: customer.name,
          courier,
          weight,
          status: "At Warehouse",
          warehouseLocation,
          invoiceStatus: "Pending",
          readyForPickup: false,
          readyForPickupDate: null,
          statusUpdatedAt: now,
          dateReceived,

          integrationSource: "LTW API",
          externalWarehouseId,
          externalPackageId,
          externalStatus,
          lastExternalSyncAt: now,
          syncNotes: `Created from LTW API sync. Matched by ${customerMatchMethod || "unknown method"}. LTW airWayBill: ${customerEkonId || "N/A"}.`,

          addedByUserId: "LTW-API-SYNC",
          addedByName: "LTW API Sync",
          addedByEmail: "",
          addedByRole: "Integration",
        });

        const pointsAwarded = await awardWarehousePointsIfEligible(
          customer,
          newPackage,
          req
        );

        await CustomerNotification.create({
          notificationNumber: `NTF-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
          customerEkonId: customer.ekonId,
          customerName: customer.name,
          title: "Package Received at Warehouse",
          message: `Your package ${newPackage.trackingNumber} has been received at the warehouse.${pointsAwarded > 0 ? ` You earned ${pointsAwarded} EK points.` : ""}`,
          type: "Package Update",
          referenceType: "Package",
          referenceId: newPackage.trackingNumber,
          isRead: false,
          date: getJamaicaDateString(),
        });

        await createIntegrationLog({
          source: "LTW API",
          status: "Success",
          trackingNumber,
          customerEkonId: customer.ekonId,
          message: "Package imported successfully from LTW API.",
          payload: ltwPkg,
        });

        await writeAuditLog({
          req,
          action: "IMPORT_LTW_PACKAGE",
          module: "Integrations",
          description: `Package ${trackingNumber} imported from LTW API for ${customer.name}`,
          targetType: "Package",
          targetId: trackingNumber,
          metadata: {
            customerEkonId: customer.ekonId,
            externalPackageId,
            externalWarehouseId,
            externalStatus,
            pointsAwarded,
          },
        });

        importedCount += 1;

        results.push({
          trackingNumber,
          status: "Imported",
          customerEkonId: customer.ekonId,
          customerName: customer.name,
          pointsAwarded,
        });
      } catch (itemError) {
        failedCount += 1;

        results.push({
          trackingNumber: ltwPkg?.tracking_number || "",
          status: "Failed",
          error: itemError.message,
        });
      }
    }

    res.json({
      success: true,
      message: "LTW package sync completed.",
      data: {
        page,
        limit,
        totalReceivedFromLtw: ltwPackages.length,
        importedCount,
        duplicateCount,
        unmatchedCount,
        failedCount,
        results,
      },
    });
  } catch (error) {
    console.error("LTW sync error:", error);

    res.status(500).json({
      success: false,
      message: "LTW sync failed.",
      error: error.message,
    });
  }
};

const receiveFreightPackage = async (req, res) => {
  const payload = req.body || {};

  try {
    const {
      trackingNumber,
      customerEkonId,
      customerName,
      courier = "",
      weight = 0,
      warehouseLocation = "",
      dateReceived,
      externalPackageId = "",
      externalWarehouseId = "",
      externalStatus = "ARRIVED",
      integrationSource = req.integrationPartner?.partnerName || "Freight Partner",
    } = payload;

    if (!trackingNumber) {
  await createIntegrationLog({
    source: integrationSource,
    status: "Failed",
    trackingNumber,
    customerEkonId,
    message: "Missing tracking number.",
    payload,
    errorDetails: "trackingNumber is required.",
  });

  return res.status(400).json({
    success: false,
    message: "trackingNumber is required.",
  });
}

if (!customerEkonId) {
  const unmatched = await createUnmatchedPackage({
    trackingNumber,
    customerEkonId,
    customerName,
    courier,
    weight,
    warehouseLocation,
    dateReceived,
    externalPackageId,
    externalWarehouseId,
    externalStatus,
    integrationSource,
    issueReason: "Missing customer EKON ID.",
    rawPayload: payload,
  });

  await createIntegrationLog({
    source: integrationSource,
    status: "Failed",
    trackingNumber,
    customerEkonId,
    message: "Package saved to unmatched review queue because customer EKON ID is missing.",
    payload,
    errorDetails: "Missing customer EKON ID.",
  });

  await writeAuditLog({
    req,
    action: "CREATE_UNMATCHED_PACKAGE",
    module: "Integrations",
    description: `Unmatched package ${trackingNumber} saved for review due to missing EKON ID`,
    targetType: "UnmatchedPackage",
    targetId: unmatched.unmatchedNumber,
    metadata: {
      trackingNumber,
      integrationSource,
      issueReason: "Missing customer EKON ID.",
    },
  });

  return res.status(202).json({
    success: true,
    needsReview: true,
    message: "Package saved to unmatched review queue. Customer EKON ID is missing.",
    data: unmatched,
  });
}

    const existingPackage = await Package.findOne({ trackingNumber });

    if (existingPackage) {
      await createIntegrationLog({
        source: req.integrationPartner?.partnerName || "Freight Partner",
        status: "Duplicate",
        trackingNumber,
        customerEkonId,
        message: "Package already exists. Duplicate ignored.",
        payload,
      });

      return res.status(409).json({
        success: false,
        message: "Package already exists. Duplicate ignored.",
        data: existingPackage,
      });
    }

    let customer = await Customer.findOne({
  ekonId: customerEkonId,
});

let customerMatchMethod = customer ? "EKON ID" : "";

if (!customer && customerName) {
  customer = await Customer.findOne({
    name: {
      $regex: `^${customerName.trim()}$`,
      $options: "i",
    },
  });

  if (customer) {
    customerMatchMethod = "Customer Name";
  }
}

if (!customer) {
  const unmatched = await createUnmatchedPackage({
    trackingNumber,
    customerEkonId,
    customerName,
    courier,
    weight,
    warehouseLocation,
    dateReceived,
    externalPackageId,
    externalWarehouseId,
    externalStatus,
    integrationSource,
    issueReason: `Customer not found for EKON ID ${customerEkonId}.`,
    rawPayload: payload,
  });

  await createIntegrationLog({
    source: integrationSource,
    status: "Failed",
    trackingNumber,
    customerEkonId,
    message:
      "Package saved to unmatched review queue because customer was not found.",
    payload,
    errorDetails: `No customer found for ${customerEkonId}`,
  });

  await writeAuditLog({
    req,
    action: "CREATE_UNMATCHED_PACKAGE",
    module: "Integrations",
    description: `Unmatched package ${trackingNumber} saved for review due to invalid EKON ID ${customerEkonId}`,
    targetType: "UnmatchedPackage",
    targetId: unmatched.unmatchedNumber,
    metadata: {
      trackingNumber,
      customerEkonId,
      integrationSource,
      issueReason: `Customer not found for EKON ID ${customerEkonId}.`,
    },
  });

  return res.status(202).json({
    success: true,
    needsReview: true,
    message:
      "Package saved to unmatched review queue. Customer could not be matched.",
    data: unmatched,
  });
}

    const now = new Date();

    const newPackage = await Package.create({
      trackingNumber,
      customerEkonId: customer.ekonId,
      customerName: customerName || customer.name,
      courier,
      weight: Number(weight || 0),
      status: "At Warehouse",
      warehouseLocation,
      invoiceStatus: "Pending",
      readyForPickup: false,
      readyForPickupDate: null,
      statusUpdatedAt: now,
      dateReceived: dateReceived || now,

      integrationSource,
      externalWarehouseId,
      externalPackageId,
      externalStatus,
      lastExternalSyncAt: now,
      syncNotes: `Created from freight partner integration. Matched by ${customerMatchMethod || "unknown method"}. Original EKON received: ${customerEkonId || "N/A"}.`,

      addedByUserId: "FREIGHT-INTEGRATION",
      addedByName: "Freight Partner API",
      addedByEmail: "",
      addedByRole: "Integration",
    });

    const pointsAwarded = await awardWarehousePointsIfEligible(customer, newPackage, req);

    try {
      const customerPackageCount = await Package.countDocuments({
        customerEkonId: newPackage.customerEkonId,
      });

      if (customerPackageCount === 1) {
        await completeReferral(newPackage.customerEkonId, newPackage.trackingNumber);
      }
    } catch (referralError) {
      console.error("Referral reward processing failed:", referralError.message);
    }

    await CustomerNotification.create({
      notificationNumber: `NTF-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
      customerEkonId: customer.ekonId,
      customerName: customer.name,
      title: "Package Received at Warehouse",
      message: `Your package ${newPackage.trackingNumber} has been received at the warehouse.${pointsAwarded > 0 ? ` You earned ${pointsAwarded} EK points.` : ""}`,
      type: "Package Update",
      referenceType: "Package",
      referenceId: newPackage.trackingNumber,
      isRead: false,
      date: getJamaicaDateString(),
    });

    await createIntegrationLog({
      source: integrationSource,
      status: "Success",
      trackingNumber,
      customerEkonId: customer.ekonId,
      message: "Package created successfully from freight integration.",
      payload,
    });

    await writeAuditLog({
      req,
      action: "CREATE_PACKAGE_INTEGRATION",
      module: "Integrations",
      description: `Package ${newPackage.trackingNumber} created from freight integration for ${customer.name}`,
      targetType: "Package",
      targetId: newPackage.trackingNumber,
      metadata: {
        customerEkonId: customer.ekonId,
        integrationSource,
        externalPackageId,
        externalWarehouseId,
        externalStatus,
        pointsAwarded,
      },
    });

    return res.status(201).json({
      success: true,
      message: "Package received and created successfully.",
      data: newPackage,
      pointsAwarded,
      customerPointsBalance: customer.pointsBalance,
    });
  } catch (error) {
    console.error("Freight integration error:", error);

    await createIntegrationLog({
      status: "Failed",
      trackingNumber: payload.trackingNumber || "",
      customerEkonId: payload.customerEkonId || "",
      message: "Freight integration failed.",
      payload,
      errorDetails: error.message,
    });

    return res.status(500).json({
      success: false,
      message: "Freight integration failed.",
      error: error.message,
    });
  }
};

const splitCustomerNameForKP = (fullName = "") => {
  const cleanName = String(fullName || "").trim();
  const parts = cleanName.split(" ").filter(Boolean);

  if (parts.length === 0) {
    return { firstName: "", lastName: "" };
  }

  if (parts.length === 1) {
    return { firstName: parts[0], lastName: "" };
  }

  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(" "),
  };
};

const cleanBearerToken = (value = "") => {
  return String(value || "")
    .replace(/^Bearer\s+/i, "")
    .replace(/^Token\s+/i, "")
    .replace(/^Authorization:\s*/i, "")
    .replace(/^"+|"+$/g, "")
    .replace(/^'+|'+$/g, "")
    .trim();
};

const verifyKpPartnerKey = async (apiKey = "") => {
  const cleanKey = cleanBearerToken(apiKey);

  if (!cleanKey) return null;

  return await FreightPartner.findOne({
    apiKey: cleanKey,
    status: "Active",
  });
};

const getKpApiKeyFromRequest = (req, item = {}) => {
  return (
    req.query.id ||
    req.query.apiToken ||
    item.apiToken ||
    item.ApiToken ||
    item.token ||
    req.headers.authorization ||
    req.headers.Authorization ||
    req.headers["x-api-key"] ||
    ""
  );
};

const getKpValue = (item, keys = []) => {
  for (const key of keys) {
    if (item[key] !== undefined && item[key] !== null && String(item[key]).trim() !== "") {
      return item[key];
    }
  }

  return "";
};

const getKpCustomers = async (req, res) => {
  try {
    const partner =
  req.integrationPartner || (await verifyKpPartnerKey(getKpApiKeyFromRequest(req)));

  console.log(
  "KP PARTNER FOUND:",
  partner ? partner.partnerName : "NOT FOUND"
);

    if (!partner) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized KP customer sync request.",
      });
    }

    const customers = await Customer.find({
      status: "Active",
    }).sort({ createdAt: -1 });

    const formattedCustomers = customers.map((customer) => {
      const { firstName, lastName } = splitCustomerNameForKP(customer.name);

      return {
        UserCode: customer.ekonId,
        FirstName: firstName,
        LastName: lastName,
        Branch: customer.branch || "Eltham Park",
        CustomerServiceTypeID: "59cadcd4-7508-450b-85aa-9ec908d168fe",
        CustomerLevelInstructions: "",
        CourierServiceTypeID: "59cadcd4-7508-450b-85aa-9ec908d168fe",
        CourierLevelInstructions: "",
      };
    });

    partner.lastSyncAt = new Date();
    await partner.save();

    await createIntegrationLog({
      source: partner.partnerName || "KP Logistics",
      eventType: "CUSTOMER_SYNC",
      status: "Success",
      message: `KP pulled ${formattedCustomers.length} active EKOS customers.`,
      payload: {
        customerCount: formattedCustomers.length,
      },
    });

    return res.json(formattedCustomers);
  } catch (error) {
    console.error("KP customer sync error:", error);

    await createIntegrationLog({
      source: "KP Logistics",
      eventType: "CUSTOMER_SYNC",
      status: "Failed",
      message: "KP customer sync failed.",
      errorDetails: error.message,
    });

    return res.status(500).json({
      success: false,
      message: "KP customer sync failed.",
      error: error.message,
    });
  }
};

const receiveKpPackages = async (req, res) => {
  console.log("============== KP PACKAGE REQUEST START ==============");
  console.log("TIME:", new Date().toISOString());
  console.log("HEADERS:", JSON.stringify(req.headers, null, 2));
  console.log("BODY:", JSON.stringify(req.body, null, 2));
  console.log("======================================================");

  try {
    console.log(
  "RAW KP PAYLOAD:",
  JSON.stringify(req.body, null, 2)
);

let payload = [];

if (Array.isArray(req.body)) {
  payload = req.body;
} else if (Array.isArray(req.body.packages)) {
  payload = req.body.packages;
} else if (Array.isArray(req.body.data)) {
  payload = req.body.data;
} else {
  return res.status(400).json({
    success: false,
    message:
      "KP package payload must contain an array.",
  });
}

console.log("KP PACKAGE COUNT:", payload.length);

    let importedCount = 0;
    let duplicateCount = 0;
    let unmatchedCount = 0;
    let failedCount = 0;

    const results = [];

    for (const kpPackage of payload) {

      console.log(
  "PROCESSING KP PACKAGE:",
  JSON.stringify(kpPackage, null, 2)
);
      try {
        const partner =
  req.integrationPartner || (await verifyKpPartnerKey(getKpApiKeyFromRequest(req, kpPackage)));

        if (!partner) {
          failedCount += 1;

          results.push({
            trackingNumber: kpPackage.trackingNumber || "",
            status: "Failed",
            message: "Unauthorized KP API key.",
          });

          continue;
        }

                const trackingNumber = String(
          getKpValue(kpPackage, [
            "trackingNumber",
            "TrackingNumber",
            "tracking_number",
            "Tracking",
            "tracking",
          ])
        ).trim();

        const customerEkonId = String(
          getKpValue(kpPackage, [
            "userCode",
            "UserCode",
            "customerEkonId",
            "CustomerEkonId",
            "customerCode",
            "CustomerCode",
          ])
        )
          .trim()
          .toUpperCase();

        const firstName = String(
          getKpValue(kpPackage, ["firstName", "FirstName", "firstname"])
        ).trim();

        const lastName = String(
          getKpValue(kpPackage, ["lastName", "LastName", "lastname"])
        ).trim();

        const customerName = `${firstName} ${lastName}`.trim();

        const weight = Number(
          getKpValue(kpPackage, ["weight", "Weight", "actualWeight", "ActualWeight"]) || 0
        );

        const now = new Date();

        if (!trackingNumber) {
          failedCount += 1;

          await createIntegrationLog({
            source: partner.partnerName || "KP Logistics",
            eventType: "PACKAGE_ARRIVAL",
            status: "Failed",
            message: "KP package missing tracking number.",
            payload: kpPackage,
            errorDetails: "trackingNumber is required.",
          });

          results.push({
            status: "Failed",
            message: "Missing tracking number.",
          });

          continue;
        }

        const existingPackage = await Package.findOne({ trackingNumber });

        if (existingPackage) {
          duplicateCount += 1;

          await createIntegrationLog({
            source: partner.partnerName || "KP Logistics",
            eventType: "PACKAGE_ARRIVAL",
            status: "Duplicate",
            trackingNumber,
            customerEkonId,
            message: "KP package already exists in EKOS. Duplicate ignored.",
            payload: kpPackage,
          });

          results.push({
            trackingNumber,
            status: "Duplicate",
            message: "Package already exists in EKOS.",
          });

          continue;
        }

        console.log("KP CUSTOMER EKON ID:", customerEkonId);
console.log("KP CUSTOMER NAME:", customerName);

                let customer = customerEkonId
          ? await Customer.findOne({ ekonId: customerEkonId })
          : null;

        let customerMatchMethod = customer ? "EKON ID" : "";

        if (!customer && customerName) {
          customer = await Customer.findOne({
            name: { $regex: `^${customerName.trim()}$`, $options: "i" },
          });

          if (customer) {
            customerMatchMethod = "KP customer name";
          }
        }

          console.log(
  "KP CUSTOMER MATCH:",
  customer ? customer.ekonId : "NOT FOUND"
);

        if (!customer) {
          const unmatched = await createUnmatchedPackage({
            trackingNumber,
            customerEkonId,
            customerName,
            courier: "KP Logistics",
            weight,
            warehouseLocation: "KP Warehouse",
                        dateReceived:
              getKpValue(kpPackage, ["entryDateTime", "EntryDateTime", "entryDate", "EntryDate"]) ||
              now,
            externalPackageId: getKpValue(kpPackage, ["packageID", "PackageID", "packageId", "PackageId"]) || "",
            externalWarehouseId: getKpValue(kpPackage, ["courierID", "CourierID", "courierId", "CourierId"]) || "KP",
            externalStatus:
              getKpValue(kpPackage, ["claimed", "Claimed"]) ? "CLAIMED" : "ARRIVED",
            integrationSource: partner.partnerName || "KP Logistics",
            issueReason: customerEkonId
              ? `Customer not found for EKON ID ${customerEkonId}.`
              : "Missing customer EKON ID from KP userCode.",
            rawPayload: kpPackage,
          });

          unmatchedCount += 1;

          await createIntegrationLog({
            source: partner.partnerName || "KP Logistics",
            eventType: "PACKAGE_ARRIVAL",
            status: "Failed",
            trackingNumber,
            customerEkonId,
            message: "KP package saved to unmatched review queue.",
            payload: kpPackage,
            errorDetails: customerEkonId
              ? `Customer not found for EKON ID ${customerEkonId}.`
              : "Missing customer EKON ID from KP userCode.",
          });

          results.push({
            trackingNumber,
            status: "Unmatched",
            unmatchedNumber: unmatched.unmatchedNumber,
            customerEkonId,
          });

          continue;
        }

        const newPackage = await Package.create({
          trackingNumber,
          customerEkonId: customer.ekonId,
          customerName: customer.name,
          courier: "KP Logistics",
          weight,
          status: "At Warehouse",
          warehouseLocation: "KP Warehouse",
          invoiceStatus: "Pending",
          readyForPickup: false,
          readyForPickupDate: null,
          statusUpdatedAt: now,
                    dateReceived:
            getKpValue(kpPackage, ["entryDateTime", "EntryDateTime", "entryDate", "EntryDate"]) ||
            now,

          integrationSource: partner.partnerName || "KP Logistics",
          externalWarehouseId: getKpValue(kpPackage, ["courierID", "CourierID", "courierId", "CourierId"]) || "KP",
          externalPackageId: getKpValue(kpPackage, ["packageID", "PackageID", "packageId", "PackageId"]) || "",
          externalStatus:
            getKpValue(kpPackage, ["claimed", "Claimed"]) ? "CLAIMED" : "ARRIVED",
          lastExternalSyncAt: now,
                    syncNotes: `Created from KP Logistics API push. Matched by ${customerMatchMethod || "unknown method"}. Original KP userCode: ${customerEkonId || "N/A"}.`,

          addedByUserId: "KP-API",
          addedByName: "KP Logistics API",
          addedByEmail: "",
          addedByRole: "Integration",
        });

        const pointsAwarded = await awardWarehousePointsIfEligible(
          customer,
          newPackage,
          req
        );

                try {
          const customerPackageCount = await Package.countDocuments({
            customerEkonId: newPackage.customerEkonId,
            status: { $ne: "Deleted" },
          });

          if (customerPackageCount === 1) {
            await completeReferral(newPackage.customerEkonId, newPackage.trackingNumber);
          }
        } catch (referralError) {
          console.error("KP referral reward processing failed:", referralError.message);
        }

        await CustomerNotification.create({
          notificationNumber: `NTF-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
          customerEkonId: customer.ekonId,
          customerName: customer.name,
          title: "Package Received at Warehouse",
          message: `Your package ${newPackage.trackingNumber} has been received at the warehouse.${pointsAwarded > 0 ? ` You earned ${pointsAwarded} EK points.` : ""}`,
          type: "Package Update",
          referenceType: "Package",
          referenceId: newPackage.trackingNumber,
          isRead: false,
          date: getJamaicaDateString(),
        });

        await createIntegrationLog({
          source: partner.partnerName || "KP Logistics",
          eventType: "PACKAGE_ARRIVAL",
          status: "Success",
          trackingNumber,
          customerEkonId: customer.ekonId,
          message: "Package imported successfully from KP Logistics API.",
          payload: kpPackage,
        });

        partner.lastSyncAt = new Date();
        await partner.save();

        importedCount += 1;

        results.push({
          trackingNumber,
          status: "Imported",
          customerEkonId: customer.ekonId,
          customerName: customer.name,
          pointsAwarded,
        });
      } catch (itemError) {
        failedCount += 1;

        results.push({
          trackingNumber: kpPackage?.trackingNumber || "",
          status: "Failed",
          error: itemError.message,
        });
      }
    }

    return res.status(200).json({
      success: true,
      message: "KP package sync completed.",
      data: {
        totalReceivedFromKp: payload.length,
        importedCount,
        duplicateCount,
        unmatchedCount,
        failedCount,
        results,
      },
    });
  } catch (error) {
    console.error("KP package sync error:", error);

    await createIntegrationLog({
      source: "KP Logistics",
      eventType: "PACKAGE_ARRIVAL",
      status: "Failed",
      message: "KP package sync failed.",
      payload: req.body,
      errorDetails: error.message,
    });

    return res.status(500).json({
      success: false,
      message: "KP package sync failed.",
      error: error.message,
    });
  }
};

module.exports = {
  receiveFreightPackage,
  syncLtwPackages,
  getKpCustomers,
  receiveKpPackages,
};