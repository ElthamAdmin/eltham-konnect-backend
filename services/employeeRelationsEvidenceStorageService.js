const crypto = require("crypto");

const {
  configureCloudinary,
} = require("../config/cloudinary");

const normalizeStorageSegment = (value) =>
  String(value || "")
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "") ||
  "unknown";

const calculateSha256 = (buffer) =>
  crypto
    .createHash("sha256")
    .update(buffer)
    .digest("hex");

const normalizeExpirySeconds = (
  expiresInSeconds
) =>
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

const uploadEmployeeRelationsEvidenceBuffer =
  async ({
    buffer,
    caseNumber,
    evidenceNumber,
    originalFileName,
    mimeType,
  }) => {
    if (
      !Buffer.isBuffer(buffer) ||
      buffer.length === 0
    ) {
      throw new Error(
        "A non-empty employee-relations evidence buffer is required."
      );
    }

    const normalizedCaseNumber =
      normalizeStorageSegment(
        caseNumber
      );

    const normalizedEvidenceNumber =
      normalizeStorageSegment(
        evidenceNumber
      );

    const cloudinary =
      configureCloudinary();

    const uniqueKey =
      normalizedEvidenceNumber !==
      "unknown"
        ? normalizedEvidenceNumber
        : `EREV-${Date.now()}-${crypto.randomUUID()}`;

    const uploadResult =
      await new Promise(
        (resolve, reject) => {
          const uploadStream =
            cloudinary.uploader.upload_stream(
              {
                folder:
                  `ekos/employee-relations/${normalizedCaseNumber}/evidence`,

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
                  caseNumber:
                    String(
                      caseNumber ||
                        ""
                    ).trim(),

                  evidenceNumber:
                    String(
                      evidenceNumber ||
                        ""
                    ).trim(),

                  originalFileName:
                    String(
                      originalFileName ||
                        "evidence"
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
        "Cloudinary did not return the required employee-relations evidence storage information."
      );
    }

    return {
      originalFileName:
        String(
          originalFileName ||
            "evidence"
        ).trim(),

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

      storageProvider:
        "Cloudinary",

      cloudinaryPublicId:
        uploadResult.public_id,

      cloudinaryResourceType:
        uploadResult.resource_type ||
        "raw",

      cloudinaryDeliveryType:
        uploadResult.type ||
        "authenticated",

      cloudinaryFormat:
        uploadResult.format ||
        "",

      secureStorageUrl:
        uploadResult.secure_url,
    };
  };

const generateSignedEvidenceUrl = ({
  cloudinaryPublicId,
  cloudinaryResourceType = "raw",
  cloudinaryDeliveryType =
    "authenticated",
  cloudinaryFormat = "",
  expiresInSeconds = 300,
  attachment = true,
}) => {
  const normalizedPublicId =
    String(
      cloudinaryPublicId ||
        ""
    ).trim();

  if (!normalizedPublicId) {
    throw new Error(
      "A Cloudinary evidence public ID is required."
    );
  }

  const safeExpirySeconds =
    normalizeExpirySeconds(
      expiresInSeconds
    );

  const cloudinary =
    configureCloudinary();

  return cloudinary.utils
    .private_download_url(
      normalizedPublicId,
      String(
        cloudinaryFormat ||
          ""
      ).trim(),
      {
        resource_type:
          String(
            cloudinaryResourceType ||
              "raw"
          ).trim(),

        type:
          String(
            cloudinaryDeliveryType ||
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

const destroyEmployeeRelationsEvidenceAsset =
  async ({
    cloudinaryPublicId,
    cloudinaryResourceType = "raw",
    cloudinaryDeliveryType =
      "authenticated",
  }) => {
    const normalizedPublicId =
      String(
        cloudinaryPublicId ||
          ""
      ).trim();

    if (!normalizedPublicId) {
      throw new Error(
        "A Cloudinary evidence public ID is required."
      );
    }

    const cloudinary =
      configureCloudinary();

    return cloudinary.uploader
      .destroy(
        normalizedPublicId,
        {
          resource_type:
            String(
              cloudinaryResourceType ||
                "raw"
            ).trim(),

          type:
            String(
              cloudinaryDeliveryType ||
                "authenticated"
            ).trim(),

          invalidate: true,
        }
      );
  };

module.exports = {
  uploadEmployeeRelationsEvidenceBuffer,
  generateSignedEvidenceUrl,
  destroyEmployeeRelationsEvidenceAsset,
};