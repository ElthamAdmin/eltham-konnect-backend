const HREmployee = require(
  "../models/HREmployee"
);

const {
  uploadEmployeePhotoBuffer,
  destroyEmployeePhotoAsset,
} = require(
  "../services/employeePhotoStorageService"
);

const {
  writeAuditLog,
} = require("../utils/auditLogger");

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

const serializePhoto = (photo = {}) => ({
  url: photo.url || "",
  storageKey: photo.storageKey || "",
  storageProvider:
    photo.storageProvider || "",
  resourceType:
    photo.resourceType || "image",
  deliveryType:
    photo.deliveryType || "upload",
  format: photo.format || "",
  width: Number(photo.width || 0),
  height: Number(photo.height || 0),
  uploadedAt: photo.uploadedAt || null,
  uploadedBy: photo.uploadedBy || "",
  uploadedByUserId:
    photo.uploadedByUserId || "",
});

const uploadEmployeeProfilePhoto =
  async (req, res) => {
    let uploadedPhoto = null;

    try {
      const employeeId = String(
        req.params.employeeId || ""
      ).trim();

      if (!req.file?.buffer) {
        return res.status(400).json({
          success: false,
          message:
            "Select an employee profile photo to upload.",
        });
      }

      const employee =
        await HREmployee.findOne({
          employeeId,
        });

      if (!employee) {
        return res.status(404).json({
          success: false,
          message:
            "The HR employee record was not found.",
        });
      }

      const previousPhoto =
        serializePhoto(
          employee.profilePhoto || {}
        );

      uploadedPhoto =
        await uploadEmployeePhotoBuffer({
          buffer: req.file.buffer,
          employeeId:
            employee.employeeId,
          originalFileName:
            req.file.originalname,
        });

      const uploadedBy =
        getUserName(req.user);

      const uploadedByUserId =
        getUserId(req.user);

      employee.profilePhoto = {
        ...uploadedPhoto,
        uploadedAt: new Date(),
        uploadedBy,
        uploadedByUserId,
      };

      await employee.save();

      if (
        previousPhoto.storageKey &&
        previousPhoto.storageKey !==
          uploadedPhoto.storageKey
      ) {
        try {
          await destroyEmployeePhotoAsset({
            storageKey:
              previousPhoto.storageKey,
            resourceType:
              previousPhoto.resourceType,
            deliveryType:
              previousPhoto.deliveryType,
          });
        } catch (cleanupError) {
          console.error(
            "Previous employee photo cleanup failed:",
            cleanupError.message
          );
        }
      }

      await writeAuditLog({
        req,
        action:
          "UPLOAD_EMPLOYEE_PROFILE_PHOTO",
        module: "HR",
        description:
          `Profile photo uploaded for ${employee.fullName} (${employee.employeeId}).`,
        targetType: "HREmployee",
        targetId: employee.employeeId,
        beforeValues: {
          profilePhoto: previousPhoto,
        },
        afterValues: {
          profilePhoto:
            serializePhoto(
              employee.profilePhoto
            ),
        },
        metadata: {
          employeeId:
            employee.employeeId,
          originalFileName:
            req.file.originalname,
          mimeType: req.file.mimetype,
          sizeBytes: req.file.size,
        },
      });

      return res.json({
        success: true,
        message:
          `${employee.fullName}'s profile photo was uploaded successfully.`,
        data: {
          employeeId:
            employee.employeeId,
          fullName: employee.fullName,
          profilePhoto:
            serializePhoto(
              employee.profilePhoto
            ),
        },
      });
    } catch (error) {
      console.error(
        "Upload employee profile photo error:",
        error
      );

      if (uploadedPhoto?.storageKey) {
        try {
          await destroyEmployeePhotoAsset({
            storageKey:
              uploadedPhoto.storageKey,
            resourceType:
              uploadedPhoto.resourceType,
            deliveryType:
              uploadedPhoto.deliveryType,
          });
        } catch (cleanupError) {
          console.error(
            "Failed upload cleanup error:",
            cleanupError.message
          );
        }
      }

      return res.status(400).json({
        success: false,
        message:
          error.message ||
          "The employee profile photo could not be uploaded.",
      });
    }
  };

const removeEmployeeProfilePhoto =
  async (req, res) => {
    try {
      const employeeId = String(
        req.params.employeeId || ""
      ).trim();

      const employee =
        await HREmployee.findOne({
          employeeId,
        });

      if (!employee) {
        return res.status(404).json({
          success: false,
          message:
            "The HR employee record was not found.",
        });
      }

      const previousPhoto =
        serializePhoto(
          employee.profilePhoto || {}
        );

      if (!previousPhoto.storageKey) {
        return res.status(409).json({
          success: false,
          message:
            `${employee.fullName} does not have a stored profile photo.`,
        });
      }

      employee.profilePhoto = {
        url: "",
        storageKey: "",
        storageProvider: "",
        resourceType: "image",
        deliveryType: "upload",
        format: "",
        width: 0,
        height: 0,
        uploadedAt: null,
        uploadedBy: "",
        uploadedByUserId: "",
      };

      await employee.save();

      try {
        await destroyEmployeePhotoAsset({
          storageKey:
            previousPhoto.storageKey,
          resourceType:
            previousPhoto.resourceType,
          deliveryType:
            previousPhoto.deliveryType,
        });
      } catch (cleanupError) {
        console.error(
          "Employee photo deletion failed:",
          cleanupError.message
        );
      }

      await writeAuditLog({
        req,
        action:
          "REMOVE_EMPLOYEE_PROFILE_PHOTO",
        module: "HR",
        description:
          `Profile photo removed for ${employee.fullName} (${employee.employeeId}).`,
        targetType: "HREmployee",
        targetId: employee.employeeId,
        beforeValues: {
          profilePhoto: previousPhoto,
        },
        afterValues: {
          profilePhoto:
            serializePhoto(
              employee.profilePhoto
            ),
        },
        metadata: {
          employeeId:
            employee.employeeId,
        },
      });

      return res.json({
        success: true,
        message:
          `${employee.fullName}'s profile photo was removed successfully.`,
        data: {
          employeeId:
            employee.employeeId,
          profilePhoto:
            serializePhoto(
              employee.profilePhoto
            ),
        },
      });
    } catch (error) {
      console.error(
        "Remove employee profile photo error:",
        error
      );

      return res.status(400).json({
        success: false,
        message:
          error.message ||
          "The employee profile photo could not be removed.",
      });
    }
  };

module.exports = {
  uploadEmployeeProfilePhoto,
  removeEmployeeProfilePhoto,
};