import { randomUUID } from "node:crypto";
import { InputFile } from "grammy";
import { prisma } from "../prisma";
import { resolveBotToken } from "../bot-service";
import { createTelegramApi } from "../telegram-client";
import { getStorageProvider } from "../storage";

type SendPart = (token: string, chatId: string, text: string) => Promise<{ message_id: number }>;
const sendPlainText: SendPart = (token, chatId, text) =>
  createTelegramApi(token, { timeoutSeconds: 25 }).sendMessage(chatId, text);

export async function deliverInboxReplies(send: SendPart = sendPlainText, batchSize = 10) {
  // A process can die after Telegram accepts a part but before we save its ID.
  // Telegram offers no idempotency key for sendMessage. Leave that part for staff review.
  await prisma.supportMessage.updateMany({
    where: { status: "SENDING", availableAt: { lte: new Date() } },
    data: { status: "UNCERTAIN", claimId: null, lastError: "No delivery confirmation. Check with the recipient before retrying." },
  });
  for (let i = 0; i < batchSize; i++) {
    const claimId = randomUUID();
    const [row] = await prisma.$queryRaw<{ id: bigint }[]>`
      UPDATE support_messages SET status = 'SENDING', "claimId" = ${claimId},
        "availableAt" = (statement_timestamp() AT TIME ZONE 'UTC') + INTERVAL '2 minutes'
      WHERE id = (
        SELECT m.id FROM support_messages m
        WHERE m.status = 'QUEUED' AND m."availableAt" <= (statement_timestamp() AT TIME ZONE 'UTC')
        AND NOT EXISTS (
          SELECT 1 FROM support_messages prior WHERE prior."conversationId" = m."conversationId"
          AND prior.id < m.id AND prior.status IN ('QUEUED','SENDING','UNCERTAIN','FAILED')
        )
        ORDER BY m."availableAt", m.id LIMIT 1 FOR UPDATE OF m SKIP LOCKED
      ) RETURNING id`;
    if (!row) break;
    const claim = { id: row.id, status: "SENDING", claimId };
    const message = await prisma.supportMessage.findFirst({
      where: claim, include: { conversation: { include: { bot: true } }, sender: {
        select: { role: true, isActive: true, staffAssignments: { select: { botId: true } } },
      } },
    });
    if (!message) continue;
    const { bot, chatId } = message.conversation;
    const sender = message.sender;
    const authorized = sender?.isActive && (sender.role === "SUPER_ADMIN" ||
      (["ADMIN", "SUPPORT_AGENT"].includes(sender.role) && sender.staffAssignments.some(a => a.botId === bot.id)));
    if (!bot.isActive || !bot.supportInboxEnabled || !authorized) {
      await prisma.supportMessage.updateMany({ where: claim,
        data: { status: "CANCELLED", claimId: null, lastError: "The inbox or sender's access was disabled." } });
      continue;
    }
    const token = resolveBotToken(bot) || (bot.username.startsWith("facebook:") ? process.env.MESSENGER_PAGE_ACCESS_TOKEN || null : null);
    if (!token) {
      await prisma.supportMessage.updateMany({ where: claim,
        data: { status: "FAILED", claimId: null, lastError: "The bot token is unavailable." } });
      continue;
    }

    // Support delivery to Facebook Messenger
    const isMessenger = bot.username.startsWith("facebook:") || bot.tokenEnvVar === "MESSENGER_PAGE_ACCESS_TOKEN";
    if (isMessenger) {
      try {
        let sentOk = false;
        let lastFbError = "";

        if (message.attachmentId && (message.attachmentId.startsWith("inbox/") || message.attachmentId.includes("/"))) {
          let fileData: Buffer;
          let fileMimeType: string | undefined;
          try {
            const storage = getStorageProvider();
            const { data, mimeType } = await storage.getObject(message.attachmentId);
            fileData = data;
            fileMimeType = mimeType;
          } catch (storageErr) {
            console.error(`[Facebook Storage Error] Failed to read attachment ${message.attachmentId}:`, storageErr);
            await prisma.supportMessage.updateMany({
              where: claim,
              data: {
                status: "FAILED",
                claimId: null,
                lastError: "Attachment file could not be read from storage. Please re-attach and try again.",
              },
            });
            continue;
          }

          const isPhoto = fileMimeType?.startsWith("image/") || /\.(jpe?g|png|webp|gif)$/i.test(message.attachmentName || "");
          const formData = new FormData();
          formData.append("recipient", JSON.stringify({ id: chatId }));
          formData.append("messaging_type", "RESPONSE");
          formData.append("message", JSON.stringify({
            attachment: {
              type: isPhoto ? "image" : "file",
              payload: { is_reusable: true },
            },
          }));
          const blob = new Blob([fileData], { type: fileMimeType || "application/octet-stream" });
          formData.append("filedata", blob, message.attachmentName || "image.png");

          const res = await fetch(`https://graph.facebook.com/v21.0/me/messages?access_token=${encodeURIComponent(token)}`, {
            method: "POST",
            body: formData,
          });

          if (!res.ok) {
            const errData = await res.json().catch(() => ({}));
            lastFbError = errData.error?.message || `Facebook delivery failed (${res.status})`;
          } else {
            sentOk = true;
          }

          // If there is also text, send it as a follow-up message
          const textCaption = message.body?.trim();
          if (sentOk && textCaption) {
            await fetch(`https://graph.facebook.com/v21.0/me/messages?access_token=${encodeURIComponent(token)}`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                recipient: { id: chatId },
                messaging_type: "RESPONSE",
                message: { text: textCaption },
              }),
            }).catch(() => {});
          }
        } else {
          // Plain text message
          const textToSend = message.parts[message.sentParts] || message.body;
          const res = await fetch(`https://graph.facebook.com/v21.0/me/messages?access_token=${encodeURIComponent(token)}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              recipient: { id: chatId },
              messaging_type: "RESPONSE",
              message: { text: textToSend },
            }),
          });

          if (!res.ok) {
            const errData = await res.json().catch(() => ({}));
            lastFbError = errData.error?.message || `Facebook delivery failed (${res.status})`;
          } else {
            sentOk = true;
          }
        }

        if (!sentOk) {
          await prisma.supportMessage.updateMany({
            where: claim,
            data: { status: "FAILED", claimId: null, lastError: lastFbError || "Facebook delivery failed" },
          });
          continue;
        }

        const totalParts = Math.max(1, message.parts.length);
        const sentParts = message.parts.length > 0 ? message.sentParts + 1 : 1;
        await prisma.supportMessage.updateMany({
          where: claim,
          data: {
            sentParts,
            claimId: null,
            lastError: null,
            status: sentParts >= totalParts ? "SENT" : "QUEUED",
            availableAt: new Date(Date.now() + 1000),
          },
        });
        continue;
      } catch (err) {
        console.error("[Facebook Delivery Error]", err);
        await prisma.supportMessage.updateMany({
          where: claim,
          data: {
            status: "UNCERTAIN",
            claimId: null,
            lastError: err instanceof Error ? err.message : "Failed to connect to Facebook API",
          },
        });
        continue;
      }
    }
    let sent: { message_id: number };
    try {
      if (message.attachmentId && (message.attachmentId.startsWith("inbox/") || message.attachmentId.includes("/"))) {
        let fileData: Buffer;
        let fileMimeType: string | undefined;
        try {
          const storage = getStorageProvider();
          const { data, mimeType } = await storage.getObject(message.attachmentId);
          fileData = data;
          fileMimeType = mimeType;
        } catch (storageErr) {
          console.error(`[Delivery Storage Error] Failed to read attachment ${message.attachmentId}:`, storageErr);
          await prisma.supportMessage.updateMany({
            where: claim,
            data: {
              status: "FAILED",
              claimId: null,
              lastError: "Attachment file could not be read from storage. Please re-attach and try again.",
            },
          });
          continue;
        }

        const inputFile = new InputFile(fileData, message.attachmentName || undefined);
        const api = createTelegramApi(token, { timeoutSeconds: 35 });
        const caption = message.body ? message.body.slice(0, 1024) : undefined;
        const isPhoto = fileMimeType?.startsWith("image/") || /\.(jpe?g|png|webp)$/i.test(message.attachmentName || "");
        if (isPhoto) {
          sent = await api.sendPhoto(chatId, inputFile, { caption });
        } else {
          sent = await api.sendDocument(chatId, inputFile, { caption });
        }
      } else {
        sent = await send(token, chatId, message.parts[message.sentParts]);
      }
    } catch (error) {
      const apiError = error as { error_code?: number; parameters?: { retry_after?: number } } | null;
      const code = apiError?.error_code;
      if (code === 429) {
        const delay = Math.max(1, apiError?.parameters?.retry_after || 5);
        await prisma.supportMessage.updateMany({ where: claim, data: { status: "QUEUED", claimId: null,
          availableAt: new Date(Date.now() + delay * 1000), lastError: "Waiting for Telegram's rate limit." } });
      } else {
        const rejected = typeof code === "number" && code >= 400 && code < 500;
        await prisma.supportMessage.updateMany({ where: claim, data: { status: rejected ? "FAILED" : "UNCERTAIN", claimId: null,
          lastError: rejected ? `Telegram declined this part (${code}).` : "No delivery confirmation. Check with the recipient before retrying." } });
      }
      continue;
    }
    const totalParts = Math.max(1, message.parts.length);
    const sentParts = message.parts.length > 0 ? message.sentParts + 1 : 1;
    await prisma.supportMessage.updateMany({ where: claim,
      data: { sentParts, lastSentMessageId: sent.message_id, claimId: null, lastError: null,
        status: sentParts >= totalParts ? "SENT" : "QUEUED", availableAt: new Date(Date.now() + 3000) },
    });
  }
}
