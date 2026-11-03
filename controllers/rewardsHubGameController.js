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
const {
  createWordSearchConfig,
  validateWordSearchSubmission,
} = require("../services/rewardsWordSearchService");
const {
  createSnakeConfig,
  validateSnakeSubmission,
} = require("../services/rewardsSnakeService");
const {
  createChessConfig,
  validateChessSubmission,
} = require("../services/rewardsChessService");
const {
  createCrosswordConfig,
  validateCrosswordSubmission,
} = require("../services/rewardsCrosswordService");
const {
  createWheelConfig,
  selectWheelOutcome,
} = require("../services/rewardsWheelService");
const {
  createScratchConfig,
  selectScratchOutcome,
} = require("../services/rewardsScratchService");

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

    const parsedOptions =
      typeof options === "string"
        ? options.split(",").map((item) => item.trim()).filter(Boolean)
        : Array.isArray(options)
        ? options
        : [];

            if (gameType === "Trivia") {
      const normalizedAnswer = String(correctAnswer || "")
        .trim()
        .toLowerCase();

      const validOptions =
        parsedOptions.length >= 2 &&
        parsedOptions.length <= 6 &&
        parsedOptions.every(
          (option) =>
            typeof option === "string" &&
            option.trim().length > 0 &&
            option.trim().length <= 120
        );

      if (
        typeof question !== "string" ||
        !question.trim() ||
        question.trim().length > 500
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Trivia needs a question of 1–500 characters.",
        });
      }

      if (!validOptions) {
        return res.status(400).json({
          success: false,
          message:
            "Trivia needs 2–6 answer choices. " +
            "Each choice must contain 1–120 characters.",
        });
      }

      const normalizedOptions = parsedOptions.map(
        (option) => option.trim().toLowerCase()
      );

      if (
        new Set(normalizedOptions).size !==
        normalizedOptions.length
      ) {
        return res.status(400).json({
          success: false,
          message: "Trivia answer choices must be distinct.",
        });
      }

      if (!normalizedOptions.includes(normalizedAnswer)) {
        return res.status(400).json({
          success: false,
          message:
            "The correct answer must match one of " +
            "the Trivia answer choices.",
        });
      }
    }

                let interactiveConfig = {};
    let privateConfig = {};
        if (
      gameType === "Scratch Card" &&
      req.body.scratchPrizes !== undefined
    ) {
      try {
        interactiveConfig = createScratchConfig(
          req.body.scratchPrizes
        );
      } catch (error) {
        return res.status(400).json({
          success: false,
          message: error.message,
        });
      }
    }
        if (
      gameType === "Spin Wheel" &&
      req.body.wheelSegments !== undefined
    ) {
      try {
        interactiveConfig = createWheelConfig(
          req.body.wheelSegments
        );
      } catch (error) {
        return res.status(400).json({
          success: false,
          message: error.message,
        });
      }
    }
        if (gameType === "Trivia") {
      interactiveConfig = {
        presentation: "answer-cards",
        palette: [
          "#2563eb",
          "#ea580c",
          "#7c3aed",
          "#0f766e",
          "#be185d",
          "#4338ca",
        ],
        rules:
          "Choose one answer, then submit. " +
          "You have one recorded attempt for this game. " +
          "Only a correct answer qualifies for its reward.",
      };
    }

        if (gameType === "Crossword") {
      try {
        const crossword = createCrosswordConfig(
          req.body.crosswordEntries
        );

        interactiveConfig = crossword.publicConfig;
        privateConfig = crossword.privateConfig;
      } catch (error) {
        return res.status(400).json({
          success: false,
          message: error.message,
        });
      }
    }
                if (gameType === "Chess") {
      interactiveConfig = createChessConfig();
    }
                if (gameType === "Snake") {
      interactiveConfig = createSnakeConfig();
    }

    if (gameType === "Sudoku") {
      interactiveConfig = createSudokuConfig();
    }

    if (gameType === "Find-a-Word") {
      try {
        interactiveConfig = createWordSearchConfig(options);
      } catch (error) {
        return res.status(400).json({
          success: false,
          message: error.message,
        });
      }
    }

        const game = await RewardsHubGame.create({
      title,
      instructions,
      gameType,
                    engineVersion:
        (
          [
            "Trivia",
            "Sudoku",
            "Find-a-Word",
            "Snake",
            "Chess",
            "Crossword",
          ].includes(gameType) ||
          (
            gameType === "Spin Wheel" &&
            interactiveConfig.wheelVersion === 1
          ) ||
          (
            gameType === "Scratch Card" &&
            interactiveConfig.scratchVersion === 1
          )
        )
          ? 2
          : 1,
      publicConfig: interactiveConfig,
      privateConfig,
      question: gameType === "Crossword" ? "" : question,
      correctAnswer: gameType === "Crossword" ? "" : correctAnswer,
      options: gameType === "Crossword" ? [] : parsedOptions,
      rewardText,
                  rewardPoints:
        gameType === "Spin Wheel" &&
        interactiveConfig.wheelVersion === 1
          ? Math.max(
              ...interactiveConfig.segments.map(
                (segment) => segment.points
              )
            )
          : gameType === "Scratch Card" &&
              interactiveConfig.scratchVersion === 1
            ? Math.max(
                ...interactiveConfig.prizes.map(
                  (prize) => prize.points
                )
              )
            : Number(rewardPoints || 0),
      startDate: startDate || null,
      endDate: endDate || null,
    });

        const publicGame = game.toObject();
    delete publicGame.privateConfig;
    delete publicGame.correctAnswer;

    res.status(201).json({
      success: true,
      message: "Game created successfully",
      data: publicGame,
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
        .select("+privateConfig")
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
        "Find-a-Word",
        "Snake",
        "Chess",
        "Crossword",
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
        game.gameType === "Trivia" &&
        game.engineVersion === 2
      ) {
        const choices = Array.isArray(game.options)
          ? game.options
          : [];

        if (
          choices.length < 2 ||
          choices.length > 6 ||
          !choices.every(
            (choice) => typeof choice === "string"
          ) ||
          !choices.some(
            (choice) =>
              normalize(choice) === normalize(game.correctAnswer)
          )
        ) {
          fail(
            "This Trivia game's answer choices need staff review.",
            409
          );
        }

        if (
          !choices.some(
            (choice) =>
              normalize(choice) === normalize(submittedAnswer)
          )
        ) {
          fail(
            "Select one of the displayed Trivia answers. " +
            "Your attempt has not been recorded."
          );
        }
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

            if (
        game.gameType === "Find-a-Word" &&
        !validateWordSearchSubmission(
          game.publicConfig,
          submittedAnswer
        )
      ) {
        fail(
          "Find every listed word before submitting. " +
          "Your play has not been recorded."
        );
      }

            if (
        game.gameType === "Snake" &&
        !validateSnakeSubmission(
          game.publicConfig,
          submittedAnswer
        )
      ) {
        fail(
          "This Snake run did not meet the completion rules. " +
          "Your play has not been recorded."
        );
      }

            if (
        game.gameType === "Chess" &&
        !validateChessSubmission(
          game.publicConfig,
          submittedAnswer
        )
      ) {
        fail(
          "This Chess game is not a verified win against " +
          "the computer. Your play has not been recorded."
        );
      }

            if (
        game.gameType === "Crossword" &&
        !validateCrosswordSubmission(
          game.publicConfig,
          game.privateConfig,
          submittedAnswer
        )
      ) {
        fail(
          "The Crossword is incomplete or incorrect. " +
          "Check the clues and crossing letters, then try again. " +
          "Your play has not been recorded."
        );
      }

                        let wheelOutcome;

      if (
        game.gameType === "Spin Wheel" &&
        game.engineVersion === 2
      ) {
        try {
          wheelOutcome = selectWheelOutcome(
            game.publicConfig
          );
        } catch {
          fail(
            "This wheel's prize configuration needs staff review.",
            409
          );
        }
      }

            if (
        game.gameType === "Scratch Card" &&
        game.engineVersion === 2
      ) {
        try {
          wheelOutcome = selectScratchOutcome(
            game.publicConfig
          );
        } catch {
          fail(
            "This Scratch Card's prize configuration needs staff review.",
            409
          );
        }
      }

            const isCorrect = wheelOutcome
        ? wheelOutcome.prizeType !== "No Prize"
        : ["Sudoku", "Find-a-Word", "Snake", "Chess", "Crossword"]
            .includes(game.gameType)
          ? true
          : requiresAnswer
            ? normalize(submittedAnswer) ===
              normalize(game.correctAnswer)
            : true;

      const offered = wheelOutcome
        ? wheelOutcome.points
        : Number(game.rewardPoints || 0);

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
                    submittedAnswer: wheelOutcome
            ? wheelOutcome.label
            : submittedAnswer,
          ...(wheelOutcome
            ? { outcome: wheelOutcome }
            : {}),
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

            if (
        wheelOutcome?.fulfilmentStatus === "Pending"
      ) {
        await CustomerNotification.create(
          [{
            notificationNumber:
              `EK-NOTIF-${crypto.randomUUID()}`,
            customerEkonId: customer.ekonId,
            customerName: customer.name,
                        title:
              game.gameType === "Scratch Card"
                ? "You Won a Scratch Card Prize!"
                : "You Won a Wheel Prize!",
            message:
              `You won "${wheelOutcome.label}" from ` +
              `"${game.title}". Your prize is recorded ` +
              "and awaiting fulfilment by Eltham Konnect.",
            type: "Rewards",
          }],
          { session }
        );
      }

            result = {
                play,
        gameType: game.gameType,
        isCorrect,
        rewardText: wheelOutcome
          ? wheelOutcome.label
          : isCorrect
            ? game.rewardText
            : "",
        rewardPoints: pointsAwarded,
        rewardPointsOffered: offered,
        pointsBalance: currentBalance + pointsAwarded,
        ...(wheelOutcome
          ? { outcome: wheelOutcome }
          : {}),
      };
    });

            let message;

    if (result.outcome) {
      const activity =
        result.gameType === "Scratch Card"
          ? "Scratch Card"
          : "Spin";

      if (result.outcome.fulfilmentStatus === "Pending") {
        message =
          `You won: ${result.outcome.label}! ` +
          "Your prize has been recorded and is awaiting " +
          "fulfilment by Eltham Konnect.";
      } else if (result.rewardPointsOffered === 0) {
        message =
          `${activity} recorded: ${result.outcome.label}. ` +
          "No EK Points were awarded for this result.";
      } else if (result.rewardPoints === 0) {
        message =
          `${activity} recorded: ${result.outcome.label}. ` +
          "No points were added because your balance " +
          "is at the 1,500-point limit.";
      } else {
        message =
          `${activity} recorded: ${result.outcome.label}. ` +
          `${result.rewardPoints} EK Points credited.`;

        if (
          result.rewardPoints <
          result.rewardPointsOffered
        ) {
          message +=
            " The credited amount was reduced to keep " +
            "your balance within the 1,500-point limit.";
        }
      }
    } else {
      message = !result.isCorrect
        ? "Game submitted, but the answer was incorrect."
        : result.rewardPoints > 0
          ? `Game completed. ${result.rewardPoints} EK Points credited.`
          : result.rewardPointsOffered > 0
            ? "Game completed. No points were added because your balance is at the 1,500-point limit."
            : "Game completed successfully.";
    }

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

