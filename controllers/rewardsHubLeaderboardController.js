const RewardsHubGamePlay = require("../models/RewardsHubGamePlay");
const RewardsHubEntry = require("../models/RewardsHubEntry");

const getLeaderboard = async (req, res) => {
  try {
        // Rank game players by saved game score.
    // Practice plays count toward score, but not reward earnings.
    const gameStats = await RewardsHubGamePlay.aggregate([
      {
        $group: {
          _id: "$customerEkonId",
          totalScore: {
            $sum: { $ifNull: ["$scoreEarned", 0] },
          },
          totalGames: { $sum: 1 },
          correctAnswers: {
            $sum: {
              $cond: [
                { $eq: ["$isCorrect", true] },
                1,
                0,
              ],
            },
          },
          rewardsEarned: {
            $sum: {
              $cond: [
                { $eq: ["$rewardGiven", true] },
                1,
                0,
              ],
            },
          },
        },
      },
      {
        $sort: {
          totalScore: -1,
          _id: 1,
        },
      },
      { $limit: 10 },
    ]);


// 🎁 REWARDS HUB ENTRY LEADERBOARD
const entryStats = await RewardsHubEntry.aggregate([
  {
    $group: {
      _id: "$customerEkonId",
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