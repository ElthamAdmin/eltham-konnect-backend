const RewardsHubGamePlay = require("../models/RewardsHubGamePlay");
const RewardsHubEntry = require("../models/RewardsHubEntry");

const getLeaderboard = async (req, res) => {
  try {
    // 🎮 GAME PLAY LEADERBOARD
    const gameStats = await RewardsHubGamePlay.aggregate([
      {
        $group: {
          _id: "$customerEkonId",
          customerName: { $first: "$customerName" },
          totalGames: { $sum: 1 },
          correctAnswers: {
            $sum: { $cond: ["$isCorrect", 1, 0] },
          },
          rewardsEarned: {
            $sum: { $cond: ["$rewardGiven", 1, 0] },
          },
        },
      },
      { $sort: { correctAnswers: -1, totalGames: -1 } },
      { $limit: 10 },
    ]);

    // 🎁 REWARDS HUB ENTRY LEADERBOARD
    const entryStats = await RewardsHubEntry.aggregate([
      {
        $group: {
          _id: "$customerEkonId",
          customerName: { $first: "$customerName" },
          totalEntries: { $sum: 1 },
          wins: {
            $sum: { $cond: ["$isWinner", 1, 0] },
          },
          rewardsGiven: {
            $sum: { $cond: ["$rewardGiven", 1, 0] },
          },
        },
      },
      { $sort: { wins: -1, totalEntries: -1 } },
      { $limit: 10 },
    ]);

    res.json({
      success: true,
      message: "Leaderboard retrieved successfully",
      data: {
        gameLeaderboard: gameStats,
        entryLeaderboard: entryStats,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to load leaderboard",
      error: error.message,
    });
  }
};

module.exports = {
  getLeaderboard,
};