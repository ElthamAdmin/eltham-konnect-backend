const EmployeeRelationsCase = require(
  "../models/EmployeeRelationsCase"
);

const {
  writeAuditLog,
} = require(
  "../utils/auditLogger"
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
      user?.email ||
      "System"
  );

const getCaseNumber = (req) =>
  normalizeString(
    req.params.caseNumber
  ).toUpperCase();

const getCaseRecord = async (
  req,
  res
) => {
  const caseNumber =
    getCaseNumber(req);

  const record =
    await EmployeeRelationsCase
      .findOne({
        caseNumber,
      });

  if (!record) {
    res.status(404).json({
      success: false,
      message:
        "Controlled employee-relations case not found.",
    });

    return null;
  }

  return record;
};

const addHistory = ({
  record,
  action,
  fromStatus,
  toStatus,
  notes,
  req,
}) => {
  record.history.push({
    action,
    fromStatus,
    toStatus,
    notes:
      normalizeString(notes),
    performedBy:
      getUserName(req.user),
    performedByUserId:
      getUserId(req.user),
    performedAt:
      new Date(),
  });
};

const auditTransition = async ({
  req,
  record,
  action,
  description,
  fromStatus,
  toStatus,
  metadata = {},
}) => {
  await writeAuditLog({
    req,
    action,
    module: "HR",
    description,
    targetType:
      "EmployeeRelationsCase",
    targetId:
      record.caseNumber,
    metadata: {
      caseType:
        record.caseType,
      subjectEmployeeId:
        record.subjectEmployeeId,
      complainantEmployeeId:
        record.complainantEmployeeId,
      ...metadata,
    },
    beforeValues: {
      status: fromStatus,
    },
    afterValues: {
      status: toStatus,
    },
  });
};

const sendWorkflowError = (
  res,
  error,
  fallbackMessage
) => {
  if (
    error?.name ===
    "ValidationError"
  ) {
    return res
      .status(400)
      .json({
        success: false,
        message:
          error.message,
      });
  }

  console.error(
    fallbackMessage,
    error
  );

  return res
    .status(500)
    .json({
      success: false,
      message:
        fallbackMessage,
      error:
        error.message,
    });
};

const submitDisciplineCase =
  async (req, res) => {
    try {
      const record =
        await getCaseRecord(
          req,
          res
        );

      if (!record) {
        return;
      }

      if (
        record.caseType !==
        "Discipline"
      ) {
        return res
          .status(409)
          .json({
            success: false,
            message:
              "Only discipline case drafts use this submission workflow.",
          });
      }

      if (
        record.status !==
        "Draft"
      ) {
        return res
          .status(409)
          .json({
            success: false,
            message:
              `Only a Draft discipline case can be submitted. Current status: ${record.status}.`,
          });
      }

      if (
        !Array.isArray(
          record.allegations
        ) ||
        record
          .allegations
          .length === 0
      ) {
        return res
          .status(400)
          .json({
            success: false,
            message:
              "At least one clearly described allegation is required before submission.",
          });
      }

      const submissionNotes =
        normalizeString(
          req.body
            .submissionNotes
        );

      if (!submissionNotes) {
        return res
          .status(400)
          .json({
            success: false,
            message:
              "Discipline case submission notes are required.",
          });
      }

      const fromStatus =
        record.status;

      record.status =
        "Submitted";

      record.updatedBy =
        getUserName(
          req.user
        );

      addHistory({
        record,
        action:
          "Submitted",
        fromStatus,
        toStatus:
          record.status,
        notes:
          submissionNotes,
        req,
      });

      await record.save();

      await auditTransition({
        req,
        record,
        action:
          "Discipline Case Submitted",
        description:
          `Restricted discipline case ${record.caseNumber} was submitted for review.`,
        fromStatus,
        toStatus:
          record.status,
      });

      return res.json({
        success: true,
        message:
          `${record.caseNumber} submitted successfully.`,
        data: record,
      });
    } catch (error) {
      return sendWorkflowError(
        res,
        error,
        "Failed to submit the controlled discipline case."
      );
    }
  };

const startCaseInvestigation =
  async (req, res) => {
    try {
      const record =
        await getCaseRecord(
          req,
          res
        );

      if (!record) {
        return;
      }

      const allowedStatuses = [
        "Submitted",
        "Under Review",
      ];

      if (
        !allowedStatuses.includes(
          record.status
        )
      ) {
        return res
          .status(409)
          .json({
            success: false,
            message:
              `Only Submitted or Under Review cases can enter investigation. Current status: ${record.status}.`,
          });
      }

      const investigationNotes =
        normalizeString(
          req.body
            .investigationNotes
        );

      if (
        !investigationNotes
      ) {
        return res
          .status(400)
          .json({
            success: false,
            message:
              "Investigation-opening notes are required.",
          });
      }

      const assignedTo =
        normalizeString(
          req.body.assignedTo
        );

      const assignedToUserId =
        normalizeString(
          req.body
            .assignedToUserId
        );

      if (
        !assignedTo ||
        !assignedToUserId
      ) {
        return res
          .status(400)
          .json({
            success: false,
            message:
              "The assigned investigator name and user ID are required.",
          });
      }

      const fromStatus =
        record.status;

      record.status =
        "Investigation";

      record.assignedTo =
        assignedTo;

      record.assignedToUserId =
        assignedToUserId;

      record.authorizedUserIds =
        Array.from(
          new Set(
            [
              ...(record
                .authorizedUserIds ||
                []),
              assignedToUserId,
            ].filter(
              Boolean
            )
          )
        );

      record.updatedBy =
        getUserName(
          req.user
        );

      addHistory({
        record,
        action:
          "Investigation Started",
        fromStatus,
        toStatus:
          record.status,
        notes:
          investigationNotes,
        req,
      });

      await record.save();

      await auditTransition({
        req,
        record,
        action:
          "Employee Relations Investigation Started",
        description:
          `Investigation started for restricted case ${record.caseNumber}.`,
        fromStatus,
        toStatus:
          record.status,
        metadata: {
          assignedTo,
          assignedToUserId,
        },
      });

      return res.json({
        success: true,
        message:
          `${record.caseNumber} moved to Investigation successfully.`,
        data: record,
      });
    } catch (error) {
      return sendWorkflowError(
        res,
        error,
        "Failed to start the controlled case investigation."
      );
    }
  };

const scheduleCaseHearing =
  async (req, res) => {
    try {
      const record =
        await getCaseRecord(
          req,
          res
        );

      if (!record) {
        return;
      }

      const allowedStatuses = [
        "Submitted",
        "Under Review",
        "Investigation",
      ];

      if (
        !allowedStatuses.includes(
          record.status
        )
      ) {
        return res
          .status(409)
          .json({
            success: false,
            message:
              `A hearing cannot be scheduled from ${record.status}.`,
          });
      }

      const hearingDate =
        normalizeString(
          req.body
            .hearingDate
        );

      const chairperson =
        normalizeString(
          req.body
            .chairperson
        );

      const schedulingNotes =
        normalizeString(
          req.body
            .schedulingNotes
        );

      if (
        !hearingDate ||
        !chairperson ||
        !schedulingNotes
      ) {
        return res
          .status(400)
          .json({
            success: false,
            message:
              "Hearing date, chairperson and scheduling notes are required.",
          });
      }

      const attendees =
        Array.isArray(
          req.body.attendees
        )
          ? req.body
              .attendees
              .map(
                (attendee) => ({
                  name:
                    normalizeString(
                      attendee?.name
                    ),
                  role:
                    normalizeString(
                      attendee?.role
                    ),
                  userId:
                    normalizeString(
                      attendee?.userId
                    ),
                })
              )
              .filter(
                (attendee) =>
                  attendee.name
              )
          : [];

      const hearingNumber =
        `HRG-${Date.now()}-${Math.floor(
          1000 +
            Math.random() *
              9000
        )}`;

      const employeeNotified =
        req.body
          .employeeNotified ===
          true;

      record.hearings.push({
        hearingNumber,
        hearingDate,

        startTime:
          normalizeString(
            req.body
              .startTime
          ),

        location:
          normalizeString(
            req.body.location
          ),

        chairperson,
        attendees,

        status:
          "Scheduled",

        employeeNotifiedAt:
          employeeNotified
            ? new Date()
            : null,

        notes:
          schedulingNotes,

        createdBy:
          getUserName(
            req.user
          ),

        createdByUserId:
          getUserId(
            req.user
          ),
      });

      const fromStatus =
        record.status;

      record.status =
        "Hearing Scheduled";

      record.updatedBy =
        getUserName(
          req.user
        );

      addHistory({
        record,
        action:
          "Hearing Scheduled",
        fromStatus,
        toStatus:
          record.status,
        notes:
          `${hearingNumber}: ${schedulingNotes}`,
        req,
      });

      await record.save();

      await auditTransition({
        req,
        record,
        action:
          "Employee Relations Hearing Scheduled",
        description:
          `Hearing ${hearingNumber} was scheduled for case ${record.caseNumber}.`,
        fromStatus,
        toStatus:
          record.status,
        metadata: {
          hearingNumber,
          hearingDate,
          employeeNotified,
        },
      });

      return res.json({
        success: true,
        message:
          `${hearingNumber} scheduled successfully.`,
        data: record,
      });
    } catch (error) {
      return sendWorkflowError(
        res,
        error,
        "Failed to schedule the controlled case hearing."
      );
    }
  };

const completeCaseHearing =
  async (req, res) => {
    try {
      const record =
        await getCaseRecord(
          req,
          res
        );

      if (!record) {
        return;
      }

      if (
        record.status !==
        "Hearing Scheduled"
      ) {
        return res
          .status(409)
          .json({
            success: false,
            message:
              `A hearing can be completed only while the case is Hearing Scheduled. Current status: ${record.status}.`,
          });
      }

      const hearingNumber =
        normalizeString(
          req.params
            .hearingNumber
        );

      const hearing =
        record.hearings.find(
          (item) =>
            item
              .hearingNumber ===
            hearingNumber
        );

      if (!hearing) {
        return res
          .status(404)
          .json({
            success: false,
            message:
              "Controlled case hearing not found.",
          });
      }

      if (
        hearing.status !==
        "Scheduled"
      ) {
        return res
          .status(409)
          .json({
            success: false,
            message:
              `${hearingNumber} cannot be completed from ${hearing.status}.`,
          });
      }

      const hearingNotes =
        normalizeString(
          req.body
            .hearingNotes
        );

      if (!hearingNotes) {
        return res
          .status(400)
          .json({
            success: false,
            message:
              "Completed hearing notes are required.",
          });
      }

      hearing.status =
        "Completed";

      hearing.notes =
        hearingNotes;

      hearing.minutesDocumentNumber =
        normalizeString(
          req.body
            .minutesDocumentNumber
        );

      const fromStatus =
        record.status;

      record.status =
        "Awaiting Decision";

      record.updatedBy =
        getUserName(
          req.user
        );

      addHistory({
        record,
        action:
          "Hearing Completed",
        fromStatus,
        toStatus:
          record.status,
        notes:
          `${hearingNumber}: ${hearingNotes}`,
        req,
      });

      await record.save();

      await auditTransition({
        req,
        record,
        action:
          "Employee Relations Hearing Completed",
        description:
          `Hearing ${hearingNumber} was completed for case ${record.caseNumber}.`,
        fromStatus,
        toStatus:
          record.status,
        metadata: {
          hearingNumber,
          minutesDocumentNumber:
            hearing
              .minutesDocumentNumber,
        },
      });

      return res.json({
        success: true,
        message:
          `${hearingNumber} completed successfully. The case is awaiting a decision.`,
        data: record,
      });
    } catch (error) {
      return sendWorkflowError(
        res,
        error,
        "Failed to complete the controlled case hearing."
      );
    }
  };

module.exports = {
  submitDisciplineCase,
  startCaseInvestigation,
  scheduleCaseHearing,
  completeCaseHearing,
};