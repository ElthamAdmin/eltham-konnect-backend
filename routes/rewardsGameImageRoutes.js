const express = require("express");
const multer = require("multer");
const crypto = require("crypto");
const cloudinary = require("cloudinary").v2;

const {
  protect,
  requirePermission,
} = require("../middleware/authMiddleware");

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
    limits: {
    fileSize: 5 * 1024 * 1024,
    files: 1,
    fields: 0,
    parts: 2,
  },
  fileFilter: (req, file, callback) => {
    if (
      !["image/jpeg", "image/png", "image/webp"].includes(
        file.mimetype
      )
    ) {
      return callback(
        new Error("Choose a JPG, PNG or WebP image.")
      );
    }

    callback(null, true);
  },
}).single("image");

const detectImageType = (buffer) => {
  if (
    buffer.length >= 3 &&
    buffer[0] === 0xff &&
    buffer[1] === 0xd8 &&
    buffer[2] === 0xff
  ) {
    return "image/jpeg";
  }

  if (
    buffer.length >= 8 &&
    buffer.subarray(0, 8).equals(
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
    )
  ) {
    return "image/png";
  }

  if (
    buffer.length >= 12 &&
    buffer.toString("ascii", 0, 4) === "RIFF" &&
    buffer.toString("ascii", 8, 12) === "WEBP"
  ) {
    return "image/webp";
  }

  return null;
};

router.post(
  "/",
  protect,
  requirePermission("marketing"),
  (req, res) => {
    res.set("Cache-Control", "no-store");

    const requiredVariables = [
      "CLOUDINARY_CLOUD_NAME",
      "CLOUDINARY_API_KEY",
      "CLOUDINARY_API_SECRET",
    ];

    if (
      requiredVariables.some(
        (name) => !process.env[name]?.trim()
      )
    ) {
      return res.status(503).json({
        success: false,
        message:
          "Game image uploads are not configured on the server.",
      });
    }

    upload(req, res, async (uploadError) => {
      if (uploadError) {
        return res.status(400).json({
          success: false,
          message:
            uploadError.code === "LIMIT_FILE_SIZE"
              ? "The image must be 5 MB or smaller."
              : uploadError instanceof multer.MulterError
                ? "Upload one image using the image field."
                : "Choose a JPG, PNG or WebP image.",
        });
      }

      if (!req.file?.buffer?.length) {
        return res.status(400).json({
          success: false,
          message: "Choose an image to upload.",
        });
      }

      const detectedType = detectImageType(req.file.buffer);

      if (!detectedType || detectedType !== req.file.mimetype) {
        return res.status(400).json({
          success: false,
          message:
            "The file contents do not match a supported image type.",
        });
      }

      try {
        cloudinary.config({
          cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
          api_key: process.env.CLOUDINARY_API_KEY,
          api_secret: process.env.CLOUDINARY_API_SECRET,
          secure: true,
        });

        const uploaded = await new Promise((resolve, reject) => {
          const stream = cloudinary.uploader.upload_stream(
            {
              resource_type: "image",
              folder: "eltham-konnect/rewards-games",
              public_id: crypto.randomUUID(),
              overwrite: false,
              allowed_formats: ["jpg", "png", "webp"],
            },
            (error, result) => {
              if (error) {
                reject(error);
              } else {
                resolve(result);
              }
            }
          );

          stream.on("error", reject);
          stream.end(req.file.buffer);
        });

        if (
          !uploaded?.secure_url ||
          !uploaded.public_id
        ) {
          throw new Error("Incomplete image upload response.");
        }

        return res.status(201).json({
          success: true,
          message: "Game image uploaded successfully.",
          data: {
            imageUrl: uploaded.secure_url,
            publicId: uploaded.public_id,
            width: uploaded.width,
            height: uploaded.height,
            format: uploaded.format,
          },
        });
      } catch (error) {
        console.error(
          "Rewards game image upload failed:",
          error.http_code || error.code || "UPLOAD_FAILED"
        );

        return res.status(502).json({
          success: false,
          message:
            "The image could not be uploaded. Please try again.",
        });
      }
    });
  }
);

module.exports = router;