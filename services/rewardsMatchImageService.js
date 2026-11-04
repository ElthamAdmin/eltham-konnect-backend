const crypto = require("crypto");

const normalize = (value) =>
  value.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();

const shuffle = (items) => {
  const result = [...items];

  for (let index = result.length - 1; index > 0; index -= 1) {
    const other = crypto.randomInt(index + 1);
    [result[index], result[other]] = [result[other], result[index]];
  }

  return result;
};

const createMatchImageConfig = (input) => {
  if (!Array.isArray(input) || input.length < 3 || input.length > 8) {
    throw new Error("Enter 3–8 image-and-label pairs.");
  }

  const labelsSeen = new Set();
  const imagesSeen = new Set();

  const pairs = input.map((item, index) => {
    const label =
      typeof item?.label === "string" ? item.label.trim() : "";

    const imageUrl =
      typeof item?.imageUrl === "string" ? item.imageUrl.trim() : "";

    if (!label || label.length > 80) {
      throw new Error("Every image needs a label of 1–80 characters.");
    }

    if (!imageUrl || imageUrl.length > 1000) {
      throw new Error("Every image needs an HTTPS image URL.");
    }

    let parsedUrl;

    try {
      parsedUrl = new URL(imageUrl);
    } catch {
      throw new Error("Enter a valid HTTPS image URL for every image.");
    }

    if (
      parsedUrl.protocol !== "https:" ||
      parsedUrl.username ||
      parsedUrl.password ||
      !parsedUrl.hostname
    ) {
      throw new Error(
        "Image URLs must use HTTPS and must not contain login details."
      );
    }

    const normalizedLabel = normalize(label);
    const normalizedUrl = parsedUrl.href;

    if (labelsSeen.has(normalizedLabel)) {
      throw new Error("Use a different label for every image.");
    }

    if (imagesSeen.has(normalizedUrl)) {
      throw new Error("Use a different image URL for every pair.");
    }

    labelsSeen.add(normalizedLabel);
    imagesSeen.add(normalizedUrl);

    return {
      imageId: `image-${index + 1}`,
      labelId: `label-${crypto.randomUUID()}`,
      imageUrl: normalizedUrl,
      label,
    };
  });

  return {
    publicConfig: {
      matchImageVersion: 1,
      images: pairs.map((pair, index) => ({
        id: pair.imageId,
        imageUrl: pair.imageUrl,
        alt: `Matching image ${index + 1}`,
      })),
      labels: shuffle(
        pairs.map((pair) => ({
          id: pair.labelId,
          text: pair.label,
        }))
      ),
      rules:
        "Match every image to its correct label. " +
        "Use each label once, then submit all matches. " +
        "Incorrect matches can be corrected before completion. " +
        "One completed play is recorded per customer.",
    },
    privateConfig: {
      imageMatches: pairs.map((pair) => ({
        imageId: pair.imageId,
        labelId: pair.labelId,
      })),
    },
  };
};

const validateMatchImageSubmission = (
  publicConfig,
  privateConfig,
  submittedAnswer
) => {
  try {
    const images = publicConfig?.images;
    const labels = publicConfig?.labels;
    const correctMatches = privateConfig?.imageMatches;

    if (
      publicConfig?.matchImageVersion !== 1 ||
      !Array.isArray(images) ||
      images.length < 3 ||
      images.length > 8 ||
      !Array.isArray(labels) ||
      labels.length !== images.length ||
      !Array.isArray(correctMatches) ||
      correctMatches.length !== images.length ||
      typeof submittedAnswer !== "string" ||
      submittedAnswer.length > 2000
    ) {
      return false;
    }

    const imageIds = new Set(images.map((image) => image?.id));
    const labelIds = new Set(labels.map((label) => label?.id));

    if (
      imageIds.size !== images.length ||
      labelIds.size !== labels.length ||
      ![...imageIds].every(
        (id) => typeof id === "string" && id.length > 0
      ) ||
      ![...labelIds].every(
        (id) => typeof id === "string" && id.length > 0
      )
    ) {
      return false;
    }

    const answerKey = new Map();
    const configuredLabels = new Set();

    for (const match of correctMatches) {
      if (
        !imageIds.has(match?.imageId) ||
        !labelIds.has(match?.labelId) ||
        answerKey.has(match.imageId) ||
        configuredLabels.has(match.labelId)
      ) {
        return false;
      }

      answerKey.set(match.imageId, match.labelId);
      configuredLabels.add(match.labelId);
    }

    const submitted = JSON.parse(submittedAnswer);

    if (
      !Array.isArray(submitted) ||
      submitted.length !== images.length
    ) {
      return false;
    }

    const submittedImages = new Set();
    const submittedLabels = new Set();

    for (const match of submitted) {
      if (
        !imageIds.has(match?.imageId) ||
        !labelIds.has(match?.labelId) ||
        submittedImages.has(match.imageId) ||
        submittedLabels.has(match.labelId) ||
        answerKey.get(match.imageId) !== match.labelId
      ) {
        return false;
      }

      submittedImages.add(match.imageId);
      submittedLabels.add(match.labelId);
    }

    return true;
  } catch {
    return false;
  }
};

module.exports = {
  createMatchImageConfig,
  validateMatchImageSubmission,
};