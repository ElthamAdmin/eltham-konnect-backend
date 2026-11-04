const express = require("express");
const router = express.Router();
const {
  protect,
  requirePermission,
} = require("../middleware/authMiddleware");

const {
  protectCustomer,
} = require("../middleware/customerAuthMiddleware");

const {
  getGames,
  createGame,
  playGame,
  getGamePlays,
  getCustomerGamePlays,
  deleteGame,
  getGameAnswerKey,
  updateGameSettings,
} = require("../controllers/rewardsHubGameController");

router.get(
  "/:gameId/answer-key",
  protect,
  requirePermission("marketing"),
  getGameAnswerKey
);

router.get("/", getGames);

router.post(
  "/",
  protect,
  requirePermission("marketing"),
  createGame
);

router.post("/play", protectCustomer, playGame);

router.get(
  "/:gameId/plays",
  protect,
  requirePermission("marketing"),
  getGamePlays
);

router.get(
  "/customer/:ekonId/plays",
  protectCustomer,
  getCustomerGamePlays
);

router.patch(
  "/:gameId/settings",
  protect,
  requirePermission("marketing"),
  updateGameSettings
);


router.delete(
  "/:id",
  protect,
  requirePermission("marketing"),
  deleteGame
);

module.exports = router;