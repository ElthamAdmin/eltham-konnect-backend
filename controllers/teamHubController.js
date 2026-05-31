const path = require("path");
const TeamChannel = require("../models/TeamChannel");
const TeamMessage = require("../models/TeamMessage");
const DirectConversation = require("../models/DirectConversation");
const DirectMessage = require("../models/DirectMessage");
const SystemUser = require("../models/SystemUser");
const TeamHubDocument = require("../models/TeamHubDocument");
const TeamHubNotification = require("../models/TeamHubNotification");
const TeamHubFolder = require("../models/TeamHubFolder");
const TeamHubCalendarEvent = require("../models/TeamHubCalendarEvent");
const TeamHubTask = require("../models/TeamHubTask");

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

  const escapeRegex = (value = "") =>
  String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const extractMentions = async (text = "") => {
  const content = String(text || "");

  const users = await SystemUser.find({ status: "Active" }).select(
    "userId fullName"
  );

  const mentionedUserIds = [];

  users.forEach((user) => {
    const fullName = String(user.fullName || "").trim();
    if (!fullName) return;

    const firstName = fullName.split(" ")[0];

    const fullNameRegex = new RegExp(
      `@${escapeRegex(fullName)}(?=\\s|\\.|,|!|\\?|$)`,
      "i"
    );

    const firstNameRegex = new RegExp(
      `@${escapeRegex(firstName)}(?=\\s|\\.|,|!|\\?|$)`,
      "i"
    );

    if (fullNameRegex.test(content) || firstNameRegex.test(content)) {
      mentionedUserIds.push(user.userId);
    }
  });

  return [...new Set(mentionedUserIds)];
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
  isPinned: -1,
  isAnnouncement: -1,
  createdAt: -1,
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

// ================= CHANNEL CALENDAR =================

exports.getChannelCalendarEvents = async (req, res) => {
  const { channelId } = req.params;

  const events = await TeamHubCalendarEvent.find({ channelId }).sort({
    startDate: 1,
    startTime: 1,
    createdAt: -1,
  });

  res.json({ success: true, data: events });
};

exports.createChannelCalendarEvent = async (req, res) => {
  const {
    channelId,
    title,
    description,
    eventType,
    startDate,
    startTime,
    endDate,
    endTime,
    location,
    attendees,
  } = req.body;

  if (!channelId || !title || !startDate) {
    return res.status(400).json({
      success: false,
      message: "Channel, title, and start date are required.",
    });
  }

  const selectedAttendees = Array.isArray(attendees) ? attendees : [];

  const users = await SystemUser.find({
    userId: { $in: selectedAttendees },
  }).select("userId fullName");

  const event = await TeamHubCalendarEvent.create({
    eventNumber: `CAL-${Date.now()}`,
    channelId,
    title,
    description: description || "",
    eventType: eventType || "Event",
    startDate,
    startTime: startTime || "",
    endDate: endDate || startDate,
    endTime: endTime || "",
    location: location || "",
    attendees: users.map((staff) => ({
      userId: staff.userId,
      fullName: staff.fullName,
    })),
    createdByUserId: req.user.userId,
    createdByName: req.user.fullName || req.user.email || "System User",
  });

  if (users.length > 0) {
    await TeamHubNotification.insertMany(
      users
        .filter((staff) => staff.userId !== req.user.userId)
        .map((staff) => ({
          userId: staff.userId,
          channelId,
          type: "AddedToChannel",
          title: "New Team Hub calendar event",
          body: `${event.title} was added to your channel calendar.`,
        }))
    );
  }

  res.status(201).json({ success: true, data: event });
};

exports.updateChannelCalendarEvent = async (req, res) => {
  const { eventId } = req.params;
  const {
    title,
    description,
    eventType,
    startDate,
    startTime,
    endDate,
    endTime,
    location,
    attendees,
    status,
  } = req.body;

  const event = await TeamHubCalendarEvent.findById(eventId);

  if (!event) {
    return res.status(404).json({
      success: false,
      message: "Calendar event not found.",
    });
  }

  if (title !== undefined) event.title = title;
  if (description !== undefined) event.description = description;
  if (eventType !== undefined) event.eventType = eventType;
  if (startDate !== undefined) event.startDate = startDate;
  if (startTime !== undefined) event.startTime = startTime;
  if (endDate !== undefined) event.endDate = endDate;
  if (endTime !== undefined) event.endTime = endTime;
  if (location !== undefined) event.location = location;
  if (status !== undefined) event.status = status;

  if (Array.isArray(attendees)) {
    const users = await SystemUser.find({
      userId: { $in: attendees },
    }).select("userId fullName");

    event.attendees = users.map((staff) => ({
      userId: staff.userId,
      fullName: staff.fullName,
    }));
  }

  await event.save();

  res.json({ success: true, data: event });
};

exports.deleteChannelCalendarEvent = async (req, res) => {
  const { eventId } = req.params;

  const event = await TeamHubCalendarEvent.findById(eventId);

  if (!event) {
    return res.status(404).json({
      success: false,
      message: "Calendar event not found.",
    });
  }

  await TeamHubCalendarEvent.findByIdAndDelete(eventId);

  res.json({
    success: true,
    message: "Calendar event deleted successfully.",
  });
};

// ================= CHANNEL TASKS =================

exports.getChannelTasks = async (req, res) => {
  const { channelId } = req.params;

  const tasks = await TeamHubTask.find({ channelId }).sort({
    status: 1,
    dueDate: 1,
    createdAt: -1,
  });

  res.json({ success: true, data: tasks });
};

exports.createChannelTask = async (req, res) => {
  const {
    channelId,
    title,
    description,
    assignedToUserId,
    priority,
    dueDate,
  } = req.body;

  if (!channelId || !title) {
    return res.status(400).json({
      success: false,
      message: "Channel and task title are required.",
    });
  }

  let assignedToName = "";

  if (assignedToUserId) {
    const assignedUser = await SystemUser.findOne({ userId: assignedToUserId });
    assignedToName = assignedUser?.fullName || "";
  }

  const task = await TeamHubTask.create({
    taskNumber: `TASK-${Date.now()}`,
    channelId,
    title,
    description: description || "",
    assignedToUserId: assignedToUserId || "",
    assignedToName,
    priority: priority || "Medium",
    dueDate: dueDate || "",
    createdByUserId: req.user.userId,
    createdByName: req.user.fullName || req.user.email || "System User",
  });

  if (assignedToUserId) {
    await TeamHubNotification.create({
      userId: assignedToUserId,
      channelId,
      type: "AddedToChannel",
      title: "New Team Hub task assigned",
      body: `${task.title} was assigned to you.`,
    });
  }

  res.status(201).json({ success: true, data: task });
};

exports.updateChannelTask = async (req, res) => {
  const { taskId } = req.params;
  const { status, progress, priority, dueDate, assignedToUserId } = req.body;

  const task = await TeamHubTask.findById(taskId);

  if (!task) {
    return res.status(404).json({
      success: false,
      message: "Task not found.",
    });
  }

  if (priority) task.priority = priority;
  if (dueDate !== undefined) task.dueDate = dueDate;

  if (progress !== undefined) {
    task.progress = Math.max(0, Math.min(100, Number(progress || 0)));
  }

  if (assignedToUserId !== undefined) {
    task.assignedToUserId = assignedToUserId || "";
    task.assignedToName = "";

    if (assignedToUserId) {
      const assignedUser = await SystemUser.findOne({ userId: assignedToUserId });
      task.assignedToName = assignedUser?.fullName || "";
    }
  }

  if (status) {
    task.status = status;

    if (status === "Completed") {
      task.progress = 100;
      task.completedAt = new Date();
      task.completedByUserId = req.user.userId;
      task.completedByName = req.user.fullName || req.user.email || "System User";
    }

    if (status !== "Completed") {
      task.completedAt = null;
      task.completedByUserId = "";
      task.completedByName = "";
    }
  }

  await task.save();

  res.json({ success: true, data: task });
};

exports.deleteChannelTask = async (req, res) => {
  const { taskId } = req.params;

  const task = await TeamHubTask.findById(taskId);

  if (!task) {
    return res.status(404).json({
      success: false,
      message: "Task not found.",
    });
  }

  await TeamHubTask.findByIdAndDelete(taskId);

  res.json({
    success: true,
    message: "Task deleted successfully.",
  });
};

// ================= CHANNEL FOLDERS =================

exports.getChannelFolders = async (req, res) => {
  const { channelId } = req.params;

  const folders = await TeamHubFolder.find({
    channelId,
    status: "Active",
  }).sort({ folderPath: 1 });

  res.json({ success: true, data: folders });
};

exports.createChannelFolder = async (req, res) => {
  const { channelId, name, parentFolderPath } = req.body;

  if (!channelId || !name) {
    return res.status(400).json({
      success: false,
      message: "Channel and folder name are required.",
    });
  }

  const cleanedName = String(name).trim();
  const cleanedParent = String(parentFolderPath || "").trim();

  const folderPath = cleanedParent
    ? `${cleanedParent}/${cleanedName}`
    : cleanedName;

  const folder = await TeamHubFolder.create({
    channelId,
    name: cleanedName,
    folderPath,
    parentFolderPath: cleanedParent,
    createdByUserId: req.user.userId,
    createdByName: req.user.fullName || req.user.email || "System User",
  });

  res.status(201).json({ success: true, data: folder });
};

exports.renameChannelFolder = async (req, res) => {
  const { folderId } = req.params;
  const { name } = req.body;

  if (!name) {
    return res.status(400).json({
      success: false,
      message: "New folder name is required.",
    });
  }

  const folder = await TeamHubFolder.findById(folderId);

  if (!folder || folder.status !== "Active") {
    return res.status(404).json({
      success: false,
      message: "Folder not found.",
    });
  }

  const oldPath = folder.folderPath;
  const cleanedName = String(name).trim();

  const newPath = folder.parentFolderPath
    ? `${folder.parentFolderPath}/${cleanedName}`
    : cleanedName;

  folder.name = cleanedName;
  folder.folderPath = newPath;
  await folder.save();

  await TeamHubDocument.updateMany(
    {
      channelId: folder.channelId,
      folderPath: oldPath,
    },
    {
      folder: cleanedName,
      folderPath: newPath,
      parentFolder: folder.parentFolderPath,
    }
  );

  res.json({ success: true, data: folder });
};

exports.moveChannelFolder = async (req, res) => {
  const { folderId } = req.params;
  const { parentFolderPath } = req.body;

  const folder = await TeamHubFolder.findById(folderId);

  if (!folder || folder.status !== "Active") {
    return res.status(404).json({
      success: false,
      message: "Folder not found.",
    });
  }

  const oldPath = folder.folderPath;
  const cleanedParent = String(parentFolderPath || "").trim();

  const newPath = cleanedParent
    ? `${cleanedParent}/${folder.name}`
    : folder.name;

  folder.parentFolderPath = cleanedParent;
  folder.folderPath = newPath;
  await folder.save();

  await TeamHubDocument.updateMany(
    {
      channelId: folder.channelId,
      folderPath: oldPath,
    },
    {
      folder: folder.name,
      folderPath: newPath,
      parentFolder: cleanedParent,
    }
  );

  res.json({ success: true, data: folder });
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
  const { channelId, title, folder, folderPath, parentFolder } = req.body;
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

  const uploadedByName = req.user.fullName || req.user.email || "System User";

  const document = await TeamHubDocument.create({
    channelId,
    title: title || file.originalname,
    folder: folder || "General",
    folderPath: folderPath || folder || "General",
    parentFolder: parentFolder || "",
    originalName: file.originalname,
    fileName: file.filename,
    fileUrl: `/uploads/team-hub/${file.filename}`,
    mimeType: file.mimetype,
    size: file.size,
    uploadedBy: req.user.userId,
    uploadedByName,
    currentVersion: 1,
    versions: [
      {
        versionNumber: 1,
        originalName: file.originalname,
        fileName: file.filename,
        fileUrl: `/uploads/team-hub/${file.filename}`,
        mimeType: file.mimetype,
        size: file.size,
        uploadedBy: req.user.userId,
        uploadedByName,
        notes: "Initial upload",
      },
    ],
  });

  res.status(201).json({ success: true, data: document });
};

exports.uploadDocumentVersion = async (req, res) => {
  const { documentId } = req.params;
  const { notes } = req.body;
  const file = req.file;

  if (!file) {
    return res.status(400).json({
      success: false,
      message: "New version file is required.",
    });
  }

  const document = await TeamHubDocument.findById(documentId);

  if (!document || document.status !== "Active") {
    return res.status(404).json({
      success: false,
      message: "Document not found.",
    });
  }

  if (
    document.isLocked &&
    document.lockedByUserId &&
    document.lockedByUserId !== req.user.userId
  ) {
    return res.status(403).json({
      success: false,
      message: `Document is locked by ${document.lockedByName || "another user"}.`,
    });
  }

  const uploadedByName = req.user.fullName || req.user.email || "System User";
  const nextVersion = Number(document.currentVersion || 1) + 1;

  document.currentVersion = nextVersion;
  document.originalName = file.originalname;
  document.fileName = file.filename;
  document.fileUrl = `/uploads/team-hub/${file.filename}`;
  document.mimeType = file.mimetype;
  document.size = file.size;

  document.versions.push({
    versionNumber: nextVersion,
    originalName: file.originalname,
    fileName: file.filename,
    fileUrl: `/uploads/team-hub/${file.filename}`,
    mimeType: file.mimetype,
    size: file.size,
    uploadedBy: req.user.userId,
    uploadedByName,
    notes: notes || "",
  });

  await document.save();

  res.json({ success: true, data: document });
};

exports.lockDocument = async (req, res) => {
  const { documentId } = req.params;

  const document = await TeamHubDocument.findById(documentId);

  if (!document || document.status !== "Active") {
    return res.status(404).json({
      success: false,
      message: "Document not found.",
    });
  }

  if (
    document.isLocked &&
    document.lockedByUserId &&
    document.lockedByUserId !== req.user.userId
  ) {
    return res.status(403).json({
      success: false,
      message: `Document is already locked by ${document.lockedByName || "another user"}.`,
    });
  }

  document.isLocked = true;
  document.lockedByUserId = req.user.userId;
  document.lockedByName = req.user.fullName || req.user.email || "System User";
  document.lockedAt = new Date();

  await document.save();

  res.json({ success: true, data: document });
};

exports.unlockDocument = async (req, res) => {
  const { documentId } = req.params;

  const document = await TeamHubDocument.findById(documentId);

  if (!document || document.status !== "Active") {
    return res.status(404).json({
      success: false,
      message: "Document not found.",
    });
  }

  const isOwner = document.lockedByUserId === req.user.userId;
  const isAdmin = req.user.role === "Admin";

  if (document.isLocked && !isOwner && !isAdmin) {
    return res.status(403).json({
      success: false,
      message: "Only the person who locked this document or an Admin can unlock it.",
    });
  }

  document.isLocked = false;
  document.lockedByUserId = "";
  document.lockedByName = "";
  document.lockedAt = null;

  await document.save();

  res.json({ success: true, data: document });
};

exports.moveDocumentFolder = async (req, res) => {
  const { documentId } = req.params;
  const { folder, folderPath, parentFolder } = req.body;

  const document = await TeamHubDocument.findById(documentId);

  if (!document || document.status !== "Active") {
    return res.status(404).json({
      success: false,
      message: "Document not found.",
    });
  }

  document.folder = folder || "General";
  document.folderPath = folderPath || folder || "General";
  document.parentFolder = parentFolder || "";

  await document.save();

  res.json({ success: true, data: document });
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

// ================= MESSAGE REACTIONS =================

exports.toggleMessageReaction = async (req, res) => {
  const { messageId } = req.params;
  const { emoji } = req.body;
  const userId = req.user.userId;

  if (!emoji) {
    return res.status(400).json({
      success: false,
      message: "Emoji is required.",
    });
  }

  const message = await TeamMessage.findById(messageId);

  if (!message) {
    return res.status(404).json({
      success: false,
      message: "Message not found.",
    });
  }

  const existingReaction = (message.reactions || []).find(
    (reaction) => reaction.userId === userId && reaction.emoji === emoji
  );

  if (existingReaction) {
    message.reactions = message.reactions.filter(
      (reaction) => !(reaction.userId === userId && reaction.emoji === emoji)
    );
  } else {
    message.reactions = [
      ...(message.reactions || []).filter((reaction) => reaction.userId !== userId),
      { emoji, userId },
    ];
  }

  await message.save();

  res.json({
    success: true,
    data: message,
  });
};

// ================= TEAM HUB NOTIFICATIONS =================

exports.getMyNotifications = async (req, res) => {
  const notifications = await TeamHubNotification.find({
    userId: req.user.userId,
  }).sort({ createdAt: -1 });

  const unreadCount = notifications.filter((item) => !item.isRead).length;

  res.json({
    success: true,
    data: notifications,
    unreadCount,
  });
};

exports.markNotificationRead = async (req, res) => {
  const { notificationId } = req.params;

  const notification = await TeamHubNotification.findOneAndUpdate(
    {
      _id: notificationId,
      userId: req.user.userId,
    },
    { isRead: true },
    { new: true }
  );

  res.json({ success: true, data: notification });
};

exports.markAllNotificationsRead = async (req, res) => {
  await TeamHubNotification.updateMany(
    { userId: req.user.userId, isRead: false },
    { isRead: true }
  );

  res.json({
    success: true,
    message: "All Team Hub notifications marked as read.",
  });
};

// ================= DIRECT CHAT =================

const attachDirectConversationProfiles = async (conversations = [], myId = "") => {
  const otherUserIds = [
    ...new Set(
      conversations
        .flatMap((conversation) => conversation.participants || [])
        .filter((participantId) => participantId && participantId !== myId)
    ),
  ];

  const users = await SystemUser.find({
    userId: { $in: otherUserIds },
  }).select("userId fullName role branch dutyStatus employeeSnapshot status");

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
      status: user.status,
    };
  });

  return Promise.all(
    conversations.map(async (conversation) => {
      const obj = conversation.toObject();
      const otherUserId = (obj.participants || []).find(
        (participantId) => participantId !== myId
      );

      const lastMessage = await DirectMessage.findOne({
        conversationId: obj._id,
      }).sort({ createdAt: -1 });

      const unreadCount = await DirectMessage.countDocuments({
        conversationId: obj._id,
        receiverId: myId,
        isRead: false,
      });

      return {
        ...obj,
        otherUserId,
        otherUserProfile: userMap[otherUserId] || null,
        lastMessage,
        unreadCount,
      };
    })
  );
};

