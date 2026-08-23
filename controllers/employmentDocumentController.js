const crypto = require("crypto");

const EmploymentDocument = require(
  "../models/EmploymentDocument"
);

const HREmployee = require(
  "../models/HREmployee"
);

const {
  writeAuditLog,
} = require("../utils/auditLogger");

const {
  uploadEmploymentDocumentBuffer,
  generateSignedDocumentUrl,
  destroyEmploymentDocumentAsset,
} = require(
  "../services/employmentDocumentStorageService"
);

const EMPLOYEE_INACCESSIBLE_DOCUMENT_STATUSES = [
  "Archived",
  "Cancelled",
  "Superseded",
];

const normalizeString = (value) =>
  String(value || "").trim();

const getUserId = (user) =>
  normalizeString(
    user?.userId ||
      user?._id ||
      user?.id
  );

const getUserName = (user) =>
  normalizeString(
    user?.fullName ||
      user?.name ||
      user?.email
  ) || "System User";

const isHrUser = (req) => {
  const permissions =
    Array.isArray(
      req.user?.permissions
    )
      ? req.user.permissions
      : [];

  return (
    permissions.includes("hr") ||
    req.user?.role === "Admin"
  );
};

const normalizeBoolean = (
  value,
  fallback = false
) => {
  if (
    value === undefined ||
    value === null ||
    value === ""
  ) {
    return fallback;
  }

  if (
    typeof value === "boolean"
  ) {
    return value;
  }

  return [
    "true",
    "1",
    "yes",
    "on",
  ].includes(
    String(value)
      .trim()
      .toLowerCase()
  );
};

const normalizeReminderDays = (
  value
) => {
  const source =
    Array.isArray(value)
      ? value
      : normalizeString(value)
      ? normalizeString(
          value
        ).split(",")
      : [90, 30, 7];

  return Array.from(
    new Set(
      source
        .map(Number)
        .filter(
          (day) =>
            Number.isInteger(day) &&
            day >= 0 &&
            day <= 365
        )
    )
  ).sort(
    (first, second) =>
      second - first
  );
};

const createDocumentNumber = (
  employeeId
) =>
  `EDOC-${normalizeString(
    employeeId
  ).toUpperCase()}-${Date.now()}-${crypto.randomInt(
    1000,
    10000
  )}`;

const buildEmployeeSnapshot = (
  employee
) => ({
  fullName: employee.fullName,

  jobTitle:
    employee.jobTitle || "",

  department:
    employee.department || "",

  branch:
    employee.branch || "",

  employmentStatus:
    employee.employmentStatus ||
    "",
});

const appendHistory = ({
  document,
  action,
  fromStatus = "",
  toStatus = "",
  notes = "",
  user,
}) => {
  document.history.push({
    action,
    fromStatus,
    toStatus,

    notes:
      normalizeString(notes),

    performedBy:
      getUserName(user),

    performedByUserId:
      getUserId(user),

    performedAt:
      new Date(),
  });
};

const serializeDocument = (
  document
) => {
  const value =
    typeof document.toObject ===
    "function"
      ? document.toObject()
      : {
          ...document,
        };

  /*
   * Storage keys and permanent
   * Cloudinary URLs are intentionally
   * excluded from API responses.
   */
  value.versions = (
    value.versions || []
  ).map((version) => ({
    _id: version._id,

    versionNumber:
      version.versionNumber,

    changeReason:
      version.changeReason,

    uploadedBy:
      version.uploadedBy,

    uploadedAt:
      version.uploadedAt,

    active:
      version.active,

    file: {
      originalFileName:
        version.file
          ?.originalFileName ||
        "",

      mimeType:
        version.file
          ?.mimeType || "",

      sizeBytes:
        version.file
          ?.sizeBytes || 0,

      checksumSha256:
        version.file
          ?.checksumSha256 ||
        "",

      storageProvider:
        version.file
          ?.storageProvider ||
        "",
    },
  }));

  const today =
    new Date()
      .toISOString()
      .slice(0, 10);

  value.expiryState =
    !value.expiryTrackingRequired ||
    !value.expiryDate
      ? "Not Tracked"
      : value.expiryDate < today
      ? "Expired"
      : value.expiryDate === today
      ? "Expires Today"
      : "Current";

  return value;
};

