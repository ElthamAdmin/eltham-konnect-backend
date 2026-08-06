const EmployeeRelationsCase = require(
  "../models/EmployeeRelationsCase"
);
const HREmployee = require(
  "../models/HREmployee"
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

const isHrUser = (user) => {
  if (user?.role === "Admin") {
    return true;
  }

  return Array.isArray(user?.permissions)
    ? user.permissions.includes("hr")
    : false;
};

const getTodayYmd = () =>
  new Date()
    .toISOString()
    .slice(0, 10);

const createCaseNumber = (
  caseType
) => {
  const prefix =
    caseType === "Grievance"
      ? "GRV"
      : "DIS";

  const random = Math.floor(
    1000 + Math.random() * 9000
  );

  return `ERC-${prefix}-${Date.now()}-${random}`;
};

const createAllegations = (
  values = []
) => {
  if (!Array.isArray(values)) {
    return [];
  }

  return values
    .map((item, index) => ({
      allegationNumber:
        `ALG-${String(
          index + 1
        ).padStart(3, "0")}`,

      description:
        normalizeString(
          typeof item === "string"
            ? item
            : item?.description
        ),

      policyReference:
        normalizeString(
          item?.policyReference
        ),
    }))
    .filter(
      (item) => item.description
    );
};

const employeeSnapshot = (
  employee
) => ({
  employeeId:
    employee?.employeeId || "",

  linkedUserId:
    employee?.linkedUserId || "",

  fullName:
    employee?.fullName || "",

  jobTitle:
    employee?.jobTitle || "",

  department:
    employee?.department || "",

  branch:
    employee?.branch || "",

  employmentStatus:
    employee?.employmentStatus || "",
});

const findLinkedEmployee = async (
  user
) => {
  const linkedEmployeeId =
    normalizeString(
      user?.linkedEmployeeId
    );

  const userId =
    getUserId(user);

  if (linkedEmployeeId) {
    const employee =
      await HREmployee.findOne({
        employeeId:
          linkedEmployeeId,
      });

    if (employee) {
      return employee;
    }
  }

  if (!userId) {
    return null;
  }

  return HREmployee.findOne({
    linkedUserId: userId,
  });
};

const canAccessCase = (
  record,
  user
) => {
  if (isHrUser(user)) {
    return true;
  }

  const userId =
    getUserId(user);

  const linkedEmployeeId =
    normalizeString(
      user?.linkedEmployeeId
    );

  return Boolean(
    (
      userId &&
      [
        record
          .subjectLinkedUserId,
        record
          .complainantLinkedUserId,
      ].includes(userId)
    ) ||
    (
      linkedEmployeeId &&
      [
        record.subjectEmployeeId,
        record
          .complainantEmployeeId,
      ].includes(
        linkedEmployeeId
      )
    )
  );
};

const toEmployeeView = (
  record
) => {
  const data =
    record.toObject
      ? record.toObject()
      : { ...record };

  delete data.authorizedUserIds;
  delete data.assignedToUserId;
  delete data.legacyReference;

  data.evidence =
    (data.evidence || [])
      .filter(
        (item) =>
          !item.confidential
      )
      .map((item) => ({
        evidenceNumber:
          item.evidenceNumber,

        evidenceType:
          item.evidenceType,

        title:
          item.title,

        description:
          item.description,

        status:
          item.status,

        submittedBy:
          item.submittedBy,

        submittedAt:
          item.submittedAt,
      }));

  data.hearings =
    (data.hearings || [])
      .map((hearing) => ({
        hearingNumber:
          hearing.hearingNumber,

        hearingDate:
          hearing.hearingDate,

        startTime:
          hearing.startTime,

        location:
          hearing.location,

        chairperson:
          hearing.chairperson,

        attendees:
          hearing.attendees,

        status:
          hearing.status,

        employeeNotifiedAt:
          hearing.employeeNotifiedAt,
      }));

  data.history =
    (data.history || [])
      .filter((entry) =>
        [
          "Created",
          "Submitted",
          "Hearing Scheduled",
          "Decision Issued",
          "Employee Acknowledged",
          "Appeal Submitted",
          "Appeal Decided",
          "Closed",
          "Withdrawn",
        ].includes(
          entry.action
        )
      );

  if (!data.decision?.issued) {
    data.decision = {
      issued: false,
    };
  }

  return data;
};

const sendControllerError = (
  res,
  error,
  fallbackMessage
) => {
  if (error?.code === 11000) {
    return res
      .status(409)
      .json({
        success: false,
        message:
          "A case with that controlled reference already exists.",
      });
  }

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

const getEmployeeRelationsCases =
  async (req, res) => {
    try {
      const query = {};

      if (
        req.query.caseType
      ) {
        query.caseType =
          normalizeString(
            req.query.caseType
          );
      }

      if (
        req.query.status
      ) {
        query.status =
          normalizeString(
            req.query.status
          );
      }

      if (
        req.query.employeeId
      ) {
        const employeeId =
          normalizeString(
            req.query.employeeId
          );

        query.$or = [
          {
            subjectEmployeeId:
              employeeId,
          },
          {
            complainantEmployeeId:
              employeeId,
          },
          {
            respondentEmployeeIds:
              employeeId,
          },
        ];
      }

      const records =
        await EmployeeRelationsCase
          .find(query)
          .sort({
            createdAt: -1,
          })
          .limit(500);

      return res.json({
        success: true,
        message:
          "Controlled employee-relations cases retrieved successfully.",
        totalRecords:
          records.length,
        data: records,
      });
    } catch (error) {
      return sendControllerError(
        res,
        error,
        "Failed to retrieve controlled employee-relations cases."
      );
    }
  };

const getMyEmployeeRelationsCases =
  async (req, res) => {
    try {
      const employee =
        await findLinkedEmployee(
          req.user
        );

      if (!employee) {
        return res
          .status(403)
          .json({
            success: false,
            message:
              "No linked employee profile was found for this user.",
          });
      }

      const records =
        await EmployeeRelationsCase
          .find({
            $and: [
              {
                $or: [
                  {
                    subjectEmployeeId:
                      employee.employeeId,
                  },
                  {
                    complainantEmployeeId:
                      employee.employeeId,
                  },
                ],
              },
              {
                status: {
                  $nin: [
                    "Draft",
                    "Cancelled",
                  ],
                },
              },
            ],
          })
          .sort({
            createdAt: -1,
          });

      return res.json({
        success: true,
        message:
          "Your controlled employee-relations cases were retrieved successfully.",
        totalRecords:
          records.length,
        data:
          records.map(
            toEmployeeView
          ),
      });
    } catch (error) {
      return sendControllerError(
        res,
        error,
        "Failed to retrieve your employee-relations cases."
      );
    }
  };

const getEmployeeRelationsCaseByNumber =
  async (req, res) => {
    try {
      const caseNumber =
        normalizeString(
          req.params.caseNumber
        ).toUpperCase();

      const record =
        await EmployeeRelationsCase
          .findOne({
            caseNumber,
          });

      if (!record) {
        return res
          .status(404)
          .json({
            success: false,
            message:
              "Controlled employee-relations case not found.",
          });
      }

      if (
        !canAccessCase(
          record,
          req.user
        )
      ) {
        return res
          .status(403)
          .json({
            success: false,
            message:
              "You are not authorized to access this restricted case.",
          });
      }

      await writeAuditLog({
        req,
        action:
          "Employee Relations Case Viewed",
        module: "HR",
        description:
          `Restricted case ${record.caseNumber} was accessed.`,
        targetType:
          "EmployeeRelationsCase",
        targetId:
          record.caseNumber,
        metadata: {
          caseType:
            record.caseType,
          employeeView:
            !isHrUser(
              req.user
            ),
        },
      });

      return res.json({
        success: true,
        message:
          "Controlled employee-relations case retrieved successfully.",
        data:
          isHrUser(req.user)
            ? record
            : toEmployeeView(
                record
              ),
      });
    } catch (error) {
      return sendControllerError(
        res,
        error,
        "Failed to retrieve the controlled employee-relations case."
      );
    }
  };

const createDisciplineCaseDraft =
  async (req, res) => {
    try {
      const subjectEmployeeId =
        normalizeString(
          req.body
            .subjectEmployeeId
        );

      const title =
        normalizeString(
          req.body.title
        );

      const summary =
        normalizeString(
          req.body.summary
        );

      const category =
        normalizeString(
          req.body.category
        );

      if (
        !subjectEmployeeId ||
        !title ||
        !summary ||
        !category
      ) {
        return res
          .status(400)
          .json({
            success: false,
            message:
              "Subject employee, title, summary and category are required.",
          });
      }

      const employee =
        await HREmployee
          .findOne({
            employeeId:
              subjectEmployeeId,
          });

      if (!employee) {
        return res
          .status(404)
          .json({
            success: false,
            message:
              "The subject employee was not found.",
          });
      }

      const actorName =
        getUserName(
          req.user
        );

      const actorUserId =
        getUserId(
          req.user
        );

      const caseNumber =
        createCaseNumber(
          "Discipline"
        );

      const record =
        await EmployeeRelationsCase
          .create({
            caseNumber,
            caseType:
              "Discipline",

            title,
            summary,
            category,

            incidentDate:
              normalizeString(
                req.body
                  .incidentDate
              ),

            reportedDate:
              normalizeString(
                req.body
                  .reportedDate
              ) ||
              getTodayYmd(),

            priority:
              normalizeString(
                req.body.priority
              ) ||
              "Normal",

            confidentialityLevel:
              normalizeString(
                req.body
                  .confidentialityLevel
              ) ||
              "Restricted HR",

            subjectEmployeeId:
              employee.employeeId,

            subjectLinkedUserId:
              employee.linkedUserId ||
              "",

            subjectSnapshot:
              employeeSnapshot(
                employee
              ),

            allegations:
              createAllegations(
                req.body
                  .allegations
              ),

            interimMeasures:
              normalizeString(
                req.body
                  .interimMeasures
              ),

            assignedTo:
              normalizeString(
                req.body
                  .assignedTo
              ),

            assignedToUserId:
              normalizeString(
                req.body
                  .assignedToUserId
              ),

            authorizedUserIds:
              Array.from(
                new Set(
                  [
                    actorUserId,
                    req.body
                      .assignedToUserId,
                  ]
                    .map(
                      normalizeString
                    )
                    .filter(
                      Boolean
                    )
                )
              ),

            status: "Draft",

            employeeAcknowledgement:
              {
                required:
                  false,
                status:
                  "Not Required",
              },

            createdBy:
              actorName,

            createdByUserId:
              actorUserId,

            updatedBy:
              actorName,

            history: [
              {
                action:
                  "Created",
                fromStatus:
                  "",
                toStatus:
                  "Draft",
                notes:
                  "Restricted discipline case draft created.",
                performedBy:
                  actorName,
                performedByUserId:
                  actorUserId,
              },
            ],
          });

      await writeAuditLog({
        req,
        action:
          "Discipline Case Draft Created",
        module: "HR",
        description:
          `Restricted discipline case ${caseNumber} was created.`,
        targetType:
          "EmployeeRelationsCase",
        targetId:
          caseNumber,
        metadata: {
          caseType:
            "Discipline",
          subjectEmployeeId:
            employee.employeeId,
        },
        afterValues: {
          caseNumber,
          status:
            record.status,
          category:
            record.category,
        },
      });

      return res
        .status(201)
        .json({
          success: true,
          message:
            "Restricted discipline case draft created successfully.",
          data: record,
        });
    } catch (error) {
      return sendControllerError(
        res,
        error,
        "Failed to create the restricted discipline case draft."
      );
    }
  };

const submitGrievanceCase =
  async (req, res) => {
    try {
      let employee;

      if (
        isHrUser(req.user) &&
        req.body
          .complainantEmployeeId
      ) {
        employee =
          await HREmployee
            .findOne({
              employeeId:
                normalizeString(
                  req.body
                    .complainantEmployeeId
                ),
            });
      } else {
        employee =
          await findLinkedEmployee(
            req.user
          );
      }

      if (!employee) {
        return res
          .status(403)
          .json({
            success: false,
            message:
              "A linked complainant employee profile is required.",
          });
      }

      const title =
        normalizeString(
          req.body.title
        );

      const summary =
        normalizeString(
          req.body.summary
        );

      const category =
        normalizeString(
          req.body.category
        );

      if (
        !title ||
        !summary ||
        !category
      ) {
        return res
          .status(400)
          .json({
            success: false,
            message:
              "Grievance title, summary and category are required.",
          });
      }

      const actorName =
        getUserName(
          req.user
        );

      const actorUserId =
        getUserId(
          req.user
        );

      const caseNumber =
        createCaseNumber(
          "Grievance"
        );

      const respondentEmployeeIds =
        Array.isArray(
          req.body
            .respondentEmployeeIds
        )
          ? Array.from(
              new Set(
                req.body
                  .respondentEmployeeIds
                  .map(
                    normalizeString
                  )
                  .filter(
                    Boolean
                  )
              )
            )
          : [];

      const record =
        await EmployeeRelationsCase
          .create({
            caseNumber,
            caseType:
              "Grievance",

            title,
            summary,
            category,

            incidentDate:
              normalizeString(
                req.body
                  .incidentDate
              ),

            reportedDate:
              getTodayYmd(),

            priority:
              normalizeString(
                req.body.priority
              ) ||
              "Normal",

            confidentialityLevel:
              "Restricted HR",

            complainantEmployeeId:
              employee.employeeId,

            complainantLinkedUserId:
              employee.linkedUserId ||
              actorUserId,

            complainantSnapshot:
              employeeSnapshot(
                employee
              ),

            respondentEmployeeIds,

            requestedResolution:
              normalizeString(
                req.body
                  .requestedResolution
              ),

            allegations:
              createAllegations(
                req.body
                  .allegations
              ),

            authorizedUserIds:
              [actorUserId]
                .filter(Boolean),

            status:
              "Submitted",

            employeeAcknowledgement:
              {
                required:
                  false,
                status:
                  "Not Required",
              },

            createdBy:
              actorName,

            createdByUserId:
              actorUserId,

            updatedBy:
              actorName,

            history: [
              {
                action:
                  "Submitted",
                fromStatus:
                  "",
                toStatus:
                  "Submitted",
                notes:
                  "Restricted employee grievance submitted for HR review.",
                performedBy:
                  actorName,
                performedByUserId:
                  actorUserId,
              },
            ],
          });

      await writeAuditLog({
        req,
        action:
          "Grievance Submitted",
        module: "HR",
        description:
          `Restricted grievance ${caseNumber} was submitted.`,
        targetType:
          "EmployeeRelationsCase",
        targetId:
          caseNumber,
        metadata: {
          caseType:
            "Grievance",
          complainantEmployeeId:
            employee.employeeId,
        },
        afterValues: {
          caseNumber,
          status:
            record.status,
          category:
            record.category,
        },
      });

      return res
        .status(201)
        .json({
          success: true,
          message:
            "Restricted grievance submitted successfully.",
          data:
            isHrUser(req.user)
              ? record
              : toEmployeeView(
                  record
                ),
        });
    } catch (error) {
      return sendControllerError(
        res,
        error,
        "Failed to submit the restricted grievance."
      );
    }
  };

module.exports = {
  getEmployeeRelationsCases,
  getMyEmployeeRelationsCases,
  getEmployeeRelationsCaseByNumber,
  createDisciplineCaseDraft,
  submitGrievanceCase,
};