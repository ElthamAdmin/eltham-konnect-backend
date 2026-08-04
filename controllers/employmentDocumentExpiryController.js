const EmploymentDocument = require(
  "../models/EmploymentDocument"
);

const {
  writeAuditLog,
} = require("../utils/auditLogger");

const YMD_PATTERN =
  /^\d{4}-\d{2}-\d{2}$/;

const getUserName = (user) =>
  user?.fullName ||
  user?.name ||
  user?.email ||
  "System User";

const getUserId = (user) =>
  String(
    user?.userId ||
      user?._id ||
      user?.id ||
      ""
  ).trim();

const normalizeDocumentNumber = (
  value
) => String(value || "").trim().toUpperCase();

const getJamaicaDateKey = (
  date = new Date()
) => {
  const parts =
    new Intl.DateTimeFormat(
      "en-CA",
      {
        timeZone:
          "America/Jamaica",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }
    ).formatToParts(date);

  const values =
    parts.reduce(
      (result, part) => {
        if (
          part.type !==
          "literal"
        ) {
          result[part.type] =
            part.value;
        }

        return result;
      },
      {}
    );

  return `${values.year}-${values.month}-${values.day}`;
};

const isValidYmdDate = (
  value
) => {
  const text =
    String(value || "").trim();

  if (
    !YMD_PATTERN.test(text)
  ) {
    return false;
  }

  const date = new Date(
    `${text}T12:00:00.000Z`
  );

  return (
    !Number.isNaN(
      date.getTime()
    ) &&
    date
      .toISOString()
      .slice(0, 10) === text
  );
};

const calculateDaysBetween = (
  fromDate,
  toDate
) => {
  const from = new Date(
    `${fromDate}T12:00:00.000Z`
  );

  const to = new Date(
    `${toDate}T12:00:00.000Z`
  );

  return Math.round(
    (to.getTime() -
      from.getTime()) /
      86400000
  );
};

const normalizeReminderDays = (
  values
) =>
  [
    ...new Set(
      (
        Array.isArray(values)
          ? values
          : []
      )
        .map((value) =>
          Number(value)
        )
        .filter(
          (value) =>
            Number.isFinite(
              value
            ) &&
            value >= 0
        )
        .map((value) =>
          Math.round(value)
        )
    ),
  ].sort(
    (left, right) =>
      right - left
  );

const getApplicableReminderDay = ({
  daysRemaining,
  reminderDays,
}) => {
  if (daysRemaining < 0) {
    return null;
  }

  const ascending =
    [...reminderDays].sort(
      (left, right) =>
        left - right
    );

  return (
    ascending.find(
      (reminderDay) =>
        daysRemaining <=
        reminderDay
    ) ?? null
  );
};

const wasReminderRecordedToday = (
  document,
  asOfDate
) => {
  if (
    !document
      .lastExpiryReminderAt
  ) {
    return false;
  }

  return (
    getJamaicaDateKey(
      new Date(
        document
          .lastExpiryReminderAt
      )
    ) === asOfDate
  );
};

const buildExpiryRecord = ({
  document,
  asOfDate,
}) => {
  const daysRemaining =
    calculateDaysBetween(
      asOfDate,
      document.expiryDate
    );

  const reminderDays =
    normalizeReminderDays(
      document
        .reminderDaysBeforeExpiry
    );

  const applicableReminderDay =
    getApplicableReminderDay({
      daysRemaining,
      reminderDays,
    });

  const reminderRecordedToday =
    wasReminderRecordedToday(
      document,
      asOfDate
    );

  let expiryStatus =
    "Current";

  if (daysRemaining < 0) {
    expiryStatus = "Expired";
  } else if (
    daysRemaining === 0
  ) {
    expiryStatus = "Expires Today";
  } else if (
    applicableReminderDay !==
    null
  ) {
    expiryStatus =
      "Reminder Due";
  }

  return {
    documentNumber:
      document.documentNumber,
    employeeId:
      document.employeeId,
    employeeName:
      document.employeeSnapshot
        ?.fullName || "",
    documentName:
      document.documentName,
    documentType:
      document.documentType,
    documentStatus:
      document.status,
    expiryDate:
      document.expiryDate,
    daysRemaining,
    expiryStatus,
    reminderDaysBeforeExpiry:
      reminderDays,
    applicableReminderDay,
    reminderRecordedToday,
    reminderRequired:
      expiryStatus ===
        "Reminder Due" &&
      !reminderRecordedToday,
    lastExpiryReminderAt:
      document
        .lastExpiryReminderAt ||
      null,
  };
};