const serializeEmployeeDocument = (
  document
) => {
  const value =
    serializeDocument(document);

  return {
    documentNumber:
      value.documentNumber,

    employeeId:
      value.employeeId,

    employeeSnapshot:
      value.employeeSnapshot || {},

    documentName:
      value.documentName,

    documentType:
      value.documentType,

    description:
      value.description || "",

    employeeCanDownload:
      Boolean(
        value.employeeCanDownload
      ),

    issueDate:
      value.issueDate || "",

    effectiveDate:
      value.effectiveDate || "",

    expiryDate:
      value.expiryDate || "",

    expiryTrackingRequired:
      Boolean(
        value.expiryTrackingRequired
      ),

    expiryState:
      value.expiryState,

    acknowledgementRequired:
      Boolean(
        value.acknowledgementRequired
      ),

    acknowledgementDueDate:
      value.acknowledgementDueDate ||
      "",

    acknowledgement: {
      status:
        value.acknowledgement
          ?.status ||
        "Not Required",

      acknowledgedAt:
        value.acknowledgement
          ?.acknowledgedAt ||
        null,

      comments:
        value.acknowledgement
          ?.comments ||
        "",
    },

    status:
      value.status,

    verification: {
      status:
        value.verification
          ?.status ||
        "Pending",

      rejectionReason:
        value.verification
          ?.rejectionReason ||
        "",
    },

    currentVersionNumber:
      value.currentVersionNumber,

    versions: (
      value.versions || []
    ).map((version) => ({
      _id: version._id,

      versionNumber:
        version.versionNumber,

      uploadedAt:
        version.uploadedAt,

      active:
        Boolean(version.active),

      file: {
        originalFileName:
          version.file
            ?.originalFileName ||
          "",

        mimeType:
          version.file
            ?.mimeType ||
          "",

        sizeBytes:
          version.file
            ?.sizeBytes ||
          0,
      },
    })),

    createdAt:
      value.createdAt,

    updatedAt:
      value.updatedAt,
  };
};

const serializeDocumentForRequest = (
  req,
  document
) =>
  isHrUser(req)
    ? serializeDocument(document)
    : serializeEmployeeDocument(
        document
      );

const getEmployeeForAccess =
  async ({
    req,
    employeeId,
  }) => {
    if (isHrUser(req)) {
      return HREmployee.findOne({
        employeeId:
          normalizeString(
            employeeId
          ),
      });
    }

    const userId =
      getUserId(req.user);

    if (!userId) {
      return null;
    }

    /*
     * A self-service user must match
     * both the requested employee and
     * the employee's linked user ID.
     */
    return HREmployee.findOne({
      employeeId:
        normalizeString(
          employeeId
        ),

      linkedUserId: userId,
    });
  };

const canReadDocument = (
  req,
  document
) => {
  if (isHrUser(req)) {
    return true;
  }

  return (
    normalizeString(
      document.linkedUserId
    ) === getUserId(req.user) &&
    document.confidentialityLevel ===
      "Employee Visible" &&
    document.archived !== true &&
    !EMPLOYEE_INACCESSIBLE_DOCUMENT_STATUSES.includes(
      document.status
    )
  );
};

const canDownloadDocument = (
  req,
  document
) => {
  if (isHrUser(req)) {
    return document.archived !== true;
  }

  return (
    canReadDocument(
      req,
      document
    ) &&
    document.employeeCanDownload ===
      true &&
    document.status !== "Rejected"
  );
};

const sendControllerError = (
  res,
  error,
  fallbackMessage
) =>
  res
    .status(
      error.statusCode || 400
    )
    .json({
      success: false,

      message:
        error.message ||
        fallbackMessage,

      ...(error.data
        ? {
            data: error.data,
          }
        : {}),
    });

