const crypto = require("crypto");
const { Chess } = require("chess.js");

const MAX_PLIES = 300;

const PIECE_VALUES = {
  p: 100,
  n: 320,
  b: 330,
  r: 500,
  q: 900,
  k: 20000,
};

const moveCode = (move) =>
  move.from + move.to + (move.promotion || "");

const moveInput = (code) => ({
  from: code.slice(0, 2),
  to: code.slice(2, 4),
  ...(code.length === 5
    ? { promotion: code.slice(4, 5) }
    : {}),
});

const createChessConfig = () => ({
  opponentVersion: 1,
  playerColor: "w",
  maxPlies: MAX_PLIES,
  seed: crypto.randomInt(1, 2147483647),
  difficulty: "Beginner",
  rules:
    "You play White against the computer. " +
    "Checkmate Black to complete the game and qualify for its reward. " +
    "Draws and losses do not earn a reward. " +
    "Games are limited to 150 moves per side.",
});

const isValidChessConfig = (config) =>
  config?.opponentVersion === 1 &&
  config?.playerColor === "w" &&
  config?.maxPlies === MAX_PLIES &&
  Number.isSafeInteger(config?.seed) &&
  config.seed >= 1 &&
  config.seed < 2147483647;

// Stable tie-breaking gives each published game its own
// repeatable computer responses.
const tieBreak = (seed, fen, code) => {
  const text = `${seed}|${fen}|${code}`;
  let hash = 2166136261;

  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return (hash >>> 0) / 4294967296;
};

const chooseComputerMove = (chess, config) => {
  if (
    !isValidChessConfig(config) ||
    chess.turn() !== "b" ||
    chess.isGameOver()
  ) {
    return null;
  }

  const fen = chess.fen();

  const moves = chess
    .moves({ verbose: true })
    .sort((first, second) => {
      const firstCode = moveCode(first);
      const secondCode = moveCode(second);

      return firstCode < secondCode
        ? -1
        : firstCode > secondCode
          ? 1
          : 0;
    });

  let bestCode = null;
  let bestScore = -Infinity;

  for (const move of moves) {
    const code = moveCode(move);

    chess.move(moveInput(code));

    let score;

    try {
      if (chess.isCheckmate()) {
        score = 100000;
      } else if (chess.isDraw()) {
        score = 0;
      } else {
        const capturedValue =
          PIECE_VALUES[move.captured] || 0;

        const movingValue =
          PIECE_VALUES[move.promotion || move.piece] || 0;

        const promotionGain = move.promotion
          ? PIECE_VALUES[move.promotion] - PIECE_VALUES.p
          : 0;

        score = capturedValue + promotionGain;

        // A beginner opponent avoids placing valuable
        // pieces directly on squares attacked by White.
        if (chess.isAttacked(move.to, "w")) {
          score -= movingValue;
        }

        if (chess.isCheck()) {
          score += 20;
        }
      }

      score += tieBreak(config.seed, fen, code);
    } finally {
      chess.undo();
    }

    if (score > bestScore) {
      bestScore = score;
      bestCode = code;
    }
  }

  return bestCode;
};

const validateChessSubmission = (
  config,
  submittedAnswer
) => {
  try {
    if (
      !isValidChessConfig(config) ||
      typeof submittedAnswer !== "string"
    ) {
      return false;
    }

    const text = submittedAnswer.trim();

    if (!text || text.length > 2000) {
      return false;
    }

    // Coordinate notation, for example:
    // e2e4 e7e5 g1f3
    // Promotions include the final piece: a7a8q
    const codes = text.split(/\s+/);

    if (
      codes.length > MAX_PLIES ||
      !codes.every((code) =>
        /^[a-h][1-8][a-h][1-8][qrbn]?$/.test(code)
      )
    ) {
      return false;
    }

    const chess = new Chess();

    for (const code of codes) {
      if (chess.isGameOver()) {
        return false;
      }

      if (
        chess.turn() === "b" &&
        code !== chooseComputerMove(chess, config)
      ) {
        return false;
      }

      const move = chess.move(moveInput(code));

      if (!move) {
        return false;
      }
    }

    // After White delivers checkmate, Black is the side
    // whose turn it would otherwise be.
    return (
      chess.isCheckmate() &&
      chess.turn() === "b"
    );
  } catch {
    return false;
  }
};

module.exports = {
  createChessConfig,
  chooseComputerMove,
  validateChessSubmission,
};