import { NextRequest, NextResponse } from "next/server";
import { inboxRequest, readPayload } from "@/lib/inbox/http";
import { InboxError } from "@/lib/inbox/access";
import { getThreadsEtag, listThreads } from "@/lib/inbox/threads";
import { prisma } from "@/lib/prisma";

type Context = { params: { botId: string } };
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: Context) {
  return inboxRequest(req, async user => {
    const etag = await getThreadsEtag(user, params.botId, req.nextUrl.searchParams);
    const ifNoneMatch = req.headers.get("if-none-match");
    if (etag && ifNoneMatch === etag) {
      return new NextResponse(null, {
        status: 304,
        headers: { ETag: etag, "Cache-Control": "no-store" },
      });
    }
    const data = await listThreads(user, params.botId, req.nextUrl.searchParams);
    return NextResponse.json(data, {
      headers: etag ? { ETag: etag, "Cache-Control": "no-store" } : { "Cache-Control": "no-store" },
    });
  });
}

export async function PUT(req: NextRequest, { params }: Context) {
  return inboxRequest(req, async user => {
    if (user.role !== "SUPER_ADMIN") throw new InboxError(403, "Only a super admin can change the bot's inbox mode.");
    const { enabled } = await readPayload(req);
    if (typeof enabled !== "boolean") throw new InboxError(400, "Choose an inbox mode.");
    const result = await prisma.bot.updateMany({ where: { id: params.botId, isActive: true }, data: { supportInboxEnabled: enabled } });
    if (!result.count) throw new InboxError(404, "Bot unavailable.");
    return NextResponse.json({ enabled });
  });
}
