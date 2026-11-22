const { Types } = require("mongoose");
const { randomUUID } = require("crypto");
const Setting = require("../models/Setting");
const { configureCloudinary } = require("../config/cloudinary");

const ICON_SIZES = [180, 192, 512];

const uploadSeasonalIcon = async (req, res) => {
  res.set("Cache-Control", "private, no-store");

  if (!req.file?.buffer?.length) {
    return res.status(400).json({
      success: false,
      message: "Choose a square JPG, PNG or WebP image.",
    });
  }

  const publicId = `ekos/seasonal-icons/${randomUUID()}`;
  let cloudinary;
  let uploaded = false;

  try {
    cloudinary = configureCloudinary();

    const asset = await new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          resource_type: "image",
          public_id: publicId,
          overwrite: false,
          allowed_formats: ["jpg", "jpeg", "png", "webp"],
          eager: ICON_SIZES.map((size) => ({
            width: size,
            height: size,
            crop: "fit",
            format: "png",
          })),
        },
        (error, result) => {
          if (error) return reject(error);
          resolve(result);
        }
      );

      stream.on("error", reject);
      stream.end(req.file.buffer);
    });

    uploaded = true;

    // Validate the original dimensions reported by Cloudinary.
    if (
      !Number.isInteger(asset?.width) ||
      asset.width !== asset.height ||
      asset.width < 512
    ) {
      const error = new Error("Choose a square image at least 512 × 512 pixels.");
      error.statusCode = 400;
      throw error;
    }

    const icons = {};
    for (const size of ICON_SIZES) {
      const variant = asset.eager?.find(
        (item) =>
          item.width === size &&
          item.height === size &&
          item.format === "png" &&
          item.secure_url
      );

      if (!variant) {
        throw new Error(`Cloudinary did not return the ${size}px PNG.`);
      }
      icons[size] = variant.secure_url;
    }

    return res.status(201).json({
      success: true,
      message: "Seasonal icon prepared.",
      data: { publicId, icons },
    });
  } catch (error) {
    if (uploaded) {
      try {
        await cloudinary.uploader.destroy(publicId, { resource_type: "image" });
      } catch (cleanupError) {
        console.error("Seasonal icon cleanup failed:", publicId, cleanupError.message);
      }
    }

    if (error.statusCode === 400 || error.http_code === 400) {
      return res.status(400).json({
        success: false,
        message: error.statusCode === 400
          ? error.message
          : "The image could not be processed. Choose a JPG, PNG or WebP file.",
      });
    }

    console.error("Seasonal icon upload failed:", error.message);
    return res.status(502).json({
      success: false,
      message: "The seasonal icon could not be prepared. Please try again.",
    });
  }
};

// The form sends Jamaica calendar dates as YYYY-MM-DD.
// Check the calendar date before converting local midnight to UTC.
function jamaicaMidnight(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }

  const midnight = new Date(`${value}T00:00:00-05:00`);

  if (
    !Number.isFinite(midnight.getTime()) ||
    midnight.toISOString().slice(0, 10) !== value
  ) {
    return null;
  }

  return midnight;
}

const scheduleSeasonalCampaign = async (req, res) => {
  res.set("Cache-Control", "private, no-store");

    const { campaignId } = req.params;
  const isEditing = campaignId !== undefined;

  if (isEditing && !/^[a-f0-9]{24}$/i.test(campaignId)) {
    return res.status(400).json({
      success: false,
      message: "Choose a valid saved event.",
    });
  }

  const { name, startsOn, endsOn, publicId } = req.body || {};
  const hasNewIcon = publicId !== undefined;
  const eventName = typeof name === "string" ? name.trim() : "";
  const startsAt = jamaicaMidnight(startsOn);
  const lastDay = jamaicaMidnight(endsOn);

  if (!eventName || eventName.length > 120) {
    return res.status(400).json({
      success: false,
      message: "Enter an event name of up to 120 characters.",
    });
  }

  if (!startsAt || !lastDay || lastDay < startsAt) {
    return res.status(400).json({
      success: false,
      message: "Choose valid dates. The last active day can be the start day or later.",
    });
  }

    if (
    (!isEditing || hasNewIcon) &&
    (
      typeof publicId !== "string" ||
      !/^ekos\/seasonal-icons\/[a-f0-9-]{36}$/.test(publicId)
    )
  ) {
    return res.status(400).json({
      success: false,
      message: "Upload a valid seasonal icon before saving.",
    });
  }

  // The end is exclusive. A Friday-only event ends at midnight on Saturday.
  const endsAt = new Date(lastDay.getTime() + 24 * 60 * 60 * 1000);

    try {
    const campaign = { name: eventName, startsAt, endsAt };

    if (hasNewIcon) {
      const cloudinary = configureCloudinary();
      const asset = await cloudinary.api.resource(publicId, {
        resource_type: "image",
        type: "upload",
      });

      if (
        asset.public_id !== publicId ||
        !["png", "jpg", "jpeg", "webp"].includes(asset.format) ||
        !Number.isInteger(asset.width) ||
        asset.width !== asset.height ||
        asset.width < 512
      ) {
        return res.status(400).json({
          success: false,
          message: "Choose a square seasonal icon at least 512 × 512 pixels.",
        });
      }

      campaign.publicId = publicId;
      campaign.icons = {};

      for (const size of ICON_SIZES) {
        campaign.icons[size] = cloudinary.url(publicId, {
          secure: true,
          version: asset.version,
          format: "png",
          transformation: [{ width: size, height: size, crop: "fit" }],
        });
      }
    }

    const overlap = {
      startsAt: { $lt: endsAt },
      endsAt: { $gt: startsAt },
    };
    const options = { new: true, runValidators: true };
    let saved;

    if (isEditing) {
      const id = new Types.ObjectId(campaignId);
      const updates = {
        "seasonalCampaigns.$[event].name": campaign.name,
        "seasonalCampaigns.$[event].startsAt": campaign.startsAt,
        "seasonalCampaigns.$[event].endsAt": campaign.endsAt,
      };

      if (hasNewIcon) {
        updates["seasonalCampaigns.$[event].publicId"] = campaign.publicId;
        updates["seasonalCampaigns.$[event].icons"] = campaign.icons;
      }

      saved = await Setting.findOneAndUpdate(
        {
          settingKey: "main",
          "seasonalCampaigns._id": id,
          seasonalCampaigns: {
            $not: { $elemMatch: { ...overlap, _id: { $ne: id } } },
          },
        },
        { $set: updates },
        { ...options, arrayFilters: [{ "event._id": id }] }
      ).select("seasonalCampaigns");

      if (!saved) {
        const exists = await Setting.exists({
          settingKey: "main",
          "seasonalCampaigns._id": id,
        });

        if (!exists) {
          return res.status(404).json({
            success: false,
            message: "This event is no longer available. Reload Settings.",
          });
        }
      }
    } else {
      await Setting.updateOne(
        { settingKey: "main" },
        { $setOnInsert: { settingKey: "main" } },
        { upsert: true, setDefaultsOnInsert: true }
      );

      saved = await Setting.findOneAndUpdate(
        {
          settingKey: "main",
          seasonalCampaigns: { $not: { $elemMatch: overlap } },
        },
        { $push: { seasonalCampaigns: campaign } },
        options
      ).select("seasonalCampaigns");
    }

    if (!saved) {
      return res.status(409).json({
        success: false,
        message: "Another seasonal event covers part of this date range. Check the saved schedule.",
      });
    }

    return res.status(isEditing ? 200 : 201).json({
      success: true,
      message: isEditing ? "Seasonal campaign updated." : "Seasonal campaign scheduled.",
      data: saved.seasonalCampaigns,
    });
    
  } catch (error) {
    if (error.http_code === 404 || error.error?.http_code === 404) {
      return res.status(400).json({
        success: false,
        message: "The uploaded icon could not be found. Upload the artwork again.",
      });
    }

    console.error("Seasonal campaign save failed:", error.message);
    return res.status(500).json({
      success: false,
      message: "The save could not be confirmed. Reload Settings to check the schedule.",
    });
  }
};

const getPublicSeasonalBranding = async (req, res) => {
  res.set("Cache-Control", "no-store");

  try {
    const settings = await Setting.findOne({ settingKey: "main" })
      .select("seasonalCampaigns")
      .lean();

    const campaigns = settings?.seasonalCampaigns || [];
    const now = new Date();

    const active = campaigns.find(
      (campaign) => campaign.startsAt <= now && now < campaign.endsAt
    );

    // An open portal can refresh when the next campaign starts or ends.
    let nextChangeAt = null;

    for (const campaign of campaigns) {
      for (const boundary of [campaign.startsAt, campaign.endsAt]) {
        if (boundary > now && (!nextChangeAt || boundary < nextChangeAt)) {
          nextChangeAt = boundary;
        }
      }
    }

    return res.json({
      success: true,
      data: {
        serverTime: now.toISOString(),
        nextChangeAt,
        campaign: active
          ? {
              name: active.name,
              icons: {
                "180": active.icons["180"],
                "192": active.icons["192"],
                "512": active.icons["512"],
              },
            }
          : null,
      },
    });
  } catch (error) {
    console.error("Could not read seasonal branding:", error.message);

    return res.status(503).json({
      success: false,
      message: "Seasonal branding is temporarily unavailable.",
    });
  }
};

module.exports = {
  uploadSeasonalIcon,
  scheduleSeasonalCampaign,
  getPublicSeasonalBranding,
};