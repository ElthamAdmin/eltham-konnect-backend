const TeamChannel = require("../models/TeamChannel");
const TeamMessage = require("../models/TeamMessage");
const DirectConversation = require("../models/DirectConversation");

// ================= CHANNELS =================

exports.getChannels = async (req, res) => {
  const channels = await TeamChannel.find().sort({ createdAt: 1 });

  res.json({ success: true, data: channels });
};

exports.createChannel = async (req, res) => {
  const { name, description } = req.body;

  const channel = await TeamChannel.create({
    name,
    description,
    createdBy: req.user.userId,
  });

  res.json({ success: true, data: channel });
};

// ================= MESSAGES =================

exports.getMessages = async (req, res) => {
  const { channelId } = req.params;

  const messages = await TeamMessage.find({ channelId }).sort({
    createdAt: 1,
  });

  res.json({ success: true, data: messages });
};

exports.sendMessage = async (req, res) => {
  const { channelId, message } = req.body;

  const newMessage = await TeamMessage.create({
    channelId,
    senderId: req.user.userId,
    message,
  });

  res.json({ success: true, data: newMessage });
};

// ================= DIRECT CHAT =================

exports.getOrCreateConversation = async (req, res) => {
  const { targetUserId } = req.body;
  const myId = req.user.userId;

  let convo = await DirectConversation.findOne({
    participants: { $all: [myId, targetUserId] },
  });

  if (!convo) {
    convo = await DirectConversation.create({
      participants: [myId, targetUserId],
    });
  }

  res.json({ success: true, data: convo });
};