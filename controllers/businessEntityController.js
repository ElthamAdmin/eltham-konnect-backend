const BusinessEntity = require("../models/BusinessEntity");

const {
  normalizeEntityDate,
  validateNoEntityOverlap,
  getBusinessEntityForDate,
  getBusinessEntitySnapshot,
} = require("../services/businessEntityService");

const getUserName = (user) =>
  user?.fullName || user?.name || user?.email || "System User";

const getBusinessEntities = async (req, res) => {
  try {
    const entities = await BusinessEntity.find().sort({
      effectiveFrom: 1,
      entityCode: 1,
    });

    res.json({
      success: true,
      message: "Business entities retrieved successfully",
      totalRecords: entities.length,
      data: entities,
    });
  } catch (error) {
    console.error("Get business entities error:", error);

    res.status(500).json({
      success: false,
      message: "Could not retrieve business entities",
      error: error.message,
    });
  }
};

const getBusinessEntityByCode = async (req, res) => {
  try {
    const { entityCode } = req.params;

    const entity = await BusinessEntity.findOne({
      entityCode: String(entityCode || "").trim(),
    });

    if (!entity) {
      return res.status(404).json({
        success: false,
        message: "Business entity not found",
      });
    }

    res.json({
      success: true,
      message: "Business entity retrieved successfully",
      data: entity,
    });
  } catch (error) {
    console.error("Get business entity error:", error);

    res.status(500).json({
      success: false,
      message: "Could not retrieve business entity",
      error: error.message,
    });
  }
};

const resolveBusinessEntityForDate = async (req, res) => {
  try {
    const { date } = req.query;

    if (!date) {
      return res.status(400).json({
        success: false,
        message: "A date using YYYY-MM-DD format is required.",
      });
    }

    const entity = await getBusinessEntityForDate(date, {
      includeRegistered: true,
      includePlanned: false,
    });

    res.json({
      success: true,
      message: "Business entity resolved successfully",
      data: {
        entity,
        snapshot: getBusinessEntitySnapshot(entity),
      },
    });
  } catch (error) {
    console.error("Resolve business entity error:", error);

    const statusCode = /No business entity|Multiple business entities/i.test(
      error.message
    )
      ? 409
      : 400;

    res.status(statusCode).json({
      success: false,
      message: error.message,
    });
  }
};