const uploadControlledDocument =
  async (req, res) => {
    let storedFile = null;

    try {
      const employee =
        await getEmployeeForAccess({
          req,
          employeeId:
            req.params.employeeId,
        });

      if (!employee) {
        return res
          .status(
            isHrUser(req)
              ? 404
              : 403
          )
          .json({
            success: false,

            message:
              isHrUser(req)
                ? "Employee was not found."
                : "Access denied. You may upload documents only to your linked employee record.",
          });
      }

      if (!req.file?.buffer) {
        return res.status(400).json({
          success: false,
          message:
            "A document file is required.",
        });
      }

      const documentName =
        normalizeString(
          req.body.documentName
        ) ||
        req.file.originalname;

      const documentType =
        normalizeString(
          req.body.documentType
        ) || "Other";

      const hrUser =
        isHrUser(req);

      /*
       * Self-service users cannot
       * classify their own uploads as
       * restricted records.
       */
      const confidentialityLevel =
        hrUser
          ? normalizeString(
              req.body
                .confidentialityLevel
            ) ||
            "Employee Visible"
          : "Employee Visible";

      const employeeCanDownload =
        confidentialityLevel ===
          "Employee Visible" &&
        normalizeBoolean(
          req.body
            .employeeCanDownload,
          true
        );

      storedFile =
        await uploadEmploymentDocumentBuffer(
          {
            buffer:
              req.file.buffer,

            employeeId:
              employee.employeeId,

            originalFileName:
              req.file
                .originalname,

            mimeType:
              req.file.mimetype,
          }
        );

      const userName =
        getUserName(req.user);

      const userId =
        getUserId(req.user);

      const uploadedAt =
        new Date();

      const document =
        new EmploymentDocument({
          documentNumber:
            createDocumentNumber(
              employee.employeeId
            ),

          employeeId:
            employee.employeeId,

          linkedUserId:
            employee.linkedUserId ||
            "",

          employeeSnapshot:
            buildEmployeeSnapshot(
              employee
            ),

          documentName,
          documentType,

          description:
            normalizeString(
              req.body.description
            ),

          confidentialityLevel,
          employeeCanDownload,

          issueDate:
            normalizeString(
              req.body.issueDate
            ),

          effectiveDate:
            normalizeString(
              req.body
                .effectiveDate
            ),

          expiryDate:
            normalizeString(
              req.body.expiryDate
            ),

          expiryTrackingRequired:
            normalizeBoolean(
              req.body
                .expiryTrackingRequired,
              false
            ),

          reminderDaysBeforeExpiry:
            normalizeReminderDays(
              req.body
                .reminderDaysBeforeExpiry
            ),

          acknowledgementRequired:
            normalizeBoolean(
              req.body
                .acknowledgementRequired,
              false
            ),

          acknowledgementDueDate:
            normalizeString(
              req.body
                .acknowledgementDueDate
            ),

          status:
            "Pending Verification",

          verification: {
            status: "Pending",
          },

          currentVersionNumber: 1,

          versions: [
            {
              versionNumber: 1,
              file: storedFile,

              changeReason:
                "Initial controlled document upload.",

              uploadedBy:
                userName,

              uploadedByUserId:
                userId,

              uploadedAt,

              active: true,
            },
          ],

          sourceType:
            "New Upload",

          sourceReference:
            normalizeString(
              req.body
                .sourceReference
            ),

          createdBy:
            userName,

          createdByUserId:
            userId,

          updatedBy:
            userName,
        });

      appendHistory({
        document,

        action:
          "Uploaded",

        fromStatus: "",

        toStatus:
          "Pending Verification",

        notes:
          "Controlled document uploaded to authenticated Cloudinary storage.",

        user: req.user,
      });

      await document.save();

      /*
       * Audit failure must not make a
       * successful committed upload look
       * unsuccessful.
       */
      try {
        await writeAuditLog({
          req,

          action:
            "UPLOAD_EMPLOYMENT_DOCUMENT",

          module: "HR",

          description:
            `Employment document ${document.documentNumber} uploaded.`,

          targetType:
            "EmploymentDocument",

          targetId:
            document.documentNumber,

          afterValues:
            serializeDocument(
              document
            ),

          metadata: {
            employeeId:
              document.employeeId,

            documentType:
              document.documentType,

            confidentialityLevel:
              document
                .confidentialityLevel,

            checksumSha256:
              storedFile
                .checksumSha256,
          },
        });
      } catch (auditError) {
        console.error(
          "Employment document upload audit error:",
          auditError
        );
      }

      return res
        .status(201)
        .json({
          success: true,

          message:
            "Controlled employment document uploaded successfully",

          data:
  serializeDocumentForRequest(
    req,
    document
  ),
        });
    } catch (error) {
      /*
       * If Cloudinary succeeded but the
       * database record failed, remove
       * only that new uncommitted asset.
       */
      if (
        storedFile?.storageKey
      ) {
        try {
          await destroyEmploymentDocumentAsset(
            {
              storageKey:
                storedFile
                  .storageKey,

              resourceType:
                storedFile
                  .resourceType,

              deliveryType:
                storedFile
                  .deliveryType,
            }
          );
        } catch (cleanupError) {
          console.error(
            "Failed upload cleanup error:",
            cleanupError
          );
        }
      }

      console.error(
        "Controlled document upload error:",
        error
      );

      return sendControllerError(
        res,
        error,
        "Could not upload the employment document."
      );
    }
  };

const getControlledEmployeeDocuments =
  async (req, res) => {
    try {
      const employee =
        await getEmployeeForAccess({
          req,

          employeeId:
            req.params.employeeId,
        });

            if (!employee) {
        if (!isHrUser(req)) {
          await writeAuditLog({
            req,
            action:
              "DENY_CROSS_EMPLOYEE_DOCUMENT_ACCESS",
            module: "HR",
            description:
              "An employee was denied access to another employee's controlled document register.",
            targetType:
              "HREmployee",
            targetId:
              normalizeString(
                req.params.employeeId
              ),
            status: "Failed",
            metadata: {
              accessScope:
                "Employee Self-Service",
              denialReason:
                "Employee ownership mismatch",
            },
          });
        }

        return res
          .status(
            isHrUser(req)
              ? 404
              : 403
          )
          .json({
            success: false,

            message:
              isHrUser(req)
                ? "Employee was not found."
                : "Access denied.",
          });
      }

      const filter = {
        employeeId:
          employee.employeeId,

        archived: false,
      };

      if (!isHrUser(req)) {
        filter.linkedUserId =
          getUserId(req.user);

        filter.confidentialityLevel =
          "Employee Visible";
      }

      const status =
        normalizeString(
          req.query.status
        );

      const documentType =
        normalizeString(
          req.query.documentType
        );

      if (status) {
        filter.status =
          status;
      }

      if (documentType) {
        filter.documentType =
          documentType;
      }

      const documents =
        await EmploymentDocument.find(
          filter
        ).sort({
          createdAt: -1,
          _id: -1,
        });

              await writeAuditLog({
        req,
        action: isHrUser(req)
          ? "VIEW_EMPLOYMENT_DOCUMENTS"
          : "VIEW_OWN_EMPLOYMENT_DOCUMENTS",
        module: "HR",
        description: isHrUser(req)
          ? "Authorized HR user viewed a controlled employment-document register."
          : "Employee viewed documents assigned to their own linked employee profile.",
        targetType:
          "HREmployee",
        targetId:
          employee.employeeId,
        metadata: {
          accessScope: isHrUser(req)
            ? "HR Administration"
            : "Employee Self-Service",
          status,
          documentType,
          returnedRecords:
            documents.length,
        },
      });

      return res.json({
        success: true,

        message:
          "Controlled employment documents retrieved successfully",

        totalRecords:
          documents.length,

        data:
  documents.map(
    (document) =>
      serializeDocumentForRequest(
        req,
        document
      )
  ),
      });
    } catch (error) {
      console.error(
        "Get controlled documents error:",
        error
      );

      return sendControllerError(
        res,
        error,
        "Could not retrieve employment documents."
      );
    }
  };

const getControlledDocumentByNumber =
  async (req, res) => {
    try {
      const document =
        await EmploymentDocument.findOne(
          {
            documentNumber:
              normalizeString(
                req.params
                  .documentNumber
              ).toUpperCase(),
          }
        );

      if (!document) {
        return res
          .status(404)
          .json({
            success: false,

            message:
              "Employment document was not found.",
          });
      }

            if (
        !canReadDocument(
          req,
          document
        )
      ) {
        await writeAuditLog({
          req,
          action:
            "DENY_EMPLOYMENT_DOCUMENT_ACCESS",
          module: "HR",
          description:
            "Access to a controlled employment document was denied.",
          targetType:
            "EmploymentDocument",
          targetId:
            document.documentNumber,
          status: "Failed",
          metadata: {
            accessScope:
              "Employee Self-Service",
            denialReason:
              "Ownership, visibility or lifecycle restriction",
          },
        });

        return res
          .status(403)
          .json({
            success: false,
            message:
              "Access denied.",
          });
      }

      await writeAuditLog({
        req,
        action: isHrUser(req)
          ? "VIEW_EMPLOYMENT_DOCUMENT"
          : "VIEW_OWN_EMPLOYMENT_DOCUMENT",
        module: "HR",
        description: isHrUser(req)
          ? `Authorized HR user viewed ${document.documentNumber}.`
          : `Employee viewed assigned document ${document.documentNumber}.`,
        targetType:
          "EmploymentDocument",
        targetId:
          document.documentNumber,
        metadata: {
          accessScope: isHrUser(req)
            ? "HR Administration"
            : "Employee Self-Service",
          employeeId:
            document.employeeId,
          documentType:
            document.documentType,
        },
      });

      return res.json({
        success: true,

        message:
          "Controlled employment document retrieved successfully",

        data:
  serializeDocumentForRequest(
    req,
    document
  ),
      });
    } catch (error) {
      console.error(
        "Get controlled document error:",
        error
      );

      return sendControllerError(
        res,
        error,
        "Could not retrieve the employment document."
      );
    }
  };

const createControlledDownload =
  async (req, res) => {
    try {
      const document =
        await EmploymentDocument.findOne(
          {
            documentNumber:
              normalizeString(
                req.params
                  .documentNumber
              ).toUpperCase(),

            archived: false,
          }
        );

      if (!document) {
        return res
          .status(404)
          .json({
            success: false,

            message:
              "Employment document was not found.",
          });
      }

            if (
        !canDownloadDocument(
          req,
          document
        )
      ) {
        await writeAuditLog({
          req,
          action:
            "DENY_EMPLOYMENT_DOCUMENT_DOWNLOAD",
          module: "HR",
          description:
            "A controlled employment-document download was denied.",
          targetType:
            "EmploymentDocument",
          targetId:
            document.documentNumber,
          status: "Failed",
          metadata: {
            accessScope: isHrUser(req)
              ? "HR Administration"
              : "Employee Self-Service",
            denialReason:
              "Ownership, visibility, download or lifecycle restriction",
          },
        });

        return res
          .status(403)
          .json({
            success: false,

            message:
              "You are not authorized to download this document.",
          });
      }

      const activeVersion =
        document.versions.find(
          (version) =>
            version.active
        );

      if (
        !activeVersion?.file
          ?.storageKey
      ) {
        return res
          .status(409)
          .json({
            success: false,

            message:
              "The active document version has no controlled storage evidence.",
          });
      }

      const downloadUrl =
        generateSignedDocumentUrl({
          storageKey:
            activeVersion.file
              .storageKey,

          resourceType:
            activeVersion.file
              .resourceType,

          deliveryType:
            activeVersion.file
              .deliveryType,

          format:
            activeVersion.file
              .format,

          expiresInSeconds:
            300,

          attachment: true,
        });

      document.lastAccessedAt =
        new Date();

      document.lastAccessedBy =
        getUserName(req.user);

      document.accessCount =
        Number(
          document.accessCount ||
            0
        ) + 1;

      document.updatedBy =
        getUserName(req.user);

      appendHistory({
        document,

        action:
          "Download Authorized",

        fromStatus:
          document.status,

        toStatus:
          document.status,

        notes:
          "A five-minute signed download URL was issued.",

        user: req.user,
      });

      await document.save();

      try {
        await writeAuditLog({
          req,

          action:
            "DOWNLOAD_EMPLOYMENT_DOCUMENT",

          module: "HR",

          description:
            `Signed download authorized for ${document.documentNumber}.`,

          targetType:
            "EmploymentDocument",

          targetId:
            document.documentNumber,

          metadata: {
            employeeId:
              document.employeeId,

            versionNumber:
              activeVersion
                .versionNumber,

            expiresInSeconds:
              300,
          },
        });
      } catch (auditError) {
        console.error(
          "Employment document download audit error:",
          auditError
        );
      }

      return res.json({
        success: true,

        message:
          "Secure document download authorized successfully",

        data: {
          documentNumber:
            document.documentNumber,

          fileName:
            activeVersion.file
              .originalFileName,

          downloadUrl,

          expiresInSeconds:
            300,
        },
      });
    } catch (error) {
      console.error(
        "Controlled document download error:",
        error
      );

      return sendControllerError(
        res,
        error,
        "Could not authorize the document download."
      );
    }
  };

module.exports = {
  uploadControlledDocument,
  getControlledEmployeeDocuments,
  getControlledDocumentByNumber,
  createControlledDownload,
};