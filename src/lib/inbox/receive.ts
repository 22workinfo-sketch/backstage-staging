import type { Message, Update } from "grammy/types";
import { prisma } from "../prisma";

function attachment(message: Message) {
  const file = message.photo?.at(-1) || message.document || message.video || message.voice ||
    message.audio || message.sticker || message.animation || message.video_note;
  if (!file) return null;
  const name = ("file_name" in file && file.file_name) ||
    (message.photo ? "Photo" : message.sticker ? "Sticker" : message.voice ? "Voice message" :
      message.video || message.video_note ? "Video" : message.audio ? "Audio" : "Attachment");
  return { attachmentId: file.file_id, attachmentName: name };
}

// Returning true consumes private updates for a support bot before menus and automations.
export async function receiveSupportUpdate(botId: string, update: Update): Promise<boolean> {
  const message = update.message || update.edited_message;
  const chat = message?.chat || update.callback_query?.message?.chat;
  if (chat?.type !== "private") return false;
  const bot = await prisma.bot.findUnique({
    where: { id: botId }, select: { isActive: true, supportInboxEnabled: true },
  });
  if (!bot?.supportInboxEnabled) return false;
  if (!bot.isActive || !message?.from || message.from.is_bot) return true;
  const person = message.from;
  const chatId = String(chat.id);
  const name = [person.first_name, person.last_name].filter(Boolean).join(" ");
  const file = attachment(message);
  const body = message.text ?? message.caption ?? (file ? "" : "[Telegram message]");
  const updateId = BigInt(update.update_id);
  await prisma.$transaction(async tx => {
    // The native upsert also serializes concurrent deliveries for this chat.
    const thread = await tx.supportConversation.upsert({
      where: { botId_chatId: { botId, chatId } },
      create: { botId, chatId, name, username: person.username },
      update: { chatId }, select: { id: true },
    });
    const source = { conversationId: thread.id, telegramMessageId: message.message_id };
    const data = { body, attachmentId: file?.attachmentId ?? null, attachmentName: file?.attachmentName ?? null, updateId };
    const created = await tx.supportMessage.createMany({
      data: { ...source, ...data, status: "RECEIVED", createdAt: new Date(message.date * 1000) },
      skipDuplicates: true,
    });
    if (created.count) {
      await tx.supportConversation.update({
        where: { id: thread.id }, data: { name, username: person.username ?? null, resolved: false, lastActivityAt: new Date() },
      });
    } else if (update.edited_message) {
      await tx.supportMessage.updateMany({ where: { ...source, updateId: { lt: updateId } }, data });
    }
  });
  return true;
}
