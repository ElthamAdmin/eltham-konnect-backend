const PortalBanner = require("../models/PortalBanner");

const ALLOWED_TYPES = [
  "Information",
  "Important",
  "Urgent",
];

const getUserName = (req) =>
  req.user?.fullName ||
  req.user?.name ||
  req.user?.email ||
  "System User";

const normalizeBannerInput = (body = {}) => {
  const message = String(body.message || "").trim();
  const type = String(body.type || "Information").trim();
  const linkUrl = String(body.linkUrl || "").trim();
  const linkLabel = String(body.linkLabel || "").trim();

  const startAt = body.startAt
    ? new Date(body.startAt)
    : null;

  const endAt = body.endAt
    ? new Date(body.endAt)
    : null;

  return {
    message,
    type,
    linkUrl,
    linkLabel,
    startAt,
    endAt,
    isActive:
      body.isActive === undefined
        ? true
        : Boolean(body.isActive),
  };
};

const validateBannerInput = ({
  message,
  type,
  linkUrl,
  linkLabel,
  startAt,
  endAt,
}) => {
  if (!message) {
    return "Banner message is required.";
  }

  if (message.length > 240) {
    return "Banner message cannot exceed 240 characters.";
  }

  if (!ALLOWED_TYPES.includes(type)) {
    return "Please select a valid banner type.";
  }

  if (
    !startAt ||
    Number.isNaN(startAt.getTime()) ||
    !endAt ||
    Number.isNaN(endAt.getTime())
  ) {
    return "Valid start and end dates are required.";
  }

  if (endAt <= startAt) {
    return "Banner end date must be after its start date.";
  }

  if (linkLabel && !linkUrl) {
    return "A link URL is required when a button label is provided.";
  }

  if (
    linkUrl &&
    !/^https?:\/\//i.test(linkUrl) &&
    !linkUrl.startsWith("/")
  ) {
    return "Banner link must use http://, https://, or an internal path beginning with /.";
  }

  return "";
};

const serializeBanner = (banner, now = new Date()) => {
  const value =
    typeof banner?.toObject === "function"
      ? banner.toObject()
      : banner;

  let scheduleStatus = "Scheduled";

  if (value.isArchived) {
    scheduleStatus = "Archived";
  } else if (!value.isActive) {
    scheduleStatus = "Inactive";
  } else if (new Date(value.endAt) < now) {
    scheduleStatus = "Expired";
  } else if (
    new Date(value.startAt) <= now &&
    new Date(value.endAt) >= now
  ) {
    scheduleStatus = "Live";
  }

  return {
    ...value,
    scheduleStatus,
  };
};

const getActivePortalBanners = async (req, res) => {
  try {
    const now = new Date();

    const banners = await PortalBanner.find({
      isActive: true,
      isArchived: false,
      startAt: { $lte: now },
      endAt: { $gte: now },
    })
      .select(
        "message type linkUrl linkLabel startAt endAt createdAt updatedAt"
      )
      .sort({ createdAt: -1 })
      .lean();

    return res.json({
      success: true,
      totalBanners: banners.length,
      data: banners,
    });
  } catch (error) {
    console.error("Active portal banner error:", error);

    return res.status(500).json({
      success: false,
      message: "Could not load portal announcements.",
    });
  }
};

const getPortalBanners = async (req, res) => {
  try {
    const now = new Date();

    const banners = await PortalBanner.find({
      isArchived: false,
    }).sort({ createdAt: -1 });

    return res.json({
      success: true,
      totalBanners: banners.length,
      data: banners.map((banner) =>
        serializeBanner(banner, now)
      ),
    });
  } catch (error) {
    console.error("Portal banner list error:", error);

    return res.status(500).json({
      success: false,
      message: "Could not load portal banners.",
    });
  }
};

const createPortalBanner = async (req, res) => {
  try {
    const input = normalizeBannerInput(req.body);
    const validationError = validateBannerInput(input);

    if (validationError) {
      return res.status(400).json({
        success: false,
        message: validationError,
      });
    }

    const banner = await PortalBanner.create({
      ...input,
      isArchived: false,
      createdBy: getUserName(req),
      updatedBy: getUserName(req),
    });

    return res.status(201).json({
      success: true,
      message: "Portal banner created successfully.",
      data: serializeBanner(banner),
    });
  } catch (error) {
    console.error("Create portal banner error:", error);

    return res.status(500).json({
      success: false,
      message: "Could not create portal banner.",
      error: error.message,
    });
  }
};

const updatePortalBanner = async (req, res) => {
  try {
    const input = normalizeBannerInput(req.body);
    const validationError = validateBannerInput(input);

    if (validationError) {
      return res.status(400).json({
        success: false,
        message: validationError,
      });
    }

    const banner = await PortalBanner.findOneAndUpdate(
      {
        _id: req.params.bannerId,
        isArchived: false,
      },
      {
        $set: {
          ...input,
          updatedBy: getUserName(req),
        },
      },
      {
        new: true,
        runValidators: true,
      }
    );

    if (!banner) {
      return res.status(404).json({
        success: false,
        message: "Portal banner not found.",
      });
    }

    return res.json({
      success: true,
      message: "Portal banner updated successfully.",
      data: serializeBanner(banner),
    });
  } catch (error) {
    console.error("Update portal banner error:", error);

    return res.status(500).json({
      success: false,
      message: "Could not update portal banner.",
      error: error.message,
    });
  }
};

const archivePortalBanner = async (req, res) => {
  try {
    const banner = await PortalBanner.findOneAndUpdate(
      {
        _id: req.params.bannerId,
        isArchived: false,
      },
      {
        $set: {
          isActive: false,
          isArchived: true,
          updatedBy: getUserName(req),
        },
      },
      {
        new: true,
      }
    );

    if (!banner) {
      return res.status(404).json({
        success: false,
        message: "Portal banner not found.",
      });
    }

    return res.json({
      success: true,
      message: "Portal banner archived successfully.",
    });
  } catch (error) {
    console.error("Archive portal banner error:", error);

    return res.status(500).json({
      success: false,
      message: "Could not archive portal banner.",
      error: error.message,
    });
  }
};

module.exports = {
  getActivePortalBanners,
  getPortalBanners,
  createPortalBanner,
  updatePortalBanner,
  archivePortalBanner,
};