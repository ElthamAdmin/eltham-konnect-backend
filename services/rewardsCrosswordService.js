const crypto = require("crypto");

const TEMPLATES = [
  {
    across: {
      answer: "SHIPPING",
      clue: "Sending goods from one place to another.",
    },
    down: [
      {
        answer: "STORE",
        clue: "A place where goods are sold.",
      },
      {
        answer: "INVOICE",
        clue: "A document listing charges owed.",
      },
      {
        answer: "POINTS",
        clue: "Units earned through a loyalty programme.",
      },
      {
        answer: "NAME",
        clue: "What a person is called.",
      },
    ],
  },
  {
    across: {
      answer: "DELIVERY",
      clue: "Taking a parcel to its recipient.",
    },
    down: [
      {
        answer: "DATE",
        clue: "A calendar day, month and year.",
      },
      {
        answer: "LABEL",
        clue: "A tag showing information on a parcel.",
      },
      {
        answer: "VALUE",
        clue: "How much an item is worth.",
      },
      {
        answer: "REWARD",
        clue: "Something received for an achievement.",
      },
    ],
  },
  {
    across: {
      answer: "PACKAGE",
      clue: "An item wrapped or boxed for transport.",
    },
    down: [
      {
        answer: "POINTS",
        clue: "Units earned through a loyalty programme.",
      },
      {
        answer: "CUSTOMS",
        clue: "The authority that checks goods entering a country.",
      },
      {
        answer: "ADDRESS",
        clue: "Details showing where something should be delivered.",
      },
      {
        answer: "EMAIL",
        clue: "An electronic message sent over the internet.",
      },
    ],
  },
];

const createCrosswordConfig = () => {
  const template =
    TEMPLATES[crypto.randomInt(TEMPLATES.length)];

  const height = Math.max(
    ...template.down.map((entry) => entry.answer.length)
  );

  const width = template.across.answer.length;

  let solution = Array.from(
    { length: height },
    () => Array(width).fill("#")
  );

  [...template.across.answer].forEach((letter, column) => {
    solution[0][column] = letter;
  });

  let entries = [
    {
      row: 0,
      column: 0,
      direction: "across",
      length: template.across.answer.length,
      clue: template.across.clue,
    },
  ];

  template.down.forEach((entry, index) => {
    const column = index * 2;

    [...entry.answer].forEach((letter, row) => {
      if (
        solution[row][column] !== "#" &&
        solution[row][column] !== letter
      ) {
        throw new Error("Invalid Crossword crossing.");
      }

      solution[row][column] = letter;
    });

    entries.push({
      row: 0,
      column,
      direction: "down",
      length: entry.answer.length,
      clue: entry.clue,
    });
  });

  // Transpose some puzzles to vary their orientation.
  if (crypto.randomInt(2) === 1) {
    solution = solution[0].map((_, column) =>
      solution.map((row) => row[column])
    );

    entries = entries.map((entry) => ({
      ...entry,
      row: entry.column,
      column: entry.row,
      direction:
        entry.direction === "across" ? "down" : "across",
    }));
  }

  const starts = [
    ...new Set(
      entries.map((entry) => `${entry.row},${entry.column}`)
    ),
  ].sort((first, second) => {
    const [firstRow, firstColumn] = first.split(",").map(Number);
    const [secondRow, secondColumn] = second.split(",").map(Number);

    return firstRow - secondRow || firstColumn - secondColumn;
  });

  const numbers = new Map(
    starts.map((start, index) => [start, index + 1])
  );

  entries = entries.map((entry) => ({
    ...entry,
    number: numbers.get(`${entry.row},${entry.column}`),
  }));

  return {
    publicConfig: {
      puzzleVersion: 1,
      rows: solution.length,
      columns: solution[0].length,
      cells: solution.map((row) =>
        row.map((letter) => letter !== "#")
      ),
      entries,
      rules:
        "Use the numbered Across and Down clues to fill every " +
        "white square. Crossing words share the same letter.",
    },
    privateConfig: {
      solution: solution.map((row) => row.join("")),
    },
  };
};

const validateCrosswordSubmission = (
  publicConfig,
  privateConfig,
  submittedAnswer
) => {
  try {
    const solution = privateConfig?.solution;

    if (
      publicConfig?.puzzleVersion !== 1 ||
      !Number.isInteger(publicConfig.rows) ||
      !Number.isInteger(publicConfig.columns) ||
      publicConfig.rows < 1 ||
      publicConfig.rows > 15 ||
      publicConfig.columns < 1 ||
      publicConfig.columns > 15 ||
      !Array.isArray(solution) ||
      solution.length !== publicConfig.rows ||
      !Array.isArray(publicConfig.cells) ||
      publicConfig.cells.length !== publicConfig.rows ||
      typeof submittedAnswer !== "string" ||
      submittedAnswer.length > 2000
    ) {
      return false;
    }

    // The customer submits an array of row strings.
    // Blocked squares must be represented by "#".
    const board = JSON.parse(submittedAnswer);

    if (
      !Array.isArray(board) ||
      board.length !== publicConfig.rows
    ) {
      return false;
    }

    return board.every((row, index) => {
      const expected = solution[index];
      const cells = publicConfig.cells[index];

      if (
        typeof row !== "string" ||
        row.length !== publicConfig.columns ||
        typeof expected !== "string" ||
        expected.length !== publicConfig.columns ||
        !/^[A-Z#]+$/.test(expected) ||
        !Array.isArray(cells) ||
        cells.length !== publicConfig.columns
      ) {
        return false;
      }

      const maskMatches = cells.every(
        (open, column) =>
          typeof open === "boolean" &&
          open === (expected[column] !== "#")
      );

      return maskMatches && row.toUpperCase() === expected;
    });
  } catch {
    return false;
  }
};

module.exports = {
  createCrosswordConfig,
  validateCrosswordSubmission,
};