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

const createDefaultCrosswordConfig = () => {
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

const shuffle = (items) => {
  const result = [...items];

  for (let index = result.length - 1; index > 0; index -= 1) {
    const other = crypto.randomInt(index + 1);
    [result[index], result[other]] = [
      result[other],
      result[index],
    ];
  }

  return result;
};

const normalizeCustomEntries = (input) => {
  if (
    !Array.isArray(input) ||
    input.length < 3 ||
    input.length > 8
  ) {
    throw new Error(
      "Enter between 3 and 8 Crossword answers and clues."
    );
  }

  const entries = input.map((entry) => {
    const answer =
      typeof entry?.answer === "string"
        ? entry.answer.trim().toUpperCase()
        : "";

    const clue =
      typeof entry?.clue === "string"
        ? entry.clue.trim()
        : "";

    if (!/^[A-Z]{3,12}$/.test(answer)) {
      throw new Error(
        "Each Crossword answer must contain 3–12 letters, " +
        "without spaces, numbers or punctuation."
      );
    }

    if (!clue || clue.length > 250) {
      throw new Error(
        "Every answer needs a clue of 1–250 characters."
      );
    }

    return { answer, clue };
  });

  if (
    new Set(entries.map((entry) => entry.answer)).size !==
    entries.length
  ) {
    throw new Error("Crossword answers must be distinct.");
  }

  return entries;
};

const createCustomCrosswordConfig = (input) => {
  const entries = normalizeCustomEntries(input);
  const SIZE = 15;

  let budget = 12000;

  const fitWord = (grid, entry, row, column, direction, first) => {
    const dr = direction === "down" ? 1 : 0;
    const dc = direction === "across" ? 1 : 0;

    const endRow = row + dr * (entry.answer.length - 1);
    const endColumn = column + dc * (entry.answer.length - 1);

    if (
      row < 0 ||
      column < 0 ||
      endRow >= SIZE ||
      endColumn >= SIZE
    ) {
      return null;
    }

    const occupied = (r, c) => Boolean(grid[r]?.[c]);

    // Words must have a clear square before and after them.
    if (
      occupied(row - dr, column - dc) ||
      occupied(endRow + dr, endColumn + dc)
    ) {
      return null;
    }

    let crossings = 0;

    for (let index = 0; index < entry.answer.length; index += 1) {
      const r = row + dr * index;
      const c = column + dc * index;
      const existing = grid[r][c];

      if (existing) {
        if (
          existing.letter !== entry.answer[index] ||
          existing[direction]
        ) {
          return null;
        }

        crossings += 1;
      } else {
        // Prevent side-by-side letters forming unclued words.
        const touchesSide =
          direction === "across"
            ? occupied(r - 1, c) || occupied(r + 1, c)
            : occupied(r, c - 1) || occupied(r, c + 1);

        if (touchesSide) return null;
      }
    }

    if (!first && crossings === 0) return null;

    const next = grid.map((line) =>
      line.map((cell) => (cell ? { ...cell } : null))
    );

    for (let index = 0; index < entry.answer.length; index += 1) {
      const r = row + dr * index;
      const c = column + dc * index;

      next[r][c] = {
        ...(next[r][c] || {
          letter: entry.answer[index],
        }),
        [direction]: true,
      };
    }

    return next;
  };

  const candidatesFor = (grid, entry) => {
    const candidates = [];
    const seen = new Set();

    for (let row = 0; row < SIZE; row += 1) {
      for (let column = 0; column < SIZE; column += 1) {
        const cell = grid[row][column];

        if (!cell) continue;

        for (let index = 0; index < entry.answer.length; index += 1) {
          if (entry.answer[index] !== cell.letter) continue;

          for (const direction of ["across", "down"]) {
            if (cell[direction]) continue;

            const startRow =
              row - (direction === "down" ? index : 0);

            const startColumn =
              column - (direction === "across" ? index : 0);

            const key =
              `${startRow},${startColumn},${direction}`;

            if (!seen.has(key)) {
              seen.add(key);
              candidates.push({
                row: startRow,
                column: startColumn,
                direction,
              });
            }
          }
        }
      }
    }

    return shuffle(candidates);
  };

  const search = (grid, remaining, placed) => {
    if (remaining.length === 0) {
      return { grid, placed };
    }

    if (budget <= 0) return null;

    // Try different next words: placement order affects fit.
    for (const entry of shuffle(remaining)) {
      const candidates = candidatesFor(grid, entry);

      for (const candidate of candidates) {
        budget -= 1;
        if (budget < 0) return null;

        const next = fitWord(
          grid,
          entry,
          candidate.row,
          candidate.column,
          candidate.direction,
          false
        );

        if (!next) continue;

        const result = search(
          next,
          remaining.filter((item) => item !== entry),
          [
            ...placed,
            {
              ...entry,
              ...candidate,
            },
          ]
        );

        if (result) return result;
      }
    }

    return null;
  };

  let result = null;

  const firstEntries = [...entries].sort(
    (first, second) =>
      second.answer.length - first.answer.length
  );

  for (const first of firstEntries) {
    if (budget <= 0 || result) break;

    for (const direction of shuffle(["across", "down"])) {
      const grid = Array.from(
        { length: SIZE },
        () => Array(SIZE).fill(null)
      );

      const row =
        direction === "across"
          ? 7
          : Math.floor((SIZE - first.answer.length) / 2);

      const column =
        direction === "down"
          ? 7
          : Math.floor((SIZE - first.answer.length) / 2);

      const next = fitWord(
        grid,
        first,
        row,
        column,
        direction,
        true
      );

      result = search(
        next,
        entries.filter((entry) => entry !== first),
        [{ ...first, row, column, direction }]
      );

      if (result) break;
    }
  }

  if (!result) {
    throw new Error(
      "These answers could not all fit into one connected " +
      "Crossword. Try words with more shared letters, " +
      "change an answer, or use fewer answers."
    );
  }

  const occupied = [];

  result.grid.forEach((line, row) => {
    line.forEach((cell, column) => {
      if (cell) occupied.push([row, column]);
    });
  });

  const minRow = Math.min(...occupied.map(([row]) => row));
  const maxRow = Math.max(...occupied.map(([row]) => row));
  const minColumn = Math.min(...occupied.map(([, column]) => column));
  const maxColumn = Math.max(...occupied.map(([, column]) => column));

  const solution = result.grid
    .slice(minRow, maxRow + 1)
    .map((line) =>
      line
        .slice(minColumn, maxColumn + 1)
        .map((cell) => cell?.letter || "#")
        .join("")
    );

  const placed = result.placed.map((entry) => ({
    ...entry,
    row: entry.row - minRow,
    column: entry.column - minColumn,
  }));

  const starts = [
    ...new Set(
      placed.map((entry) => `${entry.row},${entry.column}`)
    ),
  ].sort((first, second) => {
    const [r1, c1] = first.split(",").map(Number);
    const [r2, c2] = second.split(",").map(Number);
    return r1 - r2 || c1 - c2;
  });

  const numbers = new Map(
    starts.map((start, index) => [start, index + 1])
  );

  return {
    publicConfig: {
      puzzleVersion: 1,
      rows: solution.length,
      columns: solution[0].length,
      cells: solution.map((row) =>
        [...row].map((letter) => letter !== "#")
      ),
      entries: placed.map((entry) => ({
        row: entry.row,
        column: entry.column,
        direction: entry.direction,
        length: entry.answer.length,
        clue: entry.clue,
        number: numbers.get(`${entry.row},${entry.column}`),
      })),
      rules:
        "Use the numbered Across and Down clues to fill every " +
        "white square. Crossing words share the same letter.",
    },
    privateConfig: {
      solution,
    },
  };
};

const createCrosswordConfig = (customEntries) => {
  // Existing callers can continue creating preset puzzles.
  // A supplied custom list must validate; it never silently
  // falls back to a preset.
  if (customEntries == null) {
    return createDefaultCrosswordConfig();
  }

  return createCustomCrosswordConfig(customEntries);
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