const getGameAnswerKey = async (req, res) => {
  res.set("Cache-Control", "no-store");

  try {
    const { gameId } = req.params;

    if (
      typeof gameId !== "string" ||
      !/^[a-f0-9]{24}$/i.test(gameId)
    ) {
      return res.status(400).json({
        success: false,
        message: "A valid game ID is required.",
      });
    }

    const game = await RewardsHubGame.findById(gameId)
      .select("gameType publicConfig +privateConfig")
      .lean();

    if (!game) {
      return res.status(404).json({
        success: false,
        message: "Game not found.",
      });
    }

    if (game.gameType !== "Crossword") {
      return res.status(400).json({
        success: false,
        message: "This answer key is for Crossword games.",
      });
    }

    const config = game.publicConfig;
    const solution = game.privateConfig?.solution;

    if (
      !Array.isArray(solution) ||
      !Array.isArray(config?.entries)
    ) {
      return res.status(409).json({
        success: false,
        message: "This game has no available answer key.",
      });
    }

    const entries = config.entries.map((entry) => {
      if (
        !Number.isInteger(entry.row) ||
        !Number.isInteger(entry.column) ||
        !Number.isInteger(entry.length) ||
        entry.length < 1 ||
        entry.length > 15 ||
        !["across", "down"].includes(entry.direction)
      ) {
        throw new Error("Invalid stored Crossword entry.");
      }

      let answer = "";

      for (let index = 0; index < entry.length; index += 1) {
        const row =
          entry.row + (entry.direction === "down" ? index : 0);

        const column =
          entry.column + (entry.direction === "across" ? index : 0);

        const letter = solution[row]?.[column];

        if (
          typeof letter !== "string" ||
          !/^[A-Z]$/.test(letter)
        ) {
          throw new Error("Invalid stored Crossword solution.");
        }

        answer += letter;
      }

      return {
        number: entry.number,
        direction: entry.direction,
        clue: entry.clue,
        answer,
      };
    });

    return res.json({
      success: true,
      message: "Answer key retrieved successfully.",
      data: { entries },
    });
  } catch (error) {
    console.error("Crossword answer key error:", error.message);

    return res.status(500).json({
      success: false,
      message: "Could not retrieve this answer key.",
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
  getGameAnswerKey,
};