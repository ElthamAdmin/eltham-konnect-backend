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

    const raw = item?.points;

    if (!label || label.length > 60) {
      throw new Error(
        "Every wheel segment needs a label of 1–60 characters."
      );
    }

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
        "Every segment needs a whole-number points amount " +
        "from 0 to 1,500."
      );
    }

    const points = Number(raw);

    if (
      !Number.isSafeInteger(points) ||
      points < 0 ||
      points > 1500
    ) {
      throw new Error(
        "Every segment needs a whole-number points amount " +
        "from 0 to 1,500."
      );
    }

    return {
      id: `segment-${index + 1}`,
      label,
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
    points: segment.points,
  };
};

module.exports = {
  createWheelConfig,
  selectWheelOutcome,
};