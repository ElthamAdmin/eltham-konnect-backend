const path = require("path");
const TeamChannel = require("../models/TeamChannel");
const TeamMessage = require("../models/TeamMessage");
const DirectConversation = require("../models/DirectConversation");
const SystemUser = require("../models/SystemUser");
const TeamHubDocument = require("../models/TeamHubDocument");
const TeamHubNotification = require("../models/TeamHubNotification");

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
    owners: [req.user.userId],
    members: [req.user.userId],
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

  const extractMentions = async (text = "") => {
  const matches = String(text).match(/@([a-zA-Z0-9._ -]+)/g) || [];
  const names = matches.map((item) => item.replace("@", "").trim());

  if (!names.length) return [];

  const users = await SystemUser.find({
    fullName: { $in: names.map((name) => new RegExp(`^${name}$`, "i")) },
  }).select("userId fullName");

  return users.map((user) => user.userId);
};

const createMentionNotifications = async ({
  mentionedUserIds = [],
  channelId,
  messageId,
  senderId,
  body,
}) => {
  const targets = mentionedUserIds.filter((userId) => userId !== senderId);

  if (!targets.length) return;

  await TeamHubNotification.insertMany(
    targets.map((userId) => ({
      userId,
      channelId,
      messageId,
      type: "Mention",
      title: "You were mentioned in Team Hub",
      body,
    }))
  );
};

const attachSenderProfiles = async (messages = []) => {
  const senderIds = [
    ...new Set(messages.map((msg) => msg.senderId).filter(Boolean)),
  ];

  const users = await SystemUser.find({ userId: { $in: senderIds } }).select(
    "userId fullName role branch dutyStatus employeeSnapshot"
  );

  const userMap = {};
  users.forEach((user) => {
    userMap[user.userId] = {
      userId: user.userId,
      fullName: user.fullName,
      role: user.role,
      branch: user.branch,
      dutyStatus: user.dutyStatus,
      jobTitle: user.employeeSnapshot?.jobTitle || "",
      department: user.employeeSnapshot?.department || "",
    };
  });

  return messages.map((msg) => ({
    ...msg.toObject(),
    senderProfile: userMap[msg.senderId] || null,
  }));
};

exports.getMessages = async (req, res) => {
  const { channelId } = req.params;

  const allMessages = await TeamMessage.find({ channelId }).sort({
    createdAt: 1,
  });

  const enrichedMessages = await attachSenderProfiles(allMessages);

  const parentMessages = enrichedMessages.filter((msg) => !msg.parentMessageId);
  const replies = enrichedMessages.filter((msg) => msg.parentMessageId);

  const messagesWithReplies = parentMessages.map((msg) => ({
    ...msg,
    replies: replies.filter(
      (reply) => String(reply.parentMessageId) === String(msg._id)
    ),
    replyCount: replies.filter(
      (reply) => String(reply.parentMessageId) === String(msg._id)
    ).length,
  }));

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

  const mentionedUserIds = await extractMentions(message);

const newMessage = await TeamMessage.create({
  channelId,
  senderId: req.user.userId,
  message,
  attachments,
  parentMessageId: null,
  mentions: mentionedUserIds,
});

await createMentionNotifications({
  mentionedUserIds,
  channelId,
  messageId: newMessage._id,
  senderId: req.user.userId,
  body: message,
});

  const [enrichedMessage] = await attachSenderProfiles([newMessage]);

res.json({
  success: true,
  data: { ...enrichedMessage, replies: [], replyCount: 0 },
});
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

  const mentionedUserIds = await extractMentions(message);

const reply = await TeamMessage.create({
  channelId,
  parentMessageId,
  senderId: req.user.userId,
  message,
  attachments,
  mentions: mentionedUserIds,
});

await createMentionNotifications({
  mentionedUserIds,
  channelId,
  messageId: reply._id,
  senderId: req.user.userId,
  body: message,
});

  const [enrichedReply] = await attachSenderProfiles([reply]);

res.json({ success: true, data: enrichedReply });
};

// ================= CHANNEL FILES =================

exports.getChannelDocuments = async (req, res) => {
  const { channelId } = req.params;

  const documents = await TeamHubDocument.find({
    channelId,
    status: "Active",
  }).sort({ createdAt: -1 });

  res.json({ success: true, data: documents });
};

