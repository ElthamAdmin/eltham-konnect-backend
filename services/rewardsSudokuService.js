const crypto = require("crypto");

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

// This puzzle has a unique solution. Reordering its digits,
// bands, stacks and rows/columns within them preserves that.
const TEMPLATE = [
  "530070000",
  "600195000",
  "098000060",
  "800060003",
  "400803001",
  "700020006",
  "060000280",
  "000419005",
  "000080079",
].map((row) => row.split("").map(Number));

const createSudokuConfig = () => {
  const digits = shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9]);

  const order = () =>
    shuffle([0, 1, 2]).flatMap((group) =>
      shuffle([0, 1, 2]).map((offset) => group * 3 + offset)
    );

  const rows = order();
  const columns = order();

  let board = rows.map((row) =>
    columns.map((column) => {
      const value = TEMPLATE[row][column];
      return value ? digits[value - 1] : 0;
    })
  );

  if (crypto.randomInt(2)) {
    board = board[0].map((_, column) =>
      board.map((row) => row[column])
    );
  }

  return {
    board,
    difficulty: "Standard",
    rules:
      "Fill every empty cell. Each row, column and 3×3 box " +
      "must contain the numbers 1–9 once each.",
  };
};

const validateSudokuSubmission = (publicConfig, submittedAnswer) => {
  let board;

  try {
    board = JSON.parse(submittedAnswer);
  } catch {
    return false;
  }

  const original = publicConfig?.board;

  const validShape = (grid) =>
    Array.isArray(grid) &&
    grid.length === 9 &&
    grid.every(
      (row) => Array.isArray(row) && row.length === 9
    );

  if (!validShape(original) || !validShape(board)) {
    return false;
  }

  for (let row = 0; row < 9; row += 1) {
    for (let column = 0; column < 9; column += 1) {
      const value = board[row][column];
      const given = original[row][column];

      if (
        !Number.isInteger(value) ||
        value < 1 ||
        value > 9 ||
        !Number.isInteger(given) ||
        given < 0 ||
        given > 9 ||
        (given !== 0 && value !== given)
      ) {
        return false;
      }
    }
  }

  const completeSet = (values) => new Set(values).size === 9;

  for (let index = 0; index < 9; index += 1) {
    if (!completeSet(board[index])) return false;

    if (!completeSet(board.map((row) => row[index]))) {
      return false;
    }
  }

  for (let top = 0; top < 9; top += 3) {
    for (let left = 0; left < 9; left += 3) {
      const box = [];

      for (let row = top; row < top + 3; row += 1) {
        for (let column = left; column < left + 3; column += 1) {
          box.push(board[row][column]);
        }
      }

      if (!completeSet(box)) return false;
    }
  }

  return true;
};

module.exports = {
  createSudokuConfig,
  validateSudokuSubmission,
};