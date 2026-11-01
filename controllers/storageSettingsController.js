const mongoose = require("mongoose");
const Setting = require("../models/Setting");
const { writeAuditLog } = require("../utils/auditLogger");

const setStorageChargingStatus = async (req, res) => {
  const enabled = req.body?.enabled;

  if (typeof enabled !== "boolean") {
    return res.status(400).json({
      success: false,
      message: "Enabled must be true or false.",
    });
  }

  if (
    enabled &&
    new Date() < new Date("2027-01-01T00:00:00-05:00")
  ) {
    return res.status(409).json({
      success: false,
      message:
        "Storage charging cannot be enabled before January 1, 2027, Jamaica time.",
    });
  }

  try {
    const settings = await mongoose.connection.transaction(
      async (session) => {
        const current = await Setting.findOne({
          settingKey: "main",
        })
          .session(session)
          .lean();

        if (!current) {
          const error = new Error(
            "Save the main settings before changing storage charging."
          );
          error.statusCode = 409;
          throw error;
        }

        const storage = current.storageFees;

        if (
          enabled &&
          (
            storage?.effectiveFrom !== "2027-01-01" ||
            storage?.currency !== "JMD" ||
            storage?.freeBusinessDays !== 7 ||
            storage?.firstDayFee !== 150 ||
            storage?.additionalDailyFee !== 50 ||
            storage?.timeZone !== "America/Jamaica"
          )
        ) {
          const error = new Error(
            "The saved storage rules need review before activation."
          );
          error.statusCode = 409;
          throw error;
        }

        const updated = await Setting.findOneAndUpdate(
          { _id: current._id },
          { $set: { "storageFees.enabled": enabled } },
          {
            new: true,
            runValidators: true,
            session,
          }
        );

        if (storage?.enabled !== enabled) {
          await writeAuditLog({
            req,
            session,
            action: enabled
              ? "ENABLE_STORAGE_CHARGING"
              : "DISABLE_STORAGE_CHARGING",
            module: "Settings",
            description: enabled
              ? "Storage charging enabled."
              : "Storage charging disabled.",
            targetType: "Setting",
            targetId: String(current._id),
            beforeValues: {
              enabled: storage?.enabled ?? null,
            },
            afterValues: {
              enabled,
            },
          });
        }

        return updated;
      }
    );

    return res.json({
      success: true,
      message: enabled
        ? "Storage charging is enabled."
        : "Storage charging is disabled.",
      data: settings,
    });
  } catch (error) {
    console.error("Storage charging status update failed:", error.message);

    return res.status(error.statusCode || 500).json({
      success: false,
      message:
        error.statusCode === 409
          ? error.message
          : "Could not confirm the change. Refresh Settings to check the current charging status.",
    });
  }
};

module.exports = {
  setStorageChargingStatus,
};