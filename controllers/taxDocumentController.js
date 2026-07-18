const BusinessEntity = require("../models/BusinessEntity");
const TaxDocument = require("../models/TaxDocument");

const {
  getBusinessEntitySnapshot,
} = require("../services/businessEntityService");

const getUserName = (user) =>
  user?.fullName ||
  user?.name ||
  user?.email ||
  "System User";

const getTaxDocuments = async (req, res) => {
  try {
    const query = {};

    if (req.query.entityCode) {
      query.entityCode = String(
        req.query.entityCode
      )
        .trim()
        .toUpperCase();
    }

    if (req.query.taxType) {
      query.taxType = String(
        req.query.taxType
      ).trim();
    }

    if (req.query.documentType) {
      query.documentType = String(
        req.query.documentType
      ).trim();
    }

    if (req.query.periodKey) {
      query.periodKey = String(
        req.query.periodKey
      ).trim();
    }

    if (req.query.verificationStatus) {
      query.verificationStatus = String(
        req.query.verificationStatus
      ).trim();
    }

    if (req.query.search) {
      const search = String(
        req.query.search
      ).trim();

      query.$or = [
        {
          documentNumber: {
            $regex: search,
            $options: "i",
          },
        },
        {
          title: {
            $regex: search,
            $options: "i",
          },
        },
        {
          externalReference: {
            $regex: search,
            $options: "i",
          },
        },
        {
          receiptNumber: {
            $regex: search,
            $options: "i",
          },
        },
      ];
    }

    const documents = await TaxDocument.find(
      query
    ).sort({
      documentDate: -1,
      createdAt: -1,
    });

    res.json({
      success: true,
      message:
        "Tax documents retrieved successfully",
      totalRecords: documents.length,
      data: documents,
    });
  } catch (error) {
    console.error(
      "Get tax documents error:",
      error
    );

    res.status(500).json({
      success: false,
      message:
        "Could not retrieve tax documents",
      error: error.message,
    });
  }
};

const createTaxDocument = async (
  req,
  res
) => {
  try {
    const {
      entityCode,
      taxType,
      documentType,
      title,
      description,
      periodKey,
      periodStart,
      periodEnd,
      taxRecordId,
      taxNumber,
      incomeTaxEstimateId,
      estimateNumber,
      gctFilingPeriodId,
      filingNumber,
      externalReference,
      receiptNumber,
      documentDate,
      receivedDate,
      fileName,
      fileUrl,
      mimeType,
      fileSize,
      storageProvider,
      checksum,
      confidential,
      tags,
      notes,
    } = req.body;

    if (
      !entityCode ||
      !taxType ||
      !documentType ||
      !title ||
      !documentDate ||
      !fileName ||
      !fileUrl
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Entity code, tax type, document type, title, document date, file name, and file URL are required.",
      });
    }

    const entity = await BusinessEntity.findOne({
      entityCode: String(entityCode)
        .trim()
        .toUpperCase(),
    });

    if (!entity) {
      return res.status(404).json({
        success: false,
        message: "Business entity not found",
      });
    }

    const userName = getUserName(req.user);

    const document = await TaxDocument.create({
      documentNumber: `TAX-DOC-${Date.now()}`,
      entityId: entity._id,
      entityCode: entity.entityCode,
      entitySnapshot:
        getBusinessEntitySnapshot(entity),
      taxType,
      documentType,
      title: String(title).trim(),
      description: String(
        description || ""
      ).trim(),
      periodKey: String(
        periodKey || ""
      ).trim(),
      periodStart: periodStart || null,
      periodEnd: periodEnd || null,
      taxRecordId: taxRecordId || null,
      taxNumber: String(
        taxNumber || ""
      ).trim(),
      incomeTaxEstimateId:
        incomeTaxEstimateId || null,
      estimateNumber: String(
        estimateNumber || ""
      ).trim(),
      gctFilingPeriodId:
        gctFilingPeriodId || null,
      filingNumber: String(
        filingNumber || ""
      ).trim(),
      externalReference: String(
        externalReference || ""
      ).trim(),
      receiptNumber: String(
        receiptNumber || ""
      ).trim(),
      documentDate,
      receivedDate: receivedDate || null,
      fileName: String(fileName).trim(),
      fileUrl: String(fileUrl).trim(),
      mimeType: String(
        mimeType || ""
      ).trim(),
      fileSize: Number(fileSize || 0),
      storageProvider:
        storageProvider || "External URL",
      checksum: String(
        checksum || ""
      ).trim(),
      verificationStatus: "Unverified",
      confidential:
        confidential === undefined
          ? true
          : Boolean(confidential),
      tags: Array.isArray(tags) ? tags : [],
      uploadedBy: userName,
      notes: String(notes || "").trim(),
    });

    res.status(201).json({
      success: true,
      message:
        "Tax document registered successfully",
      data: document,
    });
  } catch (error) {
    console.error(
      "Create tax document error:",
      error
    );

    const statusCode =
      error.name === "ValidationError"
        ? 400
        : 500;

    res.status(statusCode).json({
      success: false,
      message:
        statusCode === 400
          ? error.message
          : "Could not register tax document",
      error: error.message,
    });
  }
};

const verifyTaxDocument = async (
  req,
  res
) => {
  try {
    const { documentNumber } = req.params;
    const { action, notes } = req.body;

    const document = await TaxDocument.findOne({
      documentNumber: String(
        documentNumber || ""
      )
        .trim()
        .toUpperCase(),
    });

    if (!document) {
      return res.status(404).json({
        success: false,
        message: "Tax document not found",
      });
    }

    if (
      document.verificationStatus ===
      "Superseded"
    ) {
      return res.status(409).json({
        success: false,
        message:
          "A superseded tax document cannot be verified or rejected.",
      });
    }

    const normalizedAction = String(
      action || ""
    )
      .trim()
      .toLowerCase();

    if (
      !["verify", "reject"].includes(
        normalizedAction
      )
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Action must be Verify or Reject.",
      });
    }

    const userName = getUserName(req.user);

    document.verificationStatus =
      normalizedAction === "verify"
        ? "Verified"
        : "Rejected";

    document.verifiedBy = userName;
    document.verifiedAt = new Date();
    document.verificationNotes = String(
      notes || ""
    ).trim();

    await document.save();

    res.json({
      success: true,
      message: `${document.documentNumber} ${
        normalizedAction === "verify"
          ? "verified"
          : "rejected"
      } successfully.`,
      data: document,
    });
  } catch (error) {
    console.error(
      "Verify tax document error:",
      error
    );

    const statusCode =
      error.name === "ValidationError"
        ? 400
        : 500;

    res.status(statusCode).json({
      success: false,
      message:
        statusCode === 400
          ? error.message
          : "Could not update tax-document verification",
      error: error.message,
    });
  }
};

module.exports = {
  getTaxDocuments,
  createTaxDocument,
  verifyTaxDocument,
};