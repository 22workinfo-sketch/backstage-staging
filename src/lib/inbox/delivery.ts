import { randomUUID } from "node:crypto";
import { prisma } from "../prisma";
import { resolveBotToken } from "../bot-service";
import { createTelegramApi } from "../telegram-client";

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
    const token = resolveBotToken(bot);
    if (!token) {
      await prisma.supportMessage.updateMany({ where: claim,
        data: { status: "FAILED", claimId: null, lastError: "The bot token is unavailable." } });
      continue;
    }
    let sent: { message_id: number };
    try {
      sent = await send(token, chatId, message.parts[message.sentParts]);
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
    const sentParts = message.sentParts + 1;
    await prisma.supportMessage.updateMany({ where: claim,
      data: { sentParts, lastSentMessageId: sent.message_id, claimId: null, lastError: null,
        status: sentParts === message.parts.length ? "SENT" : "QUEUED", availableAt: new Date(Date.now() + 1000) },
    });
  }
}
