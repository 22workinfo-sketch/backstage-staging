import { Prisma } from "@prisma/client";
import type { AdminSession } from "../auth";
import { prisma } from "../prisma";
import { InboxError, requireInboxBot } from "./access";
import { MAX_REPLY_LENGTH, splitReply } from "./text";

export const PAGE_SIZE = 40;
const owner = { select: { id: true, email: true } };
const messageFields = {
  id: true, body: true, status: true, sentParts: true, lastError: true, attachmentName: true,
  createdAt: true, sender: { select: { email: true } },
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
    messages: messages.slice(0, PAGE_SIZE).reverse().map(m => ({ ...m, id: m.id.toString() })) };
}

// Serialize staff actions with incoming replies, so two agents cannot both claim an open chat.
async function lockThread(tx: Prisma.TransactionClient, botId: string, threadId: string) {
  const [thread] = await tx.$queryRaw<{ ownerId: string | null; resolved: boolean }[]>`
    SELECT "ownerId", resolved FROM support_conversations
    WHERE id = ${threadId} AND "botId" = ${botId} FOR UPDATE`;
  if (!thread) throw new InboxError(404, "Conversation unavailable.");
  return thread;
}

export async function queueReply(user: AdminSession, botId: string, threadId: string, body: unknown, key: unknown, attachment?: { attachmentId: string; attachmentName: string }) {
  await requireInboxBot(user, botId);
  const text = typeof body === "string" ? body : "";
  if (!text.trim() && !attachment)
    throw new InboxError(400, "Enter a reply of up to 65,536 characters.");
  if (text.length > MAX_REPLY_LENGTH || text.includes("\0"))
    throw new InboxError(400, "Enter a reply of up to 65,536 characters.");
  if (typeof key !== "string" || !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(key))
    throw new InboxError(400, "Invalid reply identifier.");
  const parts = splitReply(text);
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
    const message = await tx.supportMessage.create({ data: { conversationId: threadId, senderId: user.id,
      clientKey: key, body: text, parts, attachmentId: attachment?.attachmentId ?? null, attachmentName: attachment?.attachmentName ?? null,
      status: "QUEUED", availableAt: new Date(Date.now() - 2000) }, select: { id: true } });
    return { id: message.id.toString() };
  });
}

export async function changeThread(user: AdminSession, botId: string, threadId: string, action: unknown, messageId?: unknown, newName?: unknown) {
  await requireInboxBot(user, botId);
  return prisma.$transaction(async tx => {
    const thread = await lockThread(tx, botId, threadId);
    const supervisor = user.role === "ADMIN" || user.role === "SUPER_ADMIN";
    if (thread.ownerId && thread.ownerId !== user.id && !supervisor) throw new InboxError(409, "This conversation belongs to another agent.");
    if (action === "claim" || action === "release" || action === "resolve" || action === "reopen") {
      const data = action === "claim" ? { ownerId: user.id } : action === "release" ? { ownerId: null } : { resolved: action === "resolve" };
      await tx.supportConversation.update({ where: { id: threadId }, data });
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
    const result = await tx.supportMessage.updateMany({
      where: { id: BigInt(messageId), conversationId: threadId, status: { in: ["FAILED", "UNCERTAIN"] } },
      data: { status: action === "retry" ? "QUEUED" : "CANCELLED", availableAt: new Date(Date.now() - 2000), lastError: null },
    });
    if (!result.count) throw new InboxError(409, "The delivery status has changed. Refresh the conversation.");
  });
}
