const ExpenseCategory = require("../models/ExpenseCategory");
const categoryService = require("../services/expenseCategoryService");
const { writeAuditLog } = require("../utils/auditLogger");

const fail = (message, statusCode = 400) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  throw error;
};

const requireCategoryAdmin = (req) => {
  if (req.user?.role !== "Admin") {
    fail(
      "Only Admin can manage expense categories.",
      403
    );
  }
};

const actorName = (req) =>
  req.user?.fullName ||
  req.user?.email ||
  req.user?.userId ||
  "Admin";

const categorySnapshot = (record) => ({
  _id: String(record._id),
  category: record.category,
  classification: record.classification,
  group: record.group,
  accountCode: record.accountCode,
  accountName: record.accountName,
  isCOGS: record.isCOGS,
  status: record.status,
  description: record.description || "",
  version: Number(record.__v || 0),
});

const sendCategoryError = (res, error) => {
  console.error("Expense category error:", error);

  if (error.code === 11000) {
    return res.status(409).json({
      success: false,
      message:
        "An expense category with this name already exists. Reactivate it if it is inactive.",
    });
  }

  if (error.name === "VersionError") {
    return res.status(409).json({
      success: false,
      message:
        "This category changed while you were editing it. Refresh the categories and try again.",
    });
  }

  const status = [400, 403, 404, 409].includes(
    error.statusCode
  )
    ? error.statusCode
    : ["ValidationError", "CastError"].includes(
          error.name
        )
      ? 400
      : 500;

  return res.status(status).json({
    success: false,
    message:
      status === 500
        ? "Could not complete the expense category request."
        : error.message,
  });
};

const auditCategoryChange = async (
  req,
  action,
  record,
  before = null
) => {
  try {
    await writeAuditLog({
      req,
      action,
      module: "Finance",
      description: `${action}: ${record.category}`,
      targetType: "ExpenseCategory",
      targetId: String(record._id),
      metadata: {
        before,
        after: categorySnapshot(record),
      },
    });

    return "";
  } catch (error) {
    console.error(
      "Expense category audit log error:",
      error
    );

    return "Category saved, but its audit log could not be written.";
  }
};

/*
|--------------------------------------------------------------------------
| List Saved Categories
|--------------------------------------------------------------------------
*/

const getExpenseCategories = async (req, res) => {
  try {
    const flag = req.query.includeInactive;

    if (
      flag !== undefined &&
      !["true", "false"].includes(flag)
    ) {
      fail("includeInactive must be true or false.");
    }

    const data =
      await categoryService.listExpenseCategories({
        includeInactive: flag === "true",
        user: req.user,
      });

    return res.json({
      success: true,
      data,
      canManageCategories:
        req.user?.role === "Admin",
    });
  } catch (error) {
    return sendCategoryError(res, error);
  }
};

/*
|--------------------------------------------------------------------------
| Ledger Accounts Available for Category Mapping
|--------------------------------------------------------------------------
*/

const getExpenseCategoryAccounts = async (req, res) => {
  try {
    requireCategoryAdmin(req);

    const data =
      await categoryService.getExpensePostingAccounts({
        user: req.user,
      });

    return res.json({
      success: true,
      data,
    });
  } catch (error) {
    return sendCategoryError(res, error);
  }
};

/*
|--------------------------------------------------------------------------
| Create Category
|--------------------------------------------------------------------------
*/

const createExpenseCategory = async (req, res) => {
  try {
    requireCategoryAdmin(req);

    const values =
      await categoryService.validateExpenseCategoryInput(
        req.body
      );

    const duplicate = await ExpenseCategory.exists({
      categoryKey: values.categoryKey,
    });

    if (duplicate) {
      fail(
        "An expense category with this name already exists. Reactivate it if it is inactive.",
        409
      );
    }

    const record = await ExpenseCategory.create({
      ...values,
      status: "Active",
      createdBy: actorName(req),
      updatedBy: actorName(req),
    });

    const auditWarning = await auditCategoryChange(
      req,
      "CREATE_EXPENSE_CATEGORY",
      record
    );

    return res.status(201).json({
      success: true,
      message: "Expense category created.",
      data: categorySnapshot(record),
      auditWarning,
    });
  } catch (error) {
    return sendCategoryError(res, error);
  }
};

/*
|--------------------------------------------------------------------------
| Edit, Deactivate or Reactivate Category
|--------------------------------------------------------------------------
*/

const updateExpenseCategory = async (req, res) => {
  try {
    requireCategoryAdmin(req);

    const id = String(req.params.categoryId || "");

    if (!/^[a-f\d]{24}$/i.test(id)) {
      fail("Invalid expense category ID.");
    }

    const input = req.body;

    if (
      !input ||
      typeof input !== "object" ||
      Array.isArray(input)
    ) {
      fail("Category details are required.");
    }

    if (
      !Number.isSafeInteger(input.version) ||
      input.version < 0
    ) {
      fail(
        "The category version is required. Refresh the categories before editing."
      );
    }

    const record = await ExpenseCategory.findById(id);

    if (!record) {
      fail("Expense category not found.", 404);
    }

    if (
      Number(record.__v || 0) !== input.version
    ) {
      fail(
        "This category has changed. Refresh the categories before editing.",
        409
      );
    }

    const before = categorySnapshot(record);

    const editable = [
      "category",
      "group",
      "accountCode",
      "description",
    ];

    const editsMapping = editable.some(
      (field) => input[field] !== undefined
    );

    if (
      !editsMapping &&
      input.status === undefined
    ) {
      fail("No category changes were provided.");
    }

    if (
      input.status !== undefined &&
      !["Active", "Inactive"].includes(input.status)
    ) {
      fail(
        "Category status must be Active or Inactive."
      );
    }

    /*
     * Revalidate when editing details or reactivating.
     * A status-only deactivation can retire a category
     * even if its ledger mapping needs correction.
     */
    if (
      editsMapping ||
      input.status === "Active"
    ) {
      const values =
        await categoryService.validateExpenseCategoryInput({
          category:
            input.category ?? record.category,
          group:
            input.group ?? record.group,
          accountCode:
            input.accountCode ?? record.accountCode,
          description:
            input.description ?? record.description,
        });

      const duplicate = await ExpenseCategory.exists({
        categoryKey: values.categoryKey,
        _id: { $ne: record._id },
      });

      if (duplicate) {
        fail(
          "Another expense category already uses this name.",
          409
        );
      }

      record.set(values);
    }

    if (input.status !== undefined) {
      record.status = input.status;
    }

    record.updatedBy = actorName(req);

    await record.save();

    const auditWarning = await auditCategoryChange(
      req,
      "UPDATE_EXPENSE_CATEGORY",
      record,
      before
    );

    return res.json({
      success: true,
      message: "Expense category updated.",
      data: categorySnapshot(record),
      auditWarning,
    });
  } catch (error) {
    return sendCategoryError(res, error);
  }
};

module.exports = {
  getExpenseCategories,
  getExpenseCategoryAccounts,
  createExpenseCategory,
  updateExpenseCategory,
};