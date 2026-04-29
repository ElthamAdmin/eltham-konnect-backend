const express = require("express");
const router = express.Router();

const {
  getGames,
  createGame,
  playGame,
  getGamePlays,
  getCustomerGamePlays,
  deleteGame,
} = require("../controllers/rewardsHubGameController");

router.get("/", getGames);
router.post("/", createGame);
router.post("/play", playGame);
router.get("/:gameId/plays", getGamePlays);
router.get("/customer/:ekonId/plays", getCustomerGamePlays);
router.delete("/:id", deleteGame);

module.exports = router;