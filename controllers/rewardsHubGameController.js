const crypto = require("crypto");
const mongoose = require("mongoose");
const Customer = require("../models/Customer");
const PointsHistory = require("../models/PointsHistory");
const CustomerNotification = require("../models/CustomerNotification");
const RewardsHubGame = require("../models/RewardsHubGame");
const RewardsHubGamePlay = require("../models/RewardsHubGamePlay");
const {
  createSudokuConfig,
  validateSudokuSubmission,
} = require("../services/rewardsSudokuService");

const getGames = async (req, res) => {
  try {
        const games = await RewardsHubGame.find({ isActive: true })
      .select("-correctAnswer")
      .sort({ createdAt: -1 });

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

        if (
            ["Snake", "Find-a-Word", "Chess", "Crossword"]
        .includes(gameType)
    ) {
      return res.status(409).json({
        success: false,
        message:
          "The interactive game engine is being installed. " +
          "This game type cannot be published yet.",
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
      engineVersion: gameType === "Sudoku" ? 2 : 1,
      publicConfig:
        gameType === "Sudoku" ? createSudokuConfig() : {},
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
  const session = await mongoose.startSession();

  const fail = (message, status = 400) => {
    const error = new Error(message);
    error.status = status;
    throw error;
  };

  try {
    const customerEkonId = req.user?.ekonId;
    const customerId = req.user?.customerId;
    const { gameId } = req.body;

    if (!customerId || !customerEkonId) {
      fail("Customer authentication is required.", 401);
    }

    if (
      typeof gameId !== "string" ||
      !/^[a-f0-9]{24}$/i.test(gameId)
    ) {
      fail("A valid game ID is required.");
    }

    if (
      req.body.submittedAnswer != null &&
      typeof req.body.submittedAnswer !== "string"
    ) {
      fail("The submitted answer must be text.");
    }

    const submittedAnswer = String(
      req.body.submittedAnswer || ""
    ).trim();

    if (submittedAnswer.length > 2000) {
      fail("The submitted answer is too long.");
    }

    // A stable document ID uses MongoDB's existing unique _id
    // index. Old play records do not need to be deleted or migrated.
    const claimId = new mongoose.Types.ObjectId(
      crypto
        .createHash("sha256")
        .update(
          JSON.stringify([
            "rewards-game-play-v1",
            gameId.toLowerCase(),
            customerEkonId,
          ])
        )
        .digest("hex")
        .slice(0, 24)
    );

    let result;

    await session.withTransaction(async () => {
      const game = await RewardsHubGame.findById(gameId)
        .session(session);

      if (!game || !game.isActive) {
        fail("Game not found.", 404);
      }

      const now = new Date();

      if (game.startDate && now < game.startDate) {
        fail("This game has not started yet.");
      }

      if (game.endDate && now > game.endDate) {
        fail("This game has ended.");
      }

      const existingPlay = await RewardsHubGamePlay.findOne({
        gameId: game._id,
        customerEkonId,
      }).session(session);

      if (existingPlay) {
        fail("You already played this game.", 409);
      }

      const answerGames = [
        "Trivia",
        "Scavenger Hunt",
        "Match Image",
      ];

            const existingGameTypes = [
        ...answerGames,
        "Spin Wheel",
        "Scratch Card",
        "Sudoku",
      ];

      // Interactive games will use their own server validators.
      // Never automatically award an unknown game type.
      if (!existingGameTypes.includes(game.gameType)) {
        fail(
          "This game needs its interactive player before it can be submitted.",
          409
        );
      }

      const requiresAnswer = answerGames.includes(game.gameType);

      const normalize = (value) =>
        String(value || "").trim().toLowerCase();

      if (
        requiresAnswer &&
        (!submittedAnswer || !normalize(game.correctAnswer))
      ) {
        fail(
          submittedAnswer
            ? "This game has no configured answer. Please contact support."
            : "Please enter or select your answer."
        );
      }

            if (
        game.gameType === "Sudoku" &&
        !validateSudokuSubmission(
          game.publicConfig,
          submittedAnswer
        )
      ) {
        fail(
          "The Sudoku board is incomplete or incorrect. " +
          "Check the rows, columns and boxes, then try again."
        );
      }

      const isCorrect =
        game.gameType === "Sudoku"
          ? true
          : requiresAnswer
            ? normalize(submittedAnswer) ===
              normalize(game.correctAnswer)
            : true;

      const offered = Number(game.rewardPoints || 0);

      if (
        !Number.isSafeInteger(offered) ||
        offered < 0 ||
        offered > 1500
      ) {
        fail("This game's points reward needs staff review.", 409);
      }

      const customer = await Customer.findOne({
        _id: customerId,
        ekonId: customerEkonId,
        status: "Active",
      }).session(session);

      if (!customer) {
        fail("This customer session is no longer active.", 401);
      }

      const currentBalance = Number(customer.pointsBalance || 0);

      if (
        !Number.isFinite(currentBalance) ||
        currentBalance < 0 ||
        currentBalance > 1500
      ) {
        fail("Your points balance needs staff review.", 409);
      }

      const pointsAwarded = isCorrect
        ? Math.min(offered, Math.max(0, 1500 - currentBalance))
        : 0;

      const [play] = await RewardsHubGamePlay.create(
        [{
          _id: claimId,
          gameId: game._id,
          customerEkonId: customer.ekonId,
          customerName: customer.name,
          submittedAnswer,
          isCorrect,
          rewardPointsOffered: offered,
          pointsAwarded,
          rewardGiven: pointsAwarded > 0,
          rewardDate: pointsAwarded > 0 ? now : null,
        }],
        { session }
      );

      if (pointsAwarded > 0) {
        customer.pointsBalance = currentBalance + pointsAwarded;
        await customer.save({ session });

        await PointsHistory.create(
          [{
            customerId: customer._id,
            customerName: customer.name,
            customerEkonId: customer.ekonId,
            action: `Game Reward (${game.title})`,
            points: pointsAwarded,
          }],
          { session }
        );

        await CustomerNotification.create(
          [{
            notificationNumber: `EK-NOTIF-${crypto.randomUUID()}`,
            customerEkonId: customer.ekonId,
            customerName: customer.name,
            title: "You Earned EK Points!",
            message:
              `You earned ${pointsAwarded} EK Points from ` +
              `"${game.title}".`,
            type: "Rewards",
          }],
          { session }
        );
      }

      result = {
        play,
        isCorrect,
        rewardText: isCorrect ? game.rewardText : "",
        rewardPoints: pointsAwarded,
        rewardPointsOffered: offered,
        pointsBalance: currentBalance + pointsAwarded,
      };
    });

    const message = !result.isCorrect
      ? "Game submitted, but the answer was incorrect."
      : result.rewardPoints > 0
        ? `Game completed. ${result.rewardPoints} EK Points credited.`
        : result.rewardPointsOffered > 0
          ? "Game completed. No points were added because your balance is at the 1,500-point limit."
          : "Game completed successfully.";

    return res.json({
      success: true,
      message,
      data: result,
    });
  } catch (error) {
    console.error("Rewards game submission error:", error);

    const duplicate = error.code === 11000;

    return res.status(duplicate ? 409 : error.status || 500).json({
      success: false,
      message: duplicate
        ? "This game submission has already been recorded. Refresh your game history."
        : error.status
          ? error.message
          : "Could not confirm the game submission. Refresh your game history before retrying.",
    });
  } finally {
    await session.endSession();
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

const getCustomerGamePlays = async (req, res) => {
  try {
        const ekonId = req.user?.ekonId;

    if (!ekonId || req.params.ekonId !== ekonId) {
      return res.status(403).json({
        success: false,
        message: "You can only view your own game history.",
      });
    }

    const plays = await RewardsHubGamePlay.find({
      customerEkonId: ekonId,
    }).sort({ createdAt: -1 });

    res.json({
      success: true,
      message: "Customer game plays retrieved successfully",
      data: plays,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to retrieve customer game plays",
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
  getCustomerGamePlays,
  deleteGame,
};