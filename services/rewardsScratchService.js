const {
  createWheelConfig,
  selectWheelOutcome,
} = require("./rewardsWheelService");

const createScratchConfig = (input) => {
  // Reuse the same prize validation, types and colours.
  let checked;

  try {
    checked = createWheelConfig(input);
  } catch (error) {
    throw new Error(
      error.message.replace(
        "Enter 4–12 wheel segments.",
        "Enter 4–12 possible Scratch Card prizes."
      )
    );
  }

  return {
    scratchVersion: 1,
    selection: "equal-prizes",
    prizes: checked.segments,
    revealThreshold: 50,
    rules:
      "One Scratch Card per customer for this game. " +
      "Each listed prize has an equal chance. " +
      "Your result is selected and saved when you start the card. " +
      "Scratch the cover to reveal it. " +
      "Gift cards, phone credit and other prizes are " +
      "fulfilled separately by Eltham Konnect. " +
      "EK Points are subject to the 1,500-point balance limit.",
  };
};

const selectScratchOutcome = (config) => {
  if (
    config?.scratchVersion !== 1 ||
    config?.selection !== "equal-prizes"
  ) {
    throw new Error("Unsupported Scratch Card configuration.");
  }

  // Returns the same saved outcome structure used by the wheel:
  // prize label, type, points and fulfilment status.
  return selectWheelOutcome({
    wheelVersion: 1,
    selection: "equal-segments",
    segments: config.prizes,
  });
};

module.exports = {
  createScratchConfig,
  selectScratchOutcome,
};