const createBusinessEntity = async (req, res) => {
  try {
    const {
      entityCode,
      legalName,
      tradingName,
      entityType,
      lifecycleStatus,
      effectiveFrom,
      effectiveTo,
      registrationNumber,
      incorporationDate,
      trn,
      registeredAddress,
      businessEmail,
      businessPhone,
      fiscalYearStart,
      fiscalYearEnd,
      predecessorEntityCode,
      successorEntityCode,
      transitionNotes,
      directors,
      shareholders,
      authorizedShareCapital,
      issuedShares,
      taxTreatment,
      accountingConfiguration,
    } = req.body;

    if (!entityCode || !legalName || !entityType || !effectiveFrom) {
      return res.status(400).json({
        success: false,
        message:
          "Entity code, legal name, entity type, and effective-from date are required.",
      });
    }

    const normalizedCode = String(entityCode).trim().toUpperCase();

    const existingEntity = await BusinessEntity.findOne({
      entityCode: normalizedCode,
    });

    if (existingEntity) {
      return res.status(409).json({
        success: false,
        message: `Business entity ${normalizedCode} already exists.`,
      });
    }

    const normalizedEffectiveFrom = normalizeEntityDate(
      effectiveFrom,
      "Effective-from date"
    );

    const normalizedEffectiveTo = effectiveTo
      ? normalizeEntityDate(effectiveTo, "Effective-to date")
      : null;

    if (
      normalizedEffectiveTo &&
      normalizedEffectiveTo < normalizedEffectiveFrom
    ) {
      return res.status(400).json({
        success: false,
        message:
          "The effective-to date cannot be earlier than the effective-from date.",
      });
    }

    const requestedLifecycleStatus = String(
      lifecycleStatus || "Planned"
    ).trim();

    if (
      ["Registered", "Active"].includes(requestedLifecycleStatus)
    ) {
      await validateNoEntityOverlap({
        effectiveFrom: normalizedEffectiveFrom,
        effectiveTo: normalizedEffectiveTo,
      });
    }

    const entity = await BusinessEntity.create({
      entityCode: normalizedCode,
      legalName: String(legalName).trim(),
      tradingName: String(tradingName || "").trim(),
      entityType,
      lifecycleStatus: requestedLifecycleStatus,
      effectiveFrom: normalizedEffectiveFrom,
      effectiveTo: normalizedEffectiveTo,
      registrationNumber: String(registrationNumber || "").trim(),
      incorporationDate: incorporationDate
        ? normalizeEntityDate(
            incorporationDate,
            "Incorporation date"
          )
        : null,
      trn: String(trn || "").trim(),
      registeredAddress: String(registeredAddress || "").trim(),
      businessEmail: String(businessEmail || "").trim(),
      businessPhone: String(businessPhone || "").trim(),
      fiscalYearStart: String(fiscalYearStart || "01-01").trim(),
      fiscalYearEnd: String(fiscalYearEnd || "12-31").trim(),
      predecessorEntityCode: String(
        predecessorEntityCode || ""
      )
        .trim()
        .toUpperCase(),
      successorEntityCode: String(successorEntityCode || "")
        .trim()
        .toUpperCase(),
      transitionNotes: String(transitionNotes || "").trim(),
      directors: Array.isArray(directors) ? directors : [],
      shareholders: Array.isArray(shareholders) ? shareholders : [],
      authorizedShareCapital: Number(
        authorizedShareCapital || 0
      ),
      issuedShares: Number(issuedShares || 0),
      taxTreatment: taxTreatment || undefined,
      accountingConfiguration:
        accountingConfiguration || undefined,
      createdBy: getUserName(req.user),
      updatedBy: getUserName(req.user),
    });

    res.status(201).json({
      success: true,
      message: "Business entity created successfully",
      data: entity,
    });
  } catch (error) {
    console.error("Create business entity error:", error);

    const statusCode =
      error.name === "ValidationError" ? 400 : 500;

    res.status(statusCode).json({
      success: false,
      message:
        statusCode === 400
          ? error.message
          : "Could not create business entity",
      error: error.message,
    });
  }
};

const updatePlannedBusinessEntity = async (req, res) => {
  try {
    const { entityCode } = req.params;

    const entity = await BusinessEntity.findOne({
      entityCode: String(entityCode || "").trim().toUpperCase(),
    });

    if (!entity) {
      return res.status(404).json({
        success: false,
        message: "Business entity not found",
      });
    }

    if (!["Planned", "Registered"].includes(entity.lifecycleStatus)) {
      return res.status(409).json({
        success: false,
        message:
          "Only Planned or Registered business entities may be edited through this endpoint.",
      });
    }

    const protectedFields = [
      "entityCode",
      "lifecycleStatus",
      "createdBy",
      "createdAt",
      "historicalDataLocked",
    ];

    protectedFields.forEach((field) => {
      delete req.body[field];
    });

    if (req.body.effectiveFrom) {
      req.body.effectiveFrom = normalizeEntityDate(
        req.body.effectiveFrom,
        "Effective-from date"
      );
    }

    if (req.body.effectiveTo) {
      req.body.effectiveTo = normalizeEntityDate(
        req.body.effectiveTo,
        "Effective-to date"
      );
    }

    const nextEffectiveFrom =
      req.body.effectiveFrom || entity.effectiveFrom;
    const nextEffectiveTo =
      req.body.effectiveTo !== undefined
        ? req.body.effectiveTo
        : entity.effectiveTo;

    if (
      nextEffectiveTo &&
      new Date(nextEffectiveTo) < new Date(nextEffectiveFrom)
    ) {
      return res.status(400).json({
        success: false,
        message:
          "The effective-to date cannot be earlier than the effective-from date.",
      });
    }

    if (entity.lifecycleStatus === "Registered") {
      await validateNoEntityOverlap({
        effectiveFrom: nextEffectiveFrom,
        effectiveTo: nextEffectiveTo,
        excludeEntityId: entity._id,
      });
    }

    Object.assign(entity, req.body, {
      updatedBy: getUserName(req.user),
    });

    await entity.save();

    res.json({
      success: true,
      message: "Business entity updated successfully",
      data: entity,
    });
  } catch (error) {
    console.error("Update business entity error:", error);

    const statusCode =
      error.name === "ValidationError" ? 400 : 500;

    res.status(statusCode).json({
      success: false,
      message:
        statusCode === 400
          ? error.message
          : "Could not update business entity",
      error: error.message,
    });
  }
};

