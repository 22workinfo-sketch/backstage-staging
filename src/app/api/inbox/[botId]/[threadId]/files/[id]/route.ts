import { NextRequest } from "next/server";
import { inboxRequest } from "@/lib/inbox/http";
import { InboxError, requireInboxBot } from "@/lib/inbox/access";
import { prisma } from "@/lib/prisma";
import { resolveBotToken } from "@/lib/bot-service";
import { createTelegramApi } from "@/lib/telegram-client";

export const dynamic = "force-dynamic";
export async function GET(req: NextRequest, { params }: { params: { botId: string; threadId: string; id: string } }) {
  return inboxRequest(req, async user => {
    await requireInboxBot(user, params.botId);
    if (!/^\d{1,18}$/.test(params.id)) throw new InboxError(404, "Attachment unavailable.");
    const item = await prisma.supportMessage.findFirst({ where: { id: BigInt(params.id),
      conversationId: params.threadId, conversation: { botId: params.botId } },
      select: { attachmentId: true, conversation: { select: { bot: { select: { encryptedToken: true, tokenEnvVar: true } } } } } });
    if (!item?.attachmentId) throw new InboxError(404, "Attachment unavailable.");
    const token = resolveBotToken(item.conversation.bot);
    if (!token) throw new InboxError(503, "Bot credentials are unavailable.");
    const file = await createTelegramApi(token, { timeoutSeconds: 15 }).getFile(item.attachmentId)
      .catch(() => { throw new InboxError(422, "Telegram could not provide this file. The cloud download limit is 20 MB."); });
    if (!file.file_path || (file.file_size && file.file_size > 20 * 1024 * 1024)) throw new InboxError(422, "Attachment exceeds Telegram's cloud download limit.");
    const path = file.file_path.split("/").map(encodeURIComponent).join("/");
    const download = await fetch(`https://api.telegram.org/file/bot${token}/${path}`, {
      cache: "no-store", redirect: "error", signal: AbortSignal.timeout(60000),
    });
    if (!download.ok || !download.body) throw new InboxError(502, "Telegram could not return this attachment.");
    const filename = file.file_path.split("/").pop()!.replace(/[^\w.-]/g, "_");
    return new Response(download.body, { headers: {
      "Content-Type": "application/octet-stream", "Content-Disposition": `attachment; filename="${filename}"`,
      "X-Content-Type-Options": "nosniff", "Cache-Control": "private, no-store",
    } });
  });
}