exports.getMyDirectConversations = async (req, res) => {
  const myId = req.user.userId;

  const conversations = await DirectConversation.find({
    participants: myId,
  }).sort({ updatedAt: -1 });

  const enriched = await attachDirectConversationProfiles(conversations, myId);

  res.json({ success: true, data: enriched });
};

exports.getOrCreateConversation = async (req, res) => {
  const { targetUserId } = req.body;
  const myId = req.user.userId;

  if (!targetUserId) {
    return res.status(400).json({
      success: false,
      message: "Target user is required.",
    });
  }

  if (targetUserId === myId) {
    return res.status(400).json({
      success: false,
      message: "You cannot start a direct chat with yourself.",
    });
  }

  const targetUser = await SystemUser.findOne({
    userId: targetUserId,
    status: "Active",
  }).select("userId fullName role branch dutyStatus employeeSnapshot status");

  if (!targetUser) {
    return res.status(404).json({
      success: false,
      message: "Target staff member not found.",
    });
  }

  let convo = await DirectConversation.findOne({
    participants: { $all: [myId, targetUserId] },
  });

  if (!convo) {
    convo = await DirectConversation.create({
      participants: [myId, targetUserId],
    });
  }

  res.json({
    success: true,
    data: {
      ...convo.toObject(),
      otherUserId: targetUserId,
      otherUserProfile: {
        userId: targetUser.userId,
        fullName: targetUser.fullName,
        role: targetUser.role,
        branch: targetUser.branch,
        dutyStatus: targetUser.dutyStatus,
        jobTitle: targetUser.employeeSnapshot?.jobTitle || "",
        department: targetUser.employeeSnapshot?.department || "",
        status: targetUser.status,
      },
    },
  });
};

