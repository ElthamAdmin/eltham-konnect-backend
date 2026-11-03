const crypto = require("crypto");

const SIZE = 12;
const TARGET = 5;
const MAX_MOVES = 1500;

const DIRECTIONS = {
  U: [-1, 0],
  D: [1, 0],
  L: [0, -1],
  R: [0, 1],
};

const OPPOSITE = {
  U: "D",
  D: "U",
  L: "R",
  R: "L",
};

const createSnakeConfig = () => ({
  size: SIZE,
  target: TARGET,
  maxMoves: MAX_MOVES,
  tickMs: 180,
  seed: crypto.randomInt(1, 2147483647),
  rules:
    "Collect 5 orange food squares without hitting a wall or " +
    "your snake. Use arrow keys or the direction buttons. " +
    "You cannot turn directly backwards.",
});

const createSnakeState = (config) => {
  if (
    config?.size !== SIZE ||
    config?.target !== TARGET ||
    !Number.isInteger(config.seed) ||
    config.seed < 1 ||
    config.seed >= 2147483647
  ) {
    throw new Error("Invalid Snake configuration.");
  }

  const state = {
    body: [[6, 4], [6, 3], [6, 2]],
    direction: "R",
    score: 0,
    moves: 0,
    randomState: config.seed,
    food: null,
    status: "Playing",
  };

  placeFood(state);
  return state;
};

const placeFood = (state) => {
  const occupied = new Set(
    state.body.map(([row, column]) => `${row},${column}`)
  );

  const free = [];

  for (let row = 0; row < SIZE; row += 1) {
    for (let column = 0; column < SIZE; column += 1) {
      if (!occupied.has(`${row},${column}`)) {
        free.push([row, column]);
      }
    }
  }

  if (!free.length) {
    state.food = null;
    return;
  }

  state.randomState =
    (state.randomState * 16807) % 2147483647;

  state.food = free[state.randomState % free.length];
};

const advanceSnake = (state, direction) => {
  if (
    state.status !== "Playing" ||
    !DIRECTIONS[direction] ||
    direction === OPPOSITE[state.direction] ||
    state.moves >= MAX_MOVES
  ) {
    return false;
  }

  const [dr, dc] = DIRECTIONS[direction];
  const head = [
    state.body[0][0] + dr,
    state.body[0][1] + dc,
  ];

  const eating =
    head[0] === state.food?.[0] &&
    head[1] === state.food?.[1];

  // The tail moves away on a non-eating step.
  const collisionBody = eating
    ? state.body
    : state.body.slice(0, -1);

  if (
    head[0] < 0 ||
    head[0] >= SIZE ||
    head[1] < 0 ||
    head[1] >= SIZE ||
    collisionBody.some(
      ([row, column]) =>
        row === head[0] && column === head[1]
    )
  ) {
    state.status = "Lost";
    return false;
  }

  state.direction = direction;
  state.moves += 1;
  state.body.unshift(head);

  if (eating) {
    state.score += 1;

    if (state.score >= TARGET) {
      state.status = "Won";
    } else {
      placeFood(state);
    }
  } else {
    state.body.pop();
  }

  if (state.moves >= MAX_MOVES && state.status !== "Won") {
    state.status = "Lost";
  }

  return true;
};

const validateSnakeSubmission = (config, submittedAnswer) => {
  if (
    typeof submittedAnswer !== "string" ||
    !/^[UDLR]+$/.test(submittedAnswer) ||
    submittedAnswer.length > MAX_MOVES
  ) {
    return false;
  }

  let state;

  try {
    state = createSnakeState(config);
  } catch {
    return false;
  }

  for (const direction of submittedAnswer) {
    if (!advanceSnake(state, direction)) return false;
  }

  return state.status === "Won" && state.score === TARGET;
};

module.exports = {
  createSnakeConfig,
  validateSnakeSubmission,
};