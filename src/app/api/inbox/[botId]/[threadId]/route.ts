import { NextRequest, NextResponse } from "next/server";
import { inboxRequest, readPayload } from "@/lib/inbox/http";
import { readThread, queueReply, changeThread } from "@/lib/inbox/threads";

type Context = { params: { botId: string; threadId: string } };
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: Context) {
  return inboxRequest(req, async user => NextResponse.json(
    await readThread(user, params.botId, params.threadId, req.nextUrl.searchParams.get("before"))
  ));
}

export async function POST(req: NextRequest, { params }: Context) {
  return inboxRequest(req, async user => {
    const { body, clientKey } = await readPayload(req);
    const receipt = await queueReply(user, params.botId, params.threadId, body, clientKey);
    return NextResponse.json(receipt, { status: 202 });
  });
}

export async function PATCH(req: NextRequest, { params }: Context) {
  return inboxRequest(req, async user => {
    const { action, messageId } = await readPayload(req);
    await changeThread(user, params.botId, params.threadId, action, messageId);
    return NextResponse.json({ ok: true });
  });
}
