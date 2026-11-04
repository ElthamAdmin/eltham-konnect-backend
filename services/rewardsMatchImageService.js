const crypto = require("crypto");

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
    throw new Error("Upload 3–8 different images for the memory game.");
  }

  const imagesSeen = new Set();
  const cards = [];
  const memoryPairs = [];

  input.forEach((item) => {
    const imageUrl =
      typeof item?.imageUrl === "string"
        ? item.imageUrl.trim()
        : "";

    if (!imageUrl || imageUrl.length > 1000) {
      throw new Error("Every image needs a valid uploaded image URL.");
    }

    let url;

    try {
      url = new URL(imageUrl);
    } catch {
      throw new Error("Every image needs a valid HTTPS image URL.");
    }

    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      !url.hostname ||
      url.href.length > 1000
    ) {
      throw new Error(
        "Image URLs must use HTTPS without login details."
      );
    }

    if (imagesSeen.has(url.href)) {
      throw new Error(
        "Upload each image once. The game creates its matching copy."
      );
    }

    imagesSeen.add(url.href);

    const firstCardId = crypto.randomBytes(16).toString("hex");
    const secondCardId = crypto.randomBytes(16).toString("hex");

    cards.push(
      {
        id: firstCardId,
        imageUrl: url.href,
        alt: "Memory card image",
      },
      {
        id: secondCardId,
        imageUrl: url.href,
        alt: "Memory card image",
      }
    );

    memoryPairs.push({
      cardIds: [firstCardId, secondCardId],
    });
  });

  return {
    publicConfig: {
      matchImageVersion: 2,
      presentation: "memory-pairs",
      pairCount: input.length,
      cards: shuffle(cards),
      mismatchDelayMs: 1000,
      rules:
        "Reveal two cards at a time. Matching images stay revealed. " +
        "Different images turn face down again. " +
        "Match every pair to complete the game. " +
        "Play again reshuffles the cards. " +
        "Completed games earn game score; reward limits still apply.",
    },
    privateConfig: {
      memoryPairs,
    },
  };
};

const validateLegacyMatchImageSubmission = (
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

const validateMatchImageSubmission = (
  publicConfig,
  privateConfig,
  submittedAnswer
) => {
  // Preserve validation for previously created label-matching games.
  if (publicConfig?.matchImageVersion === 1) {
    return validateLegacyMatchImageSubmission(
      publicConfig,
      privateConfig,
      submittedAnswer
    );
  }

  try {
    const cards = publicConfig?.cards;
    const pairs = privateConfig?.memoryPairs;
    const pairCount = publicConfig?.pairCount;

    if (
      publicConfig?.matchImageVersion !== 2 ||
      publicConfig?.presentation !== "memory-pairs" ||
      !Number.isInteger(pairCount) ||
      pairCount < 3 ||
      pairCount > 8 ||
      !Array.isArray(cards) ||
      cards.length !== pairCount * 2 ||
      !Array.isArray(pairs) ||
      pairs.length !== pairCount ||
      typeof submittedAnswer !== "string" ||
      submittedAnswer.length > 2000
    ) {
      return false;
    }

    const cardMap = new Map();

    for (const card of cards) {
      if (
        typeof card?.id !== "string" ||
        !/^[a-f0-9]{32}$/.test(card.id) ||
        cardMap.has(card.id) ||
        typeof card.imageUrl !== "string" ||
        !card.imageUrl
      ) {
        return false;
      }

      cardMap.set(card.id, card);
    }

    const partners = new Map();
    const imageUrls = new Set();

    for (const pair of pairs) {
      if (
        !Array.isArray(pair?.cardIds) ||
        pair.cardIds.length !== 2
      ) {
        return false;
      }

      const [firstId, secondId] = pair.cardIds;
      const first = cardMap.get(firstId);
      const second = cardMap.get(secondId);

      if (
        !first ||
        !second ||
        firstId === secondId ||
        partners.has(firstId) ||
        partners.has(secondId) ||
        first.imageUrl !== second.imageUrl ||
        imageUrls.has(first.imageUrl)
      ) {
        return false;
      }

      partners.set(firstId, secondId);
      partners.set(secondId, firstId);
      imageUrls.add(first.imageUrl);
    }

    if (partners.size !== cards.length) return false;

    const submitted = JSON.parse(submittedAnswer);

    if (
      !Array.isArray(submitted) ||
      submitted.length !== pairCount
    ) {
      return false;
    }

    const usedCards = new Set();

    for (const match of submitted) {
      const firstId = match?.firstCardId;
      const secondId = match?.secondCardId;

      if (
        typeof firstId !== "string" ||
        typeof secondId !== "string" ||
        !partners.has(firstId) ||
        partners.get(firstId) !== secondId ||
        usedCards.has(firstId) ||
        usedCards.has(secondId)
      ) {
        return false;
      }

      usedCards.add(firstId);
      usedCards.add(secondId);
    }

    return usedCards.size === cards.length;
  } catch {
    return false;
  }
};


module.exports = {
  createMatchImageConfig,
  validateMatchImageSubmission,
};