const registerBusinessEntity = async (req, res) => {
  try {
    const { entityCode } = req.params;

    const entity = await BusinessEntity.findOne({
      entityCode: String(entityCode || "").trim().toUpperCase(),
    });

    if (!entity) {
      return res.status(404).json({
        success: false,
        message: "Business entity not found",
      });
    }

    if (entity.lifecycleStatus !== "Planned") {
      return res.status(409).json({
        success: false,
        message:
          "Only a Planned business entity may enter Registered status.",
      });
    }

    if (!entity.trn) {
      return res.status(400).json({
        success: false,
        message:
          "The entity TRN must be recorded before registration.",
      });
    }

    if (
      entity.entityType === "Limited Liability Company" &&
      !entity.registrationNumber
    ) {
      return res.status(400).json({
        success: false,
        message:
          "The company registration number is required before an LLC can be registered.",
      });
    }

    await validateNoEntityOverlap({
      effectiveFrom: entity.effectiveFrom,
      effectiveTo: entity.effectiveTo,
      excludeEntityId: entity._id,
    });

    entity.lifecycleStatus = "Registered";
    entity.updatedBy = getUserName(req.user);

    await entity.save();

    res.json({
      success: true,
      message: `${entity.entityCode} registered successfully. Accounting initialization is still required before activation.`,
      data: entity,
    });
  } catch (error) {
    console.error("Register business entity error:", error);

    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

const activateBusinessEntity = async (req, res) => {
  try {
    const { entityCode } = req.params;

    const entity = await BusinessEntity.findOne({
      entityCode: String(entityCode || "").trim().toUpperCase(),
    });

    if (!entity) {
      return res.status(404).json({
        success: false,
        message: "Business entity not found",
      });
    }

    if (entity.lifecycleStatus !== "Registered") {
      return res.status(409).json({
        success: false,
        message:
          "Only a Registered business entity may be activated.",
      });
    }

    if (!entity.accountingConfiguration?.coaInitialized) {
      return res.status(409).json({
        success: false,
        message:
          "The entity Chart of Accounts must be initialized before activation.",
      });
    }

    if (
      !entity.accountingConfiguration?.reportingInitialized
    ) {
      return res.status(409).json({
        success: false,
        message:
          "Entity reporting must be initialized before activation.",
      });
    }

    await validateNoEntityOverlap({
      effectiveFrom: entity.effectiveFrom,
      effectiveTo: entity.effectiveTo,
      excludeEntityId: entity._id,
    });

    entity.lifecycleStatus = "Active";
    entity.activatedBy = getUserName(req.user);
    entity.activatedAt = new Date();
    entity.updatedBy = getUserName(req.user);

    await entity.save();

    res.json({
      success: true,
      message: `${entity.entityCode} activated successfully.`,
      data: entity,
    });
  } catch (error) {
    console.error("Activate business entity error:", error);

    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

module.exports = {
  getBusinessEntities,
  getBusinessEntityByCode,
  resolveBusinessEntityForDate,
  createBusinessEntity,
  updatePlannedBusinessEntity,
  registerBusinessEntity,
  activateBusinessEntity,
};