const appendHistory = ({
  document,
  action,
  fromStatus,
  toStatus,
  notes,
  user,
}) => {
  document.history =
    document.history || [];

  document.history.push({
    action,
    fromStatus,
    toStatus,
    performedBy:
      getUserName(user),
    performedByUserId:
      getUserId(user),
    performedAt: new Date(),
    notes:
      String(notes || "").trim(),
  });
};

const getEmploymentDocumentExpiryMonitor =
  async (req, res) => {
    try {
      const requestedAsOf =
        String(
          req.query.asOf || ""
        ).trim();

      const asOfDate =
        requestedAsOf ||
        getJamaicaDateKey();

      if (
        !isValidYmdDate(
          asOfDate
        )
      ) {
        return res.status(400).json({
          success: false,
          message:
            "The expiry-monitor as-of date must use YYYY-MM-DD.",
        });
      }

      const documents =
        await EmploymentDocument.find(
          {
            expiryTrackingRequired:
              true,
            expiryDate: {
              $ne: "",
            },
            archived: {
              $ne: true,
            },
            status: {
              $nin: [
                "Archived",
                "Cancelled",
                "Superseded",
              ],
            },
          }
        ).sort({
          expiryDate: 1,
          employeeId: 1,
          documentNumber: 1,
        });

      const records =
        documents.map(
          (document) =>
            buildExpiryRecord({
              document,
              asOfDate,
            })
        );

      const summary = {
        totalTracked:
          records.length,
        expired:
          records.filter(
            (record) =>
              record.expiryStatus ===
              "Expired"
          ).length,
        expiresToday:
          records.filter(
            (record) =>
              record.expiryStatus ===
              "Expires Today"
          ).length,
        remindersDue:
          records.filter(
            (record) =>
              record
                .reminderRequired
          ).length,
        current:
          records.filter(
            (record) =>
              record.expiryStatus ===
              "Current"
          ).length,
      };

      return res.json({
        success: true,
        message:
          "Employment-document expiry monitor generated successfully.",
        asOfDate,
        summary,
        data: records,
      });
    } catch (error) {
      console.error(
        "Get employment document expiry monitor error:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          "Failed to generate the employment-document expiry monitor.",
        error: error.message,
      });
    }
  };

const recordEmploymentDocumentExpiryReminder =
  async (req, res) => {
    try {
      const documentNumber =
        normalizeDocumentNumber(
          req.params.documentNumber
        );

      const document =
        await EmploymentDocument.findOne({
          documentNumber,
        });

      if (!document) {
        return res.status(404).json({
          success: false,
          message:
            "Controlled employment document was not found.",
        });
      }

      if (
        document.archived ||
        [
          "Archived",
          "Cancelled",
          "Superseded",
        ].includes(
          document.status
        )
      ) {
        return res.status(409).json({
          success: false,
          message:
            `${document.documentNumber} cannot receive an expiry reminder while its status is ${document.status}.`,
        });
      }

      if (
        !document
          .expiryTrackingRequired ||
        !document.expiryDate
      ) {
        return res.status(409).json({
          success: false,
          message:
            `${document.documentNumber} does not have active expiry tracking.`,
        });
      }

      const reminderNotes =
        String(
          req.body
            .reminderNotes || ""
        ).trim();

      if (!reminderNotes) {
        return res.status(400).json({
          success: false,
          message:
            "Expiry-reminder notes are required.",
        });
      }

      const asOfDate =
        getJamaicaDateKey();

      const expiryRecord =
        buildExpiryRecord({
          document,
          asOfDate,
        });

      if (
        expiryRecord
          .daysRemaining < 0
      ) {
        return res.status(409).json({
          success: false,
          message:
            `${document.documentNumber} has already expired and requires controlled expiration processing.`,
          data: expiryRecord,
        });
      }

      const beforeValues = {
        lastExpiryReminderAt:
          document
            .lastExpiryReminderAt ||
          null,
      };

      document.lastExpiryReminderAt =
        new Date();

      document.updatedBy =
        getUserName(req.user);

      appendHistory({
        document,
        action:
          "Expiry Reminder Recorded",
        fromStatus:
          document.status,
        toStatus:
          document.status,
        notes:
          `${reminderNotes} Days remaining: ${expiryRecord.daysRemaining}.`,
        user: req.user,
      });

      await document.save();

      await writeAuditLog({
        req,
        action:
          "RECORD_EMPLOYMENT_DOCUMENT_EXPIRY_REMINDER",
        module: "HR",
        description:
          `Expiry reminder recorded for controlled employment document ${document.documentNumber}.`,
        targetType:
          "EmploymentDocument",
        targetId:
          document.documentNumber,
        beforeValues,
        afterValues: {
          lastExpiryReminderAt:
            document
              .lastExpiryReminderAt,
        },
        metadata: {
          employeeId:
            document.employeeId,
          expiryDate:
            document.expiryDate,
          daysRemaining:
            expiryRecord
              .daysRemaining,
          reminderNotes,
        },
      });

      return res.json({
        success: true,
        message:
          `Expiry reminder recorded successfully for ${document.documentNumber}.`,
        data:
          buildExpiryRecord({
            document,
            asOfDate,
          }),
      });
    } catch (error) {
      console.error(
        "Record employment document expiry reminder error:",
        error
      );

      return res.status(400).json({
        success: false,
        message:
          error.message ||
          "Failed to record the employment-document expiry reminder.",
      });
    }
  };

const expireControlledDocument =
  async (req, res) => {
    try {
      const documentNumber =
        normalizeDocumentNumber(
          req.params.documentNumber
        );

      const document =
        await EmploymentDocument.findOne({
          documentNumber,
        });

      if (!document) {
        return res.status(404).json({
          success: false,
          message:
            "Controlled employment document was not found.",
        });
      }

      if (
        document.status ===
        "Expired"
      ) {
        return res.status(409).json({
          success: false,
          message:
            `${document.documentNumber} is already expired.`,
        });
      }

      if (
        document.archived ||
        [
          "Archived",
          "Cancelled",
          "Superseded",
        ].includes(
          document.status
        )
      ) {
        return res.status(409).json({
          success: false,
          message:
            `${document.documentNumber} cannot be expired while its status is ${document.status}.`,
        });
      }

      if (
        !document
          .expiryTrackingRequired ||
        !document.expiryDate
      ) {
        return res.status(409).json({
          success: false,
          message:
            `${document.documentNumber} does not have active expiry tracking.`,
        });
      }

      const asOfDate =
        getJamaicaDateKey();

      if (
        document.expiryDate >
        asOfDate
      ) {
        return res.status(409).json({
          success: false,
          message:
            `${document.documentNumber} cannot be marked expired before ${document.expiryDate}.`,
          data: {
            documentNumber:
              document.documentNumber,
            expiryDate:
              document.expiryDate,
            currentDate:
              asOfDate,
            currentStatus:
              document.status,
          },
        });
      }

      const expirationNotes =
        String(
          req.body
            .expirationNotes || ""
        ).trim();

      if (!expirationNotes) {
        return res.status(400).json({
          success: false,
          message:
            "Controlled expiration notes are required.",
        });
      }

      const previousStatus =
        document.status;

      const beforeValues = {
        status:
          document.status,
        expiryDate:
          document.expiryDate,
      };

      document.status =
        "Expired";

      document.updatedBy =
        getUserName(req.user);

      appendHistory({
        document,
        action: "Expired",
        fromStatus:
          previousStatus,
        toStatus: "Expired",
        notes: expirationNotes,
        user: req.user,
      });

      await document.save();

      await writeAuditLog({
        req,
        action:
          "EXPIRE_EMPLOYMENT_DOCUMENT",
        module: "HR",
        description:
          `Controlled employment document ${document.documentNumber} marked expired.`,
        targetType:
          "EmploymentDocument",
        targetId:
          document.documentNumber,
        beforeValues,
        afterValues: {
          status:
            document.status,
          expiryDate:
            document.expiryDate,
        },
        metadata: {
          employeeId:
            document.employeeId,
          expirationNotes,
          processedDate:
            asOfDate,
        },
      });

      return res.json({
        success: true,
        message:
          `${document.documentNumber} marked expired successfully.`,
        data: {
          documentNumber:
            document.documentNumber,
          employeeId:
            document.employeeId,
          documentName:
            document.documentName,
          documentType:
            document.documentType,
          status:
            document.status,
          expiryDate:
            document.expiryDate,
          updatedBy:
            document.updatedBy,
          history:
            document.history || [],
        },
      });
    } catch (error) {
      console.error(
        "Expire controlled employment document error:",
        error
      );

      return res.status(400).json({
        success: false,
        message:
          error.message ||
          "Failed to expire controlled employment document.",
      });
    }
  };

module.exports = {
  getEmploymentDocumentExpiryMonitor,
  recordEmploymentDocumentExpiryReminder,
  expireControlledDocument,
};