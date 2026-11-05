const { randomUUID } = require("crypto");
const Setting = require("../models/Setting");
const { configureCloudinary } = require("../config/cloudinary");

const POSITIONS = ["center", "top", "bottom", "left", "right"];

const detectImage = (buffer) => {
  if (!Buffer.isBuffer(buffer)) return "";

  if (
    buffer.length >= 3 &&
    buffer[0] === 0xff &&
    buffer[1] === 0xd8 &&
    buffer[2] === 0xff
  ) return "jpg";

  if (
    buffer.length >= 8 &&
    buffer.subarray(0, 8).equals(
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
    )
  ) return "png";

  if (
    buffer.length >= 12 &&
    buffer.toString("ascii", 0, 4) === "RIFF" &&
    buffer.toString("ascii", 8, 12) === "WEBP"
  ) return "webp";

  return "";
};

const parseDate = (value, field) => {
  if (value === null || value === "") return null;

  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value)
  ) {
    throw new Error(`Provide a valid timestamp for ${field}.`);
  }

  const date = new Date(value);

  if (!Number.isFinite(date.getTime())) {
    throw new Error(`Provide a valid date for ${field}.`);
  }

  const expected = value.includes(".")
    ? value
    : value.replace("Z", ".000Z");

  if (date.toISOString() !== expected) {
    throw new Error(`Provide a valid date for ${field}.`);
  }

  return date;
};

const validateAppearance = (input) => {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("Provide valid login appearance settings.");
  }

  const allowed = [
    "enabled",
    "wallpaperUrl",
    "wallpaperPublicId",
    "wallpaperName",
    "position",
    "overlayOpacity",
    "heading",
    "message",
    "startsAt",
    "endsAt",
  ];

  if (Object.keys(input).some((key) => !allowed.includes(key))) {
    throw new Error("An unsupported appearance field was provided.");
  }

  if (
    typeof input.enabled !== "boolean" ||
    !POSITIONS.includes(input.position) ||
    typeof input.overlayOpacity !== "number" ||
    !Number.isFinite(input.overlayOpacity) ||
    input.overlayOpacity < 0 ||
    input.overlayOpacity > 0.85
  ) {
    throw new Error("Select valid appearance and overlay settings.");
  }

  const limits = {
    wallpaperUrl: 1500,
    wallpaperPublicId: 300,
    wallpaperName: 180,
    heading: 120,
    message: 500,
  };

  const clean = {
    enabled: input.enabled,
    position: input.position,
    overlayOpacity: input.overlayOpacity,
  };

  for (const [field, limit] of Object.entries(limits)) {
    const value = input[field] ?? "";

    if (typeof value !== "string" || value.length > limit) {
      throw new Error(`Invalid ${field}; maximum ${limit} characters.`);
    }

    clean[field] = value.trim();
  }

  if (clean.wallpaperUrl) {
    let url;

    try {
      url = new URL(clean.wallpaperUrl);
    } catch {
      throw new Error("Upload a valid wallpaper before saving.");
    }

    const cloudName = process.env.CLOUDINARY_CLOUD_NAME;

    if (
      !cloudName ||
      url.protocol !== "https:" ||
      url.hostname !== "res.cloudinary.com" ||
      url.port ||
      url.username ||
      url.password ||
      !url.pathname.startsWith(`/${cloudName}/image/upload/`) ||
      !/^ekos\/login-wallpapers\/[a-f0-9-]{36}$/.test(
        clean.wallpaperPublicId
      )
    ) {
      throw new Error("Use a wallpaper uploaded through Login Appearance.");
    }

    clean.wallpaperUrl = url.href;
  } else {
    clean.wallpaperPublicId = "";
    clean.wallpaperName = "";
  }

  if (clean.enabled && !clean.wallpaperUrl) {
    throw new Error("Upload a wallpaper before enabling its appearance.");
  }

  clean.startsAt = parseDate(input.startsAt ?? null, "start");
  clean.endsAt = parseDate(input.endsAt ?? null, "end");

  if (
    clean.startsAt &&
    clean.endsAt &&
    clean.endsAt <= clean.startsAt
  ) {
    throw new Error("The end must be later than the start.");
  }

  return clean;
};

const uploadLoginWallpaper = async (req, res) => {
  res.set("Cache-Control", "private, no-store");

  const format = detectImage(req.file?.buffer);

  if (!format) {
    return res.status(400).json({
      success: false,
      message: "Choose a valid JPG, PNG or WebP wallpaper.",
    });
  }

  try {
    const cloudinary = configureCloudinary();

    const asset = await new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          resource_type: "image",
          type: "upload",
          public_id: `ekos/login-wallpapers/${randomUUID()}`,
          overwrite: false,
          allowed_formats: ["jpg", "jpeg", "png", "webp"],
        },
        (error, result) => error ? reject(error) : resolve(result)
      );

      stream.on("error", reject);
      stream.end(req.file.buffer);
    });

    if (!asset?.secure_url || !asset.public_id) {
      throw new Error("Incomplete upload response.");
    }

    const name = String(req.file.originalname || `wallpaper.${format}`)
      .split(/[\\/]/)
      .pop()
      .replace(/[\u0000-\u001f\u007f]/g, "")
      .slice(0, 180);

    return res.status(201).json({
      success: true,
      message: "Wallpaper uploaded. Preview and save to apply it.",
      data: {
        wallpaperUrl: asset.secure_url,
        wallpaperPublicId: asset.public_id,
        wallpaperName: name,
      },
    });
  } catch (error) {
    console.error("Login wallpaper upload failed:", error.message);

    return res.status(502).json({
      success: false,
      message: "The wallpaper could not be uploaded. Please try again.",
    });
  }
};

const saveLoginAppearance = async (req, res) => {
  res.set("Cache-Control", "private, no-store");

  let updates;

  try {
    const body = req.body;

    if (
      !body ||
      typeof body !== "object" ||
      Array.isArray(body) ||
      Object.keys(body).length === 0 ||
      Object.keys(body).some(
        (portal) => !["admin", "customer"].includes(portal)
      )
    ) {
      throw new Error("Choose admin, customer, or both portals.");
    }

    updates = {};

    for (const portal of Object.keys(body)) {
      updates[`loginAppearance.${portal}`] =
        validateAppearance(body[portal]);
    }
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }

  try {
    const settings = await Setting.findOneAndUpdate(
      { settingKey: "main" },
      { $set: updates },
      {
        new: true,
        upsert: true,
        runValidators: true,
        setDefaultsOnInsert: true,
      }
    ).select("loginAppearance");

    return res.json({
      success: true,
      message: "Login appearance saved.",
      data: settings.loginAppearance,
    });
  } catch (error) {
    console.error("Login appearance save failed:", error.message);

    return res.status(500).json({
      success: false,
      message:
        "The save could not be confirmed. Reload appearance settings " +
        "to check the saved values.",
    });
  }
};

const getPublicLoginAppearance = async (req, res) => {
  res.set("Cache-Control", "no-store");

  const { portal } = req.params;

  if (!["admin", "customer"].includes(portal)) {
    return res.status(400).json({
      success: false,
      message: "Choose a valid portal.",
    });
  }

  try {
    // Reading a public login page must not create or change settings.
    const settings = await Setting.findOne({ settingKey: "main" })
      .select("companyName loginAppearance")
      .lean();

    const appearance = settings?.loginAppearance?.[portal];
    const now = new Date();

    const start = appearance?.startsAt
      ? new Date(appearance.startsAt)
      : null;
    const end = appearance?.endsAt
      ? new Date(appearance.endsAt)
      : null;

    const datesValid =
      (!start || Number.isFinite(start.getTime())) &&
      (!end || Number.isFinite(end.getTime()));

    const active = Boolean(
      appearance?.enabled &&
      appearance.wallpaperUrl &&
      datesValid &&
      (!start || now >= start) &&
      (!end || now < end)
    );

    const nextBoundary = appearance?.enabled && datesValid
      ? [start, end]
          .filter((date) => date && date > now)
          .sort((a, b) => a - b)[0]
      : null;

    return res.json({
      success: true,
      data: {
        companyName: settings?.companyName || "Eltham Konnect",
        active,
        serverTime: now.toISOString(),
        nextChangeAt: nextBoundary?.toISOString() || null,
        appearance: active
          ? {
              wallpaperUrl: appearance.wallpaperUrl,
              position: appearance.position || "center",
              overlayOpacity: appearance.overlayOpacity ?? 0.45,
              heading: appearance.heading || "",
              message: appearance.message || "",
            }
          : null,
      },
    });
  } catch (error) {
    console.error("Public login appearance failed:", error.message);

    return res.status(503).json({
      success: false,
      message: "Login appearance is temporarily unavailable.",
    });
  }
};

module.exports = {
  uploadLoginWallpaper,
  saveLoginAppearance,
  getPublicLoginAppearance,
};