exports.getDirectMessages = async (req, res) => {
  const { conversationId } = req.params;
  const myId = req.user.userId;

  const conversation = await DirectConversation.findOne({
    _id: conversationId,
    participants: myId,
  });

  if (!conversation) {
    return res.status(404).json({
      success: false,
      message: "Conversation not found.",
    });
  }

  await DirectMessage.updateMany(
    {
      conversationId,
      receiverId: myId,
      isRead: false,
    },
    {
      $set: {
        isRead: true,
        readAt: new Date(),
      },
    }
  );

  const messages = await DirectMessage.find({ conversationId }).sort({
    createdAt: 1,
  });

  res.json({ success: true, data: messages });
};

exports.sendDirectMessage = async (req, res) => {
  const { conversationId, receiverId, message } = req.body;
  const senderId = req.user.userId;

  const attachments = buildAttachments(req.files || []);

  if (!conversationId || !receiverId) {
    return res.status(400).json({
      success: false,
      message: "Conversation and receiver are required.",
    });
  }

  if (!message && attachments.length === 0) {
    return res.status(400).json({
      success: false,
      message: "Message or attachment is required.",
    });
  }

  const conversation = await DirectConversation.findOne({
    _id: conversationId,
    participants: { $all: [senderId, receiverId] },
  });

  if (!conversation) {
    return res.status(404).json({
      success: false,
      message: "Conversation not found.",
    });
  }

  const directMessage = await DirectMessage.create({
    conversationId,
    senderId,
    receiverId,
    message,
    attachments,
  });

  conversation.updatedAt = new Date();
  await conversation.save();

  await TeamHubNotification.create({
    userId: receiverId,
    type: "DirectMessage",
    title: "New direct message",
    body: message || "You received a direct message attachment.",
    messageId: null,
  });

  res.status(201).json({
    success: true,
    data: directMessage,
  });
};

exports.markDirectMessageRead = async (req, res) => {
  const { messageId } = req.params;
  const myId = req.user.userId;

  const message = await DirectMessage.findOneAndUpdate(
    {
      _id: messageId,
      receiverId: myId,
    },
    {
      isRead: true,
      readAt: new Date(),
    },
    { new: true }
  );

  res.json({ success: true, data: message });
};