exports.uploadChannelDocument = async (req, res) => {
  const { channelId, title, folder } = req.body;
  const file = req.file;

  if (!channelId) {
    return res.status(400).json({
      success: false,
      message: "Channel is required.",
    });
  }

  if (!file) {
    return res.status(400).json({
      success: false,
      message: "File is required.",
    });
  }

  const document = await TeamHubDocument.create({
    channelId,
    title: title || file.originalname,
    folder: folder || "General",
    originalName: file.originalname,
    fileName: file.filename,
    fileUrl: `/uploads/team-hub/${file.filename}`,
    mimeType: file.mimetype,
    size: file.size,
    uploadedBy: req.user.userId,
  });

  res.status(201).json({ success: true, data: document });
};

// ================= CHANNEL MEMBERS =================

exports.getChannelMembers = async (req, res) => {
  const { channelId } = req.params;

  const channel = await TeamChannel.findById(channelId);

  if (!channel) {
    return res.status(404).json({
      success: false,
      message: "Channel not found.",
    });
  }

  const memberIds = [
    ...new Set([channel.createdBy, ...(channel.members || [])].filter(Boolean)),
  ];

  const members = await SystemUser.find({
    userId: { $in: memberIds },
  })
    .select("userId fullName email phone role branch dutyStatus employeeSnapshot status")
    .sort({ fullName: 1 });

  res.json({ success: true, data: members });
};

// ================= PHASE 4 TEAM HUB CONTROLS =================

exports.addChannelMember = async (req, res) => {
  const { channelId } = req.params;
  const { userId } = req.body;

  const channel = await TeamChannel.findById(channelId);

  if (!channel) {
    return res.status(404).json({ success: false, message: "Channel not found." });
  }

  if (!channel.members.includes(userId)) {
    channel.members.push(userId);
  }

  await channel.save();

  await TeamHubNotification.create({
    userId,
    channelId,
    type: "AddedToChannel",
    title: "You were added to a Team Hub channel",
    body: `You were added to #${channel.name}`,
  });

  res.json({ success: true, data: channel });
};

exports.removeChannelMember = async (req, res) => {
  const { channelId, userId } = req.params;

  const channel = await TeamChannel.findById(channelId);

  if (!channel) {
    return res.status(404).json({ success: false, message: "Channel not found." });
  }

  channel.members = channel.members.filter((memberId) => memberId !== userId);
  channel.owners = channel.owners.filter((ownerId) => ownerId !== userId);

  await channel.save();

  res.json({ success: true, data: channel });
};

exports.pinMessage = async (req, res) => {
  const { messageId } = req.params;

  const message = await TeamMessage.findByIdAndUpdate(
    messageId,
    { isPinned: true },
    { new: true }
  );

  res.json({ success: true, data: message });
};

exports.unpinMessage = async (req, res) => {
  const { messageId } = req.params;

  const message = await TeamMessage.findByIdAndUpdate(
    messageId,
    { isPinned: false },
    { new: true }
  );

  res.json({ success: true, data: message });
};

exports.sendAnnouncement = async (req, res) => {
  const { channelId, announcementTitle, message, priority } = req.body;

  if (!channelId || !announcementTitle || !message) {
    return res.status(400).json({
      success: false,
      message: "Channel, title, and message are required.",
    });
  }

  const attachments = buildAttachments(req.files || []);

  const announcement = await TeamMessage.create({
    channelId,
    senderId: req.user.userId,
    message,
    attachments,
    parentMessageId: null,
    isAnnouncement: true,
    announcementTitle,
    priority: priority || "Important",
  });

  const channel = await TeamChannel.findById(channelId);
  const notifyUserIds = [
    ...new Set([channel?.createdBy, ...(channel?.members || [])].filter(Boolean)),
  ].filter((userId) => userId !== req.user.userId);

  if (notifyUserIds.length) {
    await TeamHubNotification.insertMany(
      notifyUserIds.map((userId) => ({
        userId,
        channelId,
        messageId: announcement._id,
        type: "Announcement",
        title: announcementTitle,
        body: message,
      }))
    );
  }

  const [enrichedAnnouncement] = await attachSenderProfiles([announcement]);

  res.status(201).json({
    success: true,
    data: { ...enrichedAnnouncement, replies: [], replyCount: 0 },
  });
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