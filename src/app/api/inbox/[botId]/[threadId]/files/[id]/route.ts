import { NextRequest } from "next/server";
import { inboxRequest } from "@/lib/inbox/http";
import { InboxError, requireInboxBot } from "@/lib/inbox/access";
import { prisma } from "@/lib/prisma";
import { resolveBotToken } from "@/lib/bot-service";
import { createTelegramApi } from "@/lib/telegram-client";
import { getStorageProvider } from "@/lib/storage";

export const dynamic = "force-dynamic";

function getFileContentType(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "png":
      return "image/png";
    case "webp":
      return "image/webp";
    case "gif":
      return "image/gif";
    case "pdf":
      return "application/pdf";
    case "txt":
      return "text/plain";
    case "mp3":
      return "audio/mpeg";
    case "oga":
    case "ogg":
    case "opus":
      return "audio/ogg";
    case "wav":
      return "audio/wav";
    case "m4a":
    case "aac":
      return "audio/mp4";
    case "flac":
      return "audio/flac";
    case "weba":
      return "audio/webm";
    case "mp4":
      return "video/mp4";
    case "webm":
      return "video/webm";
    case "mov":
      return "video/quicktime";
    default:
      if (/^(image|photo)$/i.test(filename)) return "image/jpeg";
      if (/^video$/i.test(filename)) return "video/mp4";
      if (/^audio$/i.test(filename)) return "audio/mpeg";
      if (/^(voice|voice message)$/i.test(filename)) return "audio/ogg";
      return "application/octet-stream";
  }
}

function makeFileResponse(
  req: NextRequest,
  buffer: Buffer,
  filename: string,
  contentType: string,
  cacheControl = "private, max-age=86400"
): Response {
  const totalLength = buffer.length;
  const range = req.headers.get("range");

  if (range && range.startsWith("bytes=")) {
    const parts = range.replace(/bytes=/, "").split("-");
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : totalLength - 1;

    if (!isNaN(start) && start < totalLength && (isNaN(end) || end < totalLength) && start <= (isNaN(end) ? totalLength - 1 : end)) {
      const actualEnd = isNaN(end) ? totalLength - 1 : end;
      const chunk = buffer.subarray(start, actualEnd + 1);
      return new Response(new Uint8Array(chunk), {
        status: 206,
        headers: {
          "Content-Type": contentType,
          "Content-Range": `bytes ${start}-${actualEnd}/${totalLength}`,
          "Accept-Ranges": "bytes",
          "Content-Length": String(chunk.length),
          "Content-Disposition": `inline; filename="${filename}"`,
          "X-Content-Type-Options": "nosniff",
          "Cache-Control": cacheControl,
        },
      });
    }
  }

  return new Response(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Accept-Ranges": "bytes",
      "Content-Length": String(totalLength),
      "Content-Disposition": `inline; filename="${filename}"`,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": cacheControl,
    },
  });
}

export async function GET(req: NextRequest, { params }: { params: { botId: string; threadId: string; id: string } }) {
  return inboxRequest(req, async user => {
    await requireInboxBot(user, params.botId);
    if (!/^\d{1,18}$/.test(params.id)) throw new InboxError(404, "Attachment unavailable.");
    const item = await prisma.supportMessage.findFirst({
      where: {
        id: BigInt(params.id),
        conversationId: params.threadId,
        conversation: { botId: params.botId },
      },
      select: {
        attachmentId: true,
        attachmentName: true,
        conversation: { select: { bot: { select: { encryptedToken: true, tokenEnvVar: true } } } },
      },
    });
    if (!item?.attachmentId) throw new InboxError(404, "Attachment unavailable.");

    // Direct remote URL (e.g. Facebook Messenger attachment CDN)
    if (item.attachmentId.startsWith("http://") || item.attachmentId.startsWith("https://")) {
      try {
        const download = await fetch(item.attachmentId, {
          cache: "no-store",
          signal: AbortSignal.timeout(30000),
        });
        if (!download.ok || !download.body) {
          throw new InboxError(502, "Could not retrieve attachment from remote server.");
        }
        let contentType = download.headers.get("content-type") || getFileContentType(item.attachmentName || "file");
        if (contentType.includes("octet-stream") && item.attachmentName) {
          contentType = getFileContentType(item.attachmentName);
        }
        const filename = (item.attachmentName || "file").replace(/[^\w.-]/g, "_");
        const arrayBuffer = await download.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        return makeFileResponse(req, buffer, filename, contentType, "private, max-age=86400");
      } catch (err) {
        if (err instanceof InboxError) throw err;
        throw new InboxError(502, "Error downloading attachment.");
      }
    }

    // Check if attachment is stored in local/S3 storage (e.g. staff upload)
    if (item.attachmentId.startsWith("inbox/")) {
      const storage = getStorageProvider();
      try {
        const { data, mimeType } = await storage.getObject(item.attachmentId);
        const filename = (item.attachmentName || "file").replace(/[^\w.-]/g, "_");
        const contentType = mimeType || getFileContentType(filename);
        const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data);
        return makeFileResponse(req, buffer, filename, contentType, "private, max-age=3600");
      } catch {
        throw new InboxError(404, "Attachment unavailable in storage.");
      }
    }

    // Inbound attachment from Telegram
    const token = resolveBotToken(item.conversation.bot);
    if (!token) throw new InboxError(503, "Bot credentials are unavailable.");
    const file = await createTelegramApi(token, { timeoutSeconds: 15 }).getFile(item.attachmentId)
      .catch(() => { throw new InboxError(422, "Telegram could not provide this file. The cloud download limit is 20 MB."); });
    if (!file.file_path || (file.file_size && file.file_size > 20 * 1024 * 1024))
      throw new InboxError(422, "Attachment exceeds Telegram's cloud download limit.");
    const path = file.file_path.split("/").map(encodeURIComponent).join("/");
    const download = await fetch(`https://api.telegram.org/file/bot${token}/${path}`, {
      cache: "no-store", redirect: "error", signal: AbortSignal.timeout(60000),
    });
    if (!download.ok || !download.body) throw new InboxError(502, "Telegram could not return this attachment.");

    const rawTgFilename = file.file_path.split("/").pop() || "";
    const tgExt = rawTgFilename.includes(".") ? rawTgFilename.split(".").pop()?.toLowerCase() : "";

    let filename = item.attachmentName || rawTgFilename || "file";
    if (!filename.includes(".") && tgExt) {
      filename = `${filename}.${tgExt}`;
    }
    filename = filename.replace(/[^\w.-]/g, "_");
    const contentType = getFileContentType(filename);

    const arrayBuffer = await download.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    return makeFileResponse(req, buffer, filename, contentType, "private, no-store");
  });
}
