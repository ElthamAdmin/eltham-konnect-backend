const path = require("path");
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

const buildAttachments = (files = []) =>
  files.map((file) => ({
    originalName: file.originalname,
    fileName: file.filename,
    fileUrl: `/uploads/team-hub/${file.filename}`,
    mimeType: file.mimetype,
    size: file.size,
  }));

exports.getMessages = async (req, res) => {
  const { channelId } = req.params;

  const allMessages = await TeamMessage.find({ channelId }).sort({
    createdAt: 1,
  });

  const parentMessages = allMessages.filter((msg) => !msg.parentMessageId);
  const replies = allMessages.filter((msg) => msg.parentMessageId);

  const messagesWithReplies = parentMessages.map((msg) => {
    const obj = msg.toObject();

    obj.replies = replies
      .filter(
        (reply) =>
          String(reply.parentMessageId) === String(msg._id)
      )
      .map((reply) => reply.toObject());

    return obj;
  });

  res.json({ success: true, data: messagesWithReplies });
};

exports.sendMessage = async (req, res) => {
  const { channelId, message } = req.body;

  const attachments = buildAttachments(req.files || []);

  if (!channelId) {
    return res.status(400).json({
      success: false,
      message: "Channel is required.",
    });
  }

  if (!message && attachments.length === 0) {
    return res.status(400).json({
      success: false,
      message: "Message or attachment is required.",
    });
  }

  const newMessage = await TeamMessage.create({
    channelId,
    senderId: req.user.userId,
    message,
    attachments,
    parentMessageId: null,
  });

  res.json({ success: true, data: { ...newMessage.toObject(), replies: [] } });
};

exports.sendReply = async (req, res) => {
  const { channelId, parentMessageId, message } = req.body;

  const attachments = buildAttachments(req.files || []);

  if (!channelId || !parentMessageId) {
    return res.status(400).json({
      success: false,
      message: "Channel and parent message are required.",
    });
  }

  if (!message && attachments.length === 0) {
    return res.status(400).json({
      success: false,
      message: "Reply or attachment is required.",
    });
  }

  const parentMessage = await TeamMessage.findOne({
    _id: parentMessageId,
    channelId,
    parentMessageId: null,
  });

  if (!parentMessage) {
    return res.status(404).json({
      success: false,
      message: "Original message not found.",
    });
  }

  const reply = await TeamMessage.create({
    channelId,
    parentMessageId,
    senderId: req.user.userId,
    message,
    attachments,
  });

  res.json({ success: true, data: reply });
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