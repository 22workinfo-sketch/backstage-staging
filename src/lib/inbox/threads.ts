import { Prisma } from "@prisma/client";
import type { ReactionTypeEmoji } from "grammy/types";
import type { AdminSession } from "../auth";
import { prisma } from "../prisma";
import { InboxError, requireInboxBot } from "./access";
import { MAX_REPLY_LENGTH, splitReply } from "./text";
import { resolveBotToken } from "../bot-service";
import { createTelegramApi } from "../telegram-client";

export const PAGE_SIZE = 40;
const owner = { select: { id: true, email: true } };
const messageFields = {
  id: true, body: true, status: true, sentParts: true, lastError: true, attachmentName: true,
  createdAt: true, sender: { select: { email: true } },
  replyToId: true, replyToText: true, replyToSender: true,
  reactions: true,
} satisfies Prisma.SupportMessageSelect;

export async function listThreads(user: AdminSession, botId: string, query: URLSearchParams) {
  await requireInboxBot(user, botId);
  const filter = query.get("filter");
  const search = query.get("q")?.trim().slice(0, 120);
  const page = Number(query.get("page") || "0");
  if (!Number.isSafeInteger(page) || page < 0 || page > 100000) throw new InboxError(400, "Invalid page.");
  const rows = await prisma.supportConversation.findMany({
    where: {
      botId, resolved: filter === "resolved",
      ...(filter === "mine" ? { ownerId: user.id } : {}),
      ...(search ? { OR: [{ name: { contains: search, mode: "insensitive" } }, { username: { contains: search.replace(/^@/, ""), mode: "insensitive" } }] } : {}),
    },
    orderBy: [{ lastActivityAt: "desc" }, { id: "asc" }], skip: page * PAGE_SIZE, take: PAGE_SIZE + 1,
    select: { id: true, name: true, username: true, lastActivityAt: true, owner,
      messages: { orderBy: { id: "desc" }, take: 1, select: { id: true, body: true, attachmentName: true, status: true } } },
  });
  return { items: rows.slice(0, PAGE_SIZE).map(({ messages, ...item }) => ({
    ...item,
    preview: (messages[0]?.body || messages[0]?.attachmentName || "").slice(0, 140),
    lastMessageId: messages[0]?.id ? messages[0].id.toString() : null,
    lastMessageStatus: messages[0]?.status || null,
  })), hasMore: rows.length > PAGE_SIZE };
}

export async function readThread(user: AdminSession, botId: string, threadId: string, before: string | null) {
  await requireInboxBot(user, botId);
  if (before && !/^[1-9]\d{0,17}$/.test(before)) throw new InboxError(400, "Invalid message cursor.");
  const thread = await prisma.supportConversation.findFirst({
    where: { id: threadId, botId },
    select: { id: true, name: true, username: true, owner, resolved: true,
      messages: { where: before ? { id: { lt: BigInt(before) } } : {}, orderBy: { id: "desc" },
        take: PAGE_SIZE + 1, select: messageFields } },
  });
  if (!thread) throw new InboxError(404, "Conversation unavailable.");
  const { messages, ...info } = thread;
  return { ...info, hasOlder: messages.length > PAGE_SIZE,
    messages: messages.slice(0, PAGE_SIZE).reverse().map(m => {
      let parsedReactions: Array<{ emoji: string; count: number; byStaff?: boolean; byCustomer?: boolean }> = [];
      if (m.reactions) {
        try { parsedReactions = JSON.parse(m.reactions); } catch {}
      }
      return {
        ...m,
        id: m.id.toString(),
        replyToId: m.replyToId ? m.replyToId.toString() : null,
        reactions: parsedReactions,
      };
    }) };
}

// Serialize staff actions with incoming replies, so two agents cannot both claim an open chat.
async function lockThread(tx: Prisma.TransactionClient, botId: string, threadId: string) {
  const [thread] = await tx.$queryRaw<{ ownerId: string | null; resolved: boolean }[]>`
    SELECT "ownerId", resolved FROM support_conversations
    WHERE id = ${threadId} AND "botId" = ${botId} FOR UPDATE`;
  if (!thread) throw new InboxError(404, "Conversation unavailable.");
  return thread;
}

export async function queueReply(
  user: AdminSession,
  botId: string,
  threadId: string,
  body: unknown,
  key: unknown,
  attachment?: { attachmentId: string; attachmentName: string },
  replyTo?: { id?: string; text?: string; sender?: string }
) {
  await requireInboxBot(user, botId);
  const text = typeof body === "string" ? body : "";
  if (!text.trim() && !attachment)
    throw new InboxError(400, "Enter a reply of up to 65,536 characters.");
  if (text.length > MAX_REPLY_LENGTH || text.includes("\0"))
    throw new InboxError(400, "Enter a reply of up to 65,536 characters.");
  if (typeof key !== "string" || !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(key))
    throw new InboxError(400, "Invalid reply identifier.");
  const parts = splitReply(text);

  let replyToId: bigint | null = null;
  let replyToText: string | null = null;
  let replyToSender: string | null = null;
  if (replyTo?.id && /^\d+$/.test(replyTo.id)) {
    replyToId = BigInt(replyTo.id);
    replyToText = typeof replyTo.text === "string" ? replyTo.text.slice(0, 300) : null;
    replyToSender = typeof replyTo.sender === "string" ? replyTo.sender.slice(0, 100) : null;
  }

  return prisma.$transaction(async tx => {
    const thread = await lockThread(tx, botId, threadId);
    const old = await tx.supportMessage.findUnique({ where: { conversationId_clientKey: { conversationId: threadId, clientKey: key } } });
    if (old) {
      if (old.senderId !== user.id || old.body !== text) throw new InboxError(409, "Reply identifier already used.");
      return { id: old.id.toString() };
    }
    if (thread.resolved || (thread.ownerId && thread.ownerId !== user.id))
      throw new InboxError(409, "Reopen or take ownership of this conversation before replying.");
    await tx.supportConversation.update({ where: { id: threadId }, data: { ownerId: user.id, lastActivityAt: new Date() } });
    const message = await tx.supportMessage.create({
      data: {
        conversationId: threadId,
        senderId: user.id,
        clientKey: key,
        body: text,
        parts,
        attachmentId: attachment?.attachmentId ?? null,
        attachmentName: attachment?.attachmentName ?? null,
        status: "QUEUED",
        availableAt: new Date(Date.now() - 2000),
        replyToId,
        replyToText,
        replyToSender,
      },
      select: { id: true },
    });
    return { id: message.id.toString() };
  });
}

export async function changeThread(user: AdminSession, botId: string, threadId: string, action: unknown, messageId?: unknown, newName?: unknown, emoji?: unknown) {
  await requireInboxBot(user, botId);
  return prisma.$transaction(async tx => {
    const thread = await lockThread(tx, botId, threadId);
    const supervisor = user.role === "ADMIN" || user.role === "SUPER_ADMIN";

    if (action === "react") {
      if (typeof messageId !== "string" || !/^\d{1,18}$/.test(messageId)) {
        throw new InboxError(400, "Invalid message ID.");
      }
      if (typeof emoji !== "string" || !emoji.trim()) {
        throw new InboxError(400, "Invalid emoji.");
      }
      const targetEmoji = emoji.trim();
      const msg = await tx.supportMessage.findFirst({
        where: { id: BigInt(messageId), conversationId: threadId },
        include: { conversation: { select: { chatId: true, bot: true } } },
      });
      if (!msg) throw new InboxError(404, "Message not found.");

      let currentReactions: Array<{ emoji: string; count: number; byStaff?: boolean; byCustomer?: boolean }> = [];
      if (msg.reactions) {
        try { currentReactions = JSON.parse(msg.reactions); } catch {}
      }

      const existingIndex = currentReactions.findIndex(r => r.emoji === targetEmoji);
      let newByStaff = false;

      if (existingIndex >= 0) {
        const item = currentReactions[existingIndex];
        if (item.byStaff) {
          item.byStaff = false;
          item.count = Math.max(0, item.count - 1);
          newByStaff = false;
        } else {
          item.byStaff = true;
          item.count += 1;
          newByStaff = true;
        }
        if (item.count <= 0 && !item.byStaff && !item.byCustomer) {
          currentReactions.splice(existingIndex, 1);
        }
      } else {
        currentReactions.push({ emoji: targetEmoji, count: 1, byStaff: true });
        newByStaff = true;
      }

      await tx.supportMessage.update({
        where: { id: BigInt(messageId) },
        data: { reactions: JSON.stringify(currentReactions) },
      });

      // Call Telegram setMessageReaction
      const tgMsgId = msg.telegramMessageId || msg.lastSentMessageId;
      const bot = msg.conversation.bot;
      if (tgMsgId && bot && !bot.username.startsWith("facebook:")) {
        const token = resolveBotToken(bot);
        if (token) {
          try {
            const api = createTelegramApi(token, { timeoutSeconds: 10 });
            const tgEmoji = targetEmoji.replace(/\uFE0F/g, "") as ReactionTypeEmoji["emoji"];
            const reactionList = newByStaff ? [{ type: "emoji" as const, emoji: tgEmoji }] : [];
            await api.setMessageReaction(msg.conversation.chatId, tgMsgId, reactionList).catch(err => {
              console.warn("[Telegram Reaction] Failed to set reaction:", err);
            });
          } catch (tgErr) {
            console.warn("[Telegram Reaction] API error:", tgErr);
          }
        }
      }
      return;
    }

    if (action === "claim") {
      // Any assigned agent can claim an unassigned chat or take over any chat
      await tx.supportConversation.update({ where: { id: threadId }, data: { ownerId: user.id } });
      return;
    }
    if (action === "reopen") {
      // Any assigned agent can reopen a resolved chat and take ownership
      await tx.supportConversation.update({ where: { id: threadId }, data: { resolved: false, ownerId: user.id } });
      return;
    }
    if (action === "resolve") {
      if (thread.ownerId && thread.ownerId !== user.id && !supervisor) {
        throw new InboxError(409, "Take over this conversation before resolving.");
      }
      await tx.supportConversation.update({ where: { id: threadId }, data: { resolved: true } });
      return;
    }
    if (action === "release") {
      if (thread.ownerId && thread.ownerId !== user.id && !supervisor) {
        throw new InboxError(409, "This conversation belongs to another agent.");
      }
      await tx.supportConversation.update({ where: { id: threadId }, data: { ownerId: null } });
      return;
    }
    if (action === "rename") {
      if (typeof newName !== "string" || !newName.trim() || newName.length > 100) {
        throw new InboxError(400, "Name must be between 1 and 100 characters.");
      }
      await tx.supportConversation.update({ where: { id: threadId }, data: { name: newName.trim() } });
      return;
    }
    if ((action !== "retry" && action !== "cancel") || typeof messageId !== "string" || !/^\d{1,18}$/.test(messageId))
      throw new InboxError(400, "Invalid conversation action.");
    if (thread.ownerId && thread.ownerId !== user.id && !supervisor) {
      throw new InboxError(409, "Take over this conversation before modifying its messages.");
    }
    const result = await tx.supportMessage.updateMany({
      where: { id: BigInt(messageId), conversationId: threadId, status: { in: ["FAILED", "UNCERTAIN"] } },
      data: { status: action === "retry" ? "QUEUED" : "CANCELLED", availableAt: new Date(Date.now() - 2000), lastError: null },
    });
    if (!result.count) throw new InboxError(409, "The delivery status has changed. Refresh the conversation.");
  });
}
