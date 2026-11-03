const crypto = require("crypto");

const SIZE = 12;

const DIRECTIONS = [
  [-1, -1], [-1, 0], [-1, 1],
  [0, -1],           [0, 1],
  [1, -1],  [1, 0],  [1, 1],
];

const DEFAULT_WORDS = [
  "ELTHAM",
  "KONNECT",
  "PACKAGE",
  "SHIPPING",
  "CUSTOMER",
  "REWARDS",
];

const shuffle = (values) => {
  const result = [...values];

  for (let index = result.length - 1; index > 0; index -= 1) {
    const other = crypto.randomInt(index + 1);
    [result[index], result[other]] = [
      result[other],
      result[index],
    ];
  }

  return result;
};

const normalizeWords = (input) => {
  const values =
    input == null || input === ""
      ? DEFAULT_WORDS
      : typeof input === "string"
        ? input.split(",")
        : input;

  if (!Array.isArray(values)) {
    throw new Error("Provide words separated by commas.");
  }

  const words = values.map((value) =>
    String(value).trim().toUpperCase()
  );

  if (
    words.length < 3 ||
    words.length > 10 ||
    words.some((word) => !/^[A-Z]{3,12}$/.test(word)) ||
    new Set(words).size !== words.length
  ) {
    throw new Error(
      "Use 3–10 different words, each containing 3–12 letters A–Z."
    );
  }

  return words;
};

const inside = (row, column) =>
  row >= 0 && row < SIZE && column >= 0 && column < SIZE;

const createWordSearchConfig = (input) => {
  const words = normalizeWords(input);

  for (let attempt = 0; attempt < 50; attempt += 1) {
    const grid = Array.from(
      { length: SIZE },
      () => Array(SIZE).fill("")
    );

    let complete = true;

    for (const word of [...words].sort(
      (a, b) => b.length - a.length
    )) {
      const candidates = [];

      for (let row = 0; row < SIZE; row += 1) {
        for (let column = 0; column < SIZE; column += 1) {
          for (const [dr, dc] of DIRECTIONS) {
            const endRow = row + dr * (word.length - 1);
            const endColumn = column + dc * (word.length - 1);

            if (!inside(endRow, endColumn)) continue;

            const fits = [...word].every((letter, index) => {
              const cell = grid[row + dr * index][column + dc * index];
              return !cell || cell === letter;
            });

            if (fits) candidates.push({ row, column, dr, dc });
          }
        }
      }

      if (!candidates.length) {
        complete = false;
        break;
      }

      const chosen = shuffle(candidates)[0];

      [...word].forEach((letter, index) => {
        grid[chosen.row + chosen.dr * index][
          chosen.column + chosen.dc * index
        ] = letter;
      });
    }

    if (!complete) continue;

    for (let row = 0; row < SIZE; row += 1) {
      for (let column = 0; column < SIZE; column += 1) {
        if (!grid[row][column]) {
          grid[row][column] = String.fromCharCode(
            65 + crypto.randomInt(26)
          );
        }
      }
    }

    return {
      grid,
      words,
      rules:
        "Find every listed word. Select its first letter, then its " +
        "last letter. Words can run horizontally, vertically or " +
        "diagonally, in either direction.",
    };
  }

  throw new Error(
    "Could not place these words. Try fewer or shorter words."
  );
};

const validateWordSearchSubmission = (config, answer) => {
  let selections;

  try {
    selections = JSON.parse(answer);
  } catch {
    return false;
  }

  const { grid, words } = config || {};

  if (
    !Array.isArray(grid) ||
    grid.length !== SIZE ||
    !grid.every(
      (row) =>
        Array.isArray(row) &&
        row.length === SIZE &&
        row.every((cell) => /^[A-Z]$/.test(cell))
    ) ||
    !Array.isArray(words) ||
    words.length < 3 ||
    !words.every(
      (word) => typeof word === "string" && /^[A-Z]{3,12}$/.test(word)
    ) ||
    new Set(words).size !== words.length ||
    !Array.isArray(selections) ||
    selections.length !== words.length
  ) {
    return false;
  }

  const found = new Set();

  for (const selection of selections) {
    const { start, end } = selection || {};

    if (
      !Array.isArray(start) ||
      !Array.isArray(end) ||
      start.length !== 2 ||
      end.length !== 2 ||
      ![...start, ...end].every(Number.isInteger) ||
      !inside(...start) ||
      !inside(...end)
    ) {
      return false;
    }

    const rowDistance = end[0] - start[0];
    const columnDistance = end[1] - start[1];

    if (
      (rowDistance === 0 && columnDistance === 0) ||
      (
        rowDistance !== 0 &&
        columnDistance !== 0 &&
        Math.abs(rowDistance) !== Math.abs(columnDistance)
      )
    ) {
      return false;
    }

    const length =
      Math.max(Math.abs(rowDistance), Math.abs(columnDistance)) + 1;

    const dr = Math.sign(rowDistance);
    const dc = Math.sign(columnDistance);

    const selected = Array.from(
      { length },
      (_, index) =>
        grid[start[0] + dr * index][start[1] + dc * index]
    ).join("");

    const reversed = [...selected].reverse().join("");

    const matched = words.find(
      (word) =>
        !found.has(word) &&
        (word === selected || word === reversed)
    );

    if (!matched) return false;
    found.add(matched);
  }

  return found.size === words.length;
};

module.exports = {
  createWordSearchConfig,
  validateWordSearchSubmission,
};