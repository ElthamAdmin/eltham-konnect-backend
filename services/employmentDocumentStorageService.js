const crypto = require("crypto");

const {
  configureCloudinary,
} = require("../config/cloudinary");

const normalizeStorageSegment = (
  value
) =>
  String(value || "")
    .trim()
    .replace(
      /[^a-zA-Z0-9_-]/g,
      "-"
    )
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "") ||
  "unknown";

const calculateSha256 = (
  buffer
) =>
  crypto
    .createHash("sha256")
    .update(buffer)
    .digest("hex");

const uploadEmploymentDocumentBuffer =
  async ({
    buffer,
    employeeId,
    originalFileName,
    mimeType,
  }) => {
    if (
      !Buffer.isBuffer(buffer) ||
      buffer.length === 0
    ) {
      throw new Error(
        "A non-empty document buffer is required."
      );
    }

    const normalizedEmployeeId =
      normalizeStorageSegment(
        employeeId
      );

    const cloudinary =
      configureCloudinary();

    const uniqueKey =
      `DOC-${Date.now()}-${crypto.randomUUID()}`;

    const uploadResult =
      await new Promise(
        (resolve, reject) => {
          const uploadStream =
            cloudinary.uploader.upload_stream(
              {
                folder:
                  `ekos/hr-documents/${normalizedEmployeeId}`,

                public_id:
                  uniqueKey,

                resource_type:
                  "auto",

                type:
                  "authenticated",

                overwrite: false,

                unique_filename:
                  false,

                use_filename:
                  false,

                invalidate: false,

                context: {
                  employeeId:
                    String(
                      employeeId ||
                        ""
                    ).trim(),

                  originalFileName:
                    String(
                      originalFileName ||
                        "document"
                    ).trim(),
                },
              },
              (
                error,
                result
              ) => {
                if (error) {
                  reject(error);
                  return;
                }

                resolve(result);
              }
            );

          uploadStream.end(
            buffer
          );
        }
      );

    if (
      !uploadResult?.public_id ||
      !uploadResult?.secure_url
    ) {
      throw new Error(
        "Cloudinary did not return the required document storage evidence."
      );
    }

    return {
      storageProvider:
        "Cloudinary",

      storageKey:
        uploadResult.public_id,

      fileUrl:
        uploadResult.secure_url,

      originalFileName:
        String(
          originalFileName ||
            "document"
        ).trim(),

      storedFileName:
        uploadResult.public_id
          .split("/")
          .pop(),

      mimeType:
        String(
          mimeType ||
            "application/octet-stream"
        ).trim(),

      sizeBytes:
        buffer.length,

      checksumSha256:
        calculateSha256(
          buffer
        ),

      resourceType:
        uploadResult.resource_type ||
        "raw",

      deliveryType:
        uploadResult.type ||
        "authenticated",

      format:
        uploadResult.format ||
        "",
    };
  };

const generateSignedDocumentUrl =
  ({
    storageKey,
    resourceType = "raw",
    deliveryType =
      "authenticated",
    format = "",
    expiresInSeconds = 300,
    attachment = true,
  }) => {
    const normalizedStorageKey =
      String(
        storageKey || ""
      ).trim();

    if (!normalizedStorageKey) {
      throw new Error(
        "A Cloudinary document storage key is required."
      );
    }

    /*
     * Download links may remain valid
     * for no less than one minute and
     * no more than fifteen minutes.
     */
    const safeExpirySeconds =
      Math.min(
        900,
        Math.max(
          60,
          Number(
            expiresInSeconds ||
              300
          )
        )
      );

    const cloudinary =
      configureCloudinary();

    return cloudinary.utils
      .private_download_url(
        normalizedStorageKey,
        String(
          format || ""
        ).trim(),
        {
          resource_type:
            String(
              resourceType ||
                "raw"
            ).trim(),

          type:
            String(
              deliveryType ||
                "authenticated"
            ).trim(),

          expires_at:
            Math.floor(
              Date.now() / 1000
            ) +
            safeExpirySeconds,

          attachment:
            Boolean(
              attachment
            ),
        }
      );
  };

const destroyEmploymentDocumentAsset =
  async ({
    storageKey,
    resourceType = "raw",
    deliveryType =
      "authenticated",
  }) => {
    const normalizedStorageKey =
      String(
        storageKey || ""
      ).trim();

    if (!normalizedStorageKey) {
      throw new Error(
        "A Cloudinary document storage key is required."
      );
    }

    const cloudinary =
      configureCloudinary();

    return cloudinary.uploader
      .destroy(
        normalizedStorageKey,
        {
          resource_type:
            String(
              resourceType ||
                "raw"
            ).trim(),

          type:
            String(
              deliveryType ||
                "authenticated"
            ).trim(),

          invalidate: true,
        }
      );
  };

module.exports = {
  uploadEmploymentDocumentBuffer,
  generateSignedDocumentUrl,
  destroyEmploymentDocumentAsset,
};