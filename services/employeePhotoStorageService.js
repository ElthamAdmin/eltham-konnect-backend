const crypto = require("crypto");

const {
  configureCloudinary,
} = require("../config/cloudinary");

const normalizeStorageSegment = (value) =>
  String(value || "")
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "") || "unknown";

const uploadEmployeePhotoBuffer = async ({
  buffer,
  employeeId,
  originalFileName,
}) => {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    throw new Error(
      "A non-empty employee photo buffer is required."
    );
  }

  const cloudinary = configureCloudinary();

  const normalizedEmployeeId =
    normalizeStorageSegment(employeeId);

  const uniqueKey =
    `PHOTO-${Date.now()}-${crypto.randomUUID()}`;

  const uploadResult = await new Promise(
    (resolve, reject) => {
      const uploadStream =
        cloudinary.uploader.upload_stream(
          {
            folder:
              `ekos/hr-profile-photos/${normalizedEmployeeId}`,

            public_id: uniqueKey,

            resource_type: "image",

            type: "upload",

            overwrite: false,

            unique_filename: false,

            use_filename: false,

            invalidate: true,

            transformation: [
              {
                width: 800,
                height: 800,
                crop: "limit",
                quality: "auto:good",
                fetch_format: "auto",
              },
            ],

            context: {
              employeeId:
                String(employeeId || "").trim(),

              originalFileName:
                String(
                  originalFileName || "employee-photo"
                ).trim(),
            },
          },
          (error, result) => {
            if (error) {
              reject(error);
              return;
            }

            resolve(result);
          }
        );

      uploadStream.end(buffer);
    }
  );

  if (
    !uploadResult?.public_id ||
    !uploadResult?.secure_url
  ) {
    throw new Error(
      "Cloudinary did not return the required employee-photo storage evidence."
    );
  }

  return {
    url: uploadResult.secure_url,
    storageKey: uploadResult.public_id,
    storageProvider: "Cloudinary",
    resourceType:
      uploadResult.resource_type || "image",
    deliveryType:
      uploadResult.type || "upload",
    format: uploadResult.format || "",
    width: Number(uploadResult.width || 0),
    height: Number(uploadResult.height || 0),
  };
};

const destroyEmployeePhotoAsset = async ({
  storageKey,
  resourceType = "image",
  deliveryType = "upload",
}) => {
  const normalizedStorageKey =
    String(storageKey || "").trim();

  if (!normalizedStorageKey) {
    return null;
  }

  const cloudinary = configureCloudinary();

  return cloudinary.uploader.destroy(
    normalizedStorageKey,
    {
      resource_type:
        String(resourceType || "image").trim(),
      type:
        String(deliveryType || "upload").trim(),
      invalidate: true,
    }
  );
};

module.exports = {
  uploadEmployeePhotoBuffer,
  destroyEmployeePhotoAsset,
};