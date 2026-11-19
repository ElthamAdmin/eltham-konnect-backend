const BusinessEntity = require("../models/BusinessEntity");
const FinancialAccount = require("../models/FinancialAccount");
const EmployeeAdvance = require("../models/EmployeeAdvance");
const PayrollEmployerLink = require("../models/PayrollEmployerLink");

const sources = new Map([
  ["FinancialAccount", [FinancialAccount, "accountNumber"]],
  ["EmployeeAdvance", [EmployeeAdvance, "advanceNumber"]],
]);

const clean = (value) =>
  typeof value === "string" ? value.trim() : "";

const fail = (statusCode, message) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  throw error;
};

const verifyLink = async ({
  recordType, recordNumber, entityCode, evidenceReference, user,
}) => {
  if (user?.role !== "Admin" || !user.userId) {
    fail(403, "An identified administrator must verify ownership.");
  }

  const source = sources.get(recordType);
  const number = clean(recordNumber);
  const code = clean(entityCode);
  const evidence = clean(evidenceReference);

  if (!source || !number || !code || !evidence || evidence.length > 250) {
    fail(400, "Provide a record type, record number, employer code and evidence reference of up to 250 characters.");
  }

  const [Model, numberField] = source;
  const [record, entity] = await Promise.all([
    Model.findOne({ [numberField]: number }).select("_id").lean(),
    BusinessEntity.findOne({ entityCode: code })
      .select("_id entityCode lifecycleStatus").lean(),
  ]);

  if (!record || !entity) fail(404, "The record or business was not found.");
  if (["Planned", "Registration In Progress"].includes(entity.lifecycleStatus)) {
    fail(409, "A planned business cannot be verified as the payroll owner.");
  }

  const key = { recordType, recordId: record._id };
  let link;

  try {
    link = await PayrollEmployerLink.findOneAndUpdate(
      key,
      {
        $setOnInsert: {
          ...key,
          recordNumber: number,
          entityId: entity._id,
          entityCode: entity.entityCode,
          evidenceReference: evidence,
          verifiedByUserId: user.userId,
          verifiedAt: new Date(),
        },
      },
      { upsert: true, new: true, runValidators: true, timestamps: false }
    ).lean();
  } catch (error) {
    if (error.code !== 11000) throw error;
    link = await PayrollEmployerLink.findOne(key).lean();
  }

  if (!link || String(link.entityId) !== String(entity._id)) {
    fail(409, "This record has a different verified employer. Review the original evidence; no ownership was changed.");
  }

  return link;
};

const assertOwner = async ({ recordType, record, entityCode, session }) => {
  if (!record?._id || !clean(entityCode)) {
    fail(409, "A source record and payroll employer are required.");
  }
  const query = PayrollEmployerLink.findOne({
    recordType,
    recordId: record._id,
  }).select("entityCode").lean();

  if (session) query.session(session);
  const link = await query;

  if (!link) fail(409, `${recordType} ownership has not been verified.`);
  if (link.entityCode !== entityCode) {
    fail(409, `${recordType} belongs to a different payroll employer.`);
  }
};

module.exports = { verifyLink, assertOwner };