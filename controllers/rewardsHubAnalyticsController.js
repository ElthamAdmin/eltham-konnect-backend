const RewardsHubGamePlay = require("../models/RewardsHubGamePlay");
const RewardsHubEntry = require("../models/RewardsHubEntry");

const getAnalytics = async (req, res) => {
  try {
    // 🎮 GAME STATS
    const totalGamesPlayed = await RewardsHubGamePlay.countDocuments();

    const totalCorrectAnswers = await RewardsHubGamePlay.countDocuments({
      isCorrect: true,
    });

    const totalGameRewards = await RewardsHubGamePlay.countDocuments({
      rewardGiven: true,
    });

    // 🎁 ENTRY STATS
    const totalEntries = await RewardsHubEntry.countDocuments();

    const totalWinners = await RewardsHubEntry.countDocuments({
      isWinner: true,
    });

    const totalEntryRewards = await RewardsHubEntry.countDocuments({
      rewardGiven: true,
    });

    // 📊 DAILY GAME ACTIVITY
    const dailyGameActivity = await RewardsHubGamePlay.aggregate([
      {
        $group: {
          _id: {
            $dateToString: { format: "%Y-%m-%d", date: "$createdAt" },
          },
          plays: { $sum: 1 },
          correct: {
            $sum: { $cond: ["$isCorrect", 1, 0] },
          },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    // 📊 TOP ENGAGED USERS (EKON ONLY)
    const topPlayers = await RewardsHubGamePlay.aggregate([
      {
        $group: {
          _id: "$customerEkonId",
          totalGames: { $sum: 1 },
          correctAnswers: {
            $sum: { $cond: ["$isCorrect", 1, 0] },
          },
        },
      },
      { $sort: { totalGames: -1 } },
      { $limit: 10 },
    ]);

    // 🎯 CONVERSION RATE
    const conversionRate =
      totalGamesPlayed > 0
        ? ((totalGameRewards / totalGamesPlayed) * 100).toFixed(2)
        : 0;

    res.json({
      success: true,
      data: {
        totals: {
          totalGamesPlayed,
          totalCorrectAnswers,
          totalGameRewards,
          totalEntries,
          totalWinners,
          totalEntryRewards,
          conversionRate,
        },
        dailyGameActivity,
        topPlayers,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to load analytics",
      error: error.message,
    });
  }
};

module.exports = { getAnalytics };