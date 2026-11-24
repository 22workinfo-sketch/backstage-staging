import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { inboxRequest, readPayload } from "@/lib/inbox/http";
import { readThread, queueReply, changeThread } from "@/lib/inbox/threads";
import { InboxError } from "@/lib/inbox/access";
import { getStorageProvider } from "@/lib/storage";

type Context = { params: { botId: string; threadId: string } };
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: Context) {
  return inboxRequest(req, async user => NextResponse.json(
    await readThread(user, params.botId, params.threadId, req.nextUrl.searchParams.get("before"))
  ));
}

export async function POST(req: NextRequest, { params }: Context) {
  return inboxRequest(req, async user => {
    const contentType = req.headers.get("content-type") || "";
    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      const body = (formData.get("body") as string) || "";
      const clientKey = (formData.get("clientKey") as string) || randomUUID();
      const file = formData.get("file") as File | null;
      const replyToId = formData.get("replyToId") as string | null;
      const replyToText = formData.get("replyToText") as string | null;
      const replyToSender = formData.get("replyToSender") as string | null;

      let attachment: { attachmentId: string; attachmentName: string } | undefined = undefined;
      if (file && file.size > 0) {
        if (file.size > 20 * 1024 * 1024) {
          throw new InboxError(400, "File exceeds maximum size of 20 MB.");
        }
        const storage = getStorageProvider();
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
        const storageKey = `inbox/${randomUUID()}_${safeName}`;
        const buffer = Buffer.from(await file.arrayBuffer());
        await storage.putObject(storageKey, buffer, file.type || "application/octet-stream");
        attachment = {
          attachmentId: storageKey,
          attachmentName: file.name,
        };
      }

      const replyTo = replyToId ? { id: replyToId, text: replyToText || undefined, sender: replyToSender || undefined } : undefined;
      const receipt = await queueReply(user, params.botId, params.threadId, body, clientKey, attachment, replyTo);
      return NextResponse.json(receipt, { status: 202 });
    }

    const { body, clientKey, replyToId, replyToText, replyToSender } = await readPayload(req);
    const replyTo = replyToId ? { id: String(replyToId), text: typeof replyToText === "string" ? replyToText : undefined, sender: typeof replyToSender === "string" ? replyToSender : undefined } : undefined;
    const receipt = await queueReply(user, params.botId, params.threadId, body, clientKey, undefined, replyTo);
    return NextResponse.json(receipt, { status: 202 });
  });
}

export async function PATCH(req: NextRequest, { params }: Context) {
  return inboxRequest(req, async user => {
    const { action, messageId, name, emoji } = await readPayload(req);
    await changeThread(user, params.botId, params.threadId, action, messageId, name, emoji);
    return NextResponse.json({ ok: true });
  });
}
