const RewardsHubGame = require("../models/RewardsHubGame");
const RewardsHubGamePlay = require("../models/RewardsHubGamePlay");

const getGames = async (req, res) => {
  try {
    const games = await RewardsHubGame.find({ isActive: true }).sort({ createdAt: -1 });

    res.json({
      success: true,
      message: "Games retrieved successfully",
      data: games,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to retrieve games",
      error: error.message,
    });
  }
};

const createGame = async (req, res) => {
  try {
    const {
      title,
      instructions,
      gameType,
      question,
      correctAnswer,
      options,
      rewardText,
      rewardPoints,
      startDate,
      endDate,
    } = req.body;

    if (!title || !instructions || !gameType) {
      return res.status(400).json({
        success: false,
        message: "Title, instructions, and game type are required",
      });
    }

    const parsedOptions =
      typeof options === "string"
        ? options.split(",").map((item) => item.trim()).filter(Boolean)
        : Array.isArray(options)
        ? options
        : [];

    const game = await RewardsHubGame.create({
      title,
      instructions,
      gameType,
      question,
      correctAnswer,
      options: parsedOptions,
      rewardText,
      rewardPoints: Number(rewardPoints || 0),
      startDate: startDate || null,
      endDate: endDate || null,
    });

    res.status(201).json({
      success: true,
      message: "Game created successfully",
      data: game,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to create game",
      error: error.message,
    });
  }
};

const playGame = async (req, res) => {
  try {
    const { gameId, customerEkonId, customerName, submittedAnswer } = req.body;

    if (!gameId || !customerEkonId || !customerName) {
      return res.status(400).json({
        success: false,
        message: "Game ID, customer EKON ID, and customer name are required",
      });
    }

    const game = await RewardsHubGame.findById(gameId);

    if (!game || !game.isActive) {
      return res.status(404).json({
        success: false,
        message: "Game not found",
      });
    }

    const existingPlay = await RewardsHubGamePlay.findOne({
      gameId,
      customerEkonId,
    });

    if (existingPlay) {
      return res.status(400).json({
        success: false,
        message: "You already played this game.",
      });
    }

    const normalizedSubmitted = String(submittedAnswer || "").trim().toLowerCase();
    const normalizedCorrect = String(game.correctAnswer || "").trim().toLowerCase();

    const isCorrect =
      game.gameType === "Trivia" || game.gameType === "Scavenger Hunt" || game.gameType === "Match Image"
        ? normalizedSubmitted === normalizedCorrect
        : true;

    const play = await RewardsHubGamePlay.create({
      gameId,
      customerEkonId,
      customerName,
      submittedAnswer,
      isCorrect,
    });

    res.json({
      success: true,
      message: isCorrect ? "Game submitted successfully." : "Game submitted, but answer was incorrect.",
      data: {
        play,
        isCorrect,
        rewardText: game.rewardText,
        rewardPoints: game.rewardPoints,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to submit game",
      error: error.message,
    });
  }
};

const getGamePlays = async (req, res) => {
  try {
    const { gameId } = req.params;

    const plays = await RewardsHubGamePlay.find({ gameId }).sort({ createdAt: -1 });

    res.json({
      success: true,
      message: "Game plays retrieved successfully",
      data: plays,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to retrieve game plays",
      error: error.message,
    });
  }
};

const deleteGame = async (req, res) => {
  try {
    const { id } = req.params;

    const game = await RewardsHubGame.findById(id);

    if (!game) {
      return res.status(404).json({
        success: false,
        message: "Game not found",
      });
    }

    game.isActive = false;
    await game.save();

    res.json({
      success: true,
      message: "Game removed successfully",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to remove game",
      error: error.message,
    });
  }
};

module.exports = {
  getGames,
  createGame,
  playGame,
  getGamePlays,
  deleteGame,
};