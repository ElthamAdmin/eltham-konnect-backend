const normalize = (value) =>
  value
    .normalize("NFKC")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();

const createHuntConfig = (input) => {
  if (
    !Array.isArray(input) ||
    input.length < 3 ||
    input.length > 8
  ) {
    throw new Error("Enter 3–8 Scavenger Hunt clues.");
  }

  const clues = input.map((item, index) => {
    const clue =
      typeof item?.clue === "string"
        ? item.clue.trim()
        : "";

    const answer =
      typeof item?.answer === "string"
        ? item.answer.trim()
        : "";

    const hint =
      item?.hint == null
        ? ""
        : typeof item.hint === "string"
          ? item.hint.trim()
          : null;

    if (!clue || clue.length > 300) {
      throw new Error(
        "Each clue needs 1–300 characters."
      );
    }

    if (
      !answer ||
      answer.length > 100 ||
      !normalize(answer)
    ) {
      throw new Error(
        "Each answer needs 1–100 characters."
      );
    }

    if (hint === null || hint.length > 160) {
      throw new Error(
        "Hints must contain at most 160 characters."
      );
    }

    return {
      id: `clue-${index + 1}`,
      clue,
      answer,
      hint,
    };
  });

  return {
    publicConfig: {
      huntVersion: 1,
      clues: clues.map(({ id, clue, hint }) => ({
        id,
        clue,
        hint,
      })),
      rules:
        "Solve every clue, then submit the completed hunt. " +
        "Incomplete or incorrect hunts can be corrected " +
        "before completion is recorded.",
    },
    privateConfig: {
      huntAnswers: clues.map(({ id, answer }) => ({
        id,
        answer,
      })),
    },
  };
};

const validateHuntSubmission = (
  publicConfig,
  privateConfig,
  submittedAnswer
) => {
  try {
    const clues = publicConfig?.clues;
    const expected = privateConfig?.huntAnswers;

    if (
      publicConfig?.huntVersion !== 1 ||
      !Array.isArray(clues) ||
      clues.length < 3 ||
      clues.length > 8 ||
      !Array.isArray(expected) ||
      expected.length !== clues.length ||
      typeof submittedAnswer !== "string" ||
      submittedAnswer.length > 2000
    ) {
      return false;
    }

    const submitted = JSON.parse(submittedAnswer);

    if (
      !Array.isArray(submitted) ||
      submitted.length !== clues.length
    ) {
      return false;
    }

    const seen = new Set();

    return clues.every((clue, index) => {
      const correct = expected[index];

      if (
        clue?.id !== `clue-${index + 1}` ||
        correct?.id !== clue.id ||
        typeof correct.answer !== "string" ||
        !normalize(correct.answer)
      ) {
        return false;
      }

      const entry = submitted[index];

      if (
        entry?.id !== clue.id ||
        seen.has(entry.id) ||
        typeof entry.answer !== "string" ||
        entry.answer.length > 100
      ) {
        return false;
      }

      seen.add(entry.id);

      return (
        normalize(entry.answer) === normalize(correct.answer)
      );
    });
  } catch {
    return false;
  }
};

module.exports = {
  createHuntConfig,
  validateHuntSubmission,
};