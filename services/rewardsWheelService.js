const crypto = require("crypto");

const COLORS = [
  "#1d4ed8",
  "#c2410c",
  "#7c3aed",
  "#0f766e",
  "#be185d",
  "#4338ca",
  "#166534",
  "#a16207",
  "#0369a1",
  "#a21caf",
  "#9f1239",
  "#374151",
];

const PRIZE_TYPES = [
  "Points",
  "Gift Card",
  "Phone Credit",
  "Other",
  "No Prize",
];

const MANUAL_PRIZES = [
  "Gift Card",
  "Phone Credit",
  "Other",
];

const createWheelConfig = (input) => {
  if (
    !Array.isArray(input) ||
    input.length < 4 ||
    input.length > 12
  ) {
    throw new Error("Enter 4–12 wheel segments.");
  }

  const segments = input.map((item, index) => {
    const label =
      typeof item?.label === "string"
        ? item.label.trim()
        : "";

    if (!label || label.length > 60) {
      throw new Error(
        "Every wheel segment needs a label of 1–60 characters."
      );
    }

    const raw = item?.points;

    if (
      !(
        typeof raw === "number" ||
        (
          typeof raw === "string" &&
          /^\d+$/.test(raw.trim())
        )
      )
    ) {
      throw new Error(
        "Enter a whole-number EK Points amount from 0 to 1,500. " +
        "Use 0 for gift cards, phone credit and other prizes."
      );
    }

    const points = Number(raw);

    if (
      !Number.isSafeInteger(points) ||
      points < 0 ||
      points > 1500
    ) {
      throw new Error(
        "EK Points must be a whole number from 0 to 1,500."
      );
    }

    // Compatibility with previously configured points-only wheels.
    const prizeType =
      item.prizeType == null
        ? points > 0
          ? "Points"
          : "No Prize"
        : item.prizeType;

    if (!PRIZE_TYPES.includes(prizeType)) {
      throw new Error("Select a valid prize type for every segment.");
    }

    if (prizeType === "Points" && points === 0) {
      throw new Error(
        "An EK Points prize must award at least 1 point. " +
        "Choose No Prize for a non-winning segment."
      );
    }

    if (prizeType !== "Points" && points !== 0) {
      throw new Error(
        "Only EK Points prizes can contain a points amount. " +
        "Set points to 0 for all other prize types."
      );
    }

    return {
      id: `segment-${index + 1}`,
      label,
      prizeType,
      points,
      color: COLORS[index],
    };
  });

  return {
    wheelVersion: 1,
    selection: "equal-segments",
    segments,
    rules:
      "One spin per customer for this game. " +
      "Every segment has an equal chance. " +
      "The server selects and saves the result. " +
      "Gift cards, phone credit and other prizes are " +
      "fulfilled separately by Eltham Konnect. " +
      "EK Points are subject to the 1,500-point balance limit.",
  };
};

const selectWheelOutcome = (config) => {
  if (
    config?.wheelVersion !== 1 ||
    config?.selection !== "equal-segments"
  ) {
    throw new Error("Unsupported wheel configuration.");
  }

  const checked = createWheelConfig(config.segments);

  if (
    checked.segments.some(
      (segment, index) =>
        segment.id !== config.segments[index].id
    )
  ) {
    throw new Error("Invalid wheel segment identifiers.");
  }

  const segmentIndex = crypto.randomInt(
    checked.segments.length
  );

  const segment = checked.segments[segmentIndex];

  return {
    segmentId: segment.id,
    segmentIndex,
    label: segment.label,
    prizeType: segment.prizeType,
    points: segment.points,
    fulfilmentStatus: MANUAL_PRIZES.includes(segment.prizeType)
      ? "Pending"
      : "Not Required",
  };
};

module.exports = {
  createWheelConfig,
  selectWheelOutcome,
};