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
    document.linkedUserId ===
      getUserId(req.user) &&
    document.confidentialityLevel ===
      "Employee Visible"
  );
};

const canDownloadDocument = (
  req,
  document
) =>
  isHrUser(req) ||
  (
    canReadDocument(
      req,
      document
    ) &&
    document.employeeCanDownload ===
      true
  );

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
            serializeDocument(
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

      return res.json({
        success: true,

        message:
          "Controlled employment documents retrieved successfully",

        totalRecords:
          documents.length,

        data:
          documents.map(
            serializeDocument
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
        return res
          .status(403)
          .json({
            success: false,
            message:
              "Access denied.",
          });
      }

      return res.json({
        success: true,

        message:
          "Controlled employment document retrieved successfully",

        data:
          serializeDocument(
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