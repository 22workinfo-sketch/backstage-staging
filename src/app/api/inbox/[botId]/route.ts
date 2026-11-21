import { NextRequest, NextResponse } from "next/server";
import { inboxRequest, readPayload } from "@/lib/inbox/http";
import { InboxError } from "@/lib/inbox/access";
import { listThreads } from "@/lib/inbox/threads";
import { prisma } from "@/lib/prisma";

type Context = { params: { botId: string } };
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: Context) {
  return inboxRequest(req, async user =>
    NextResponse.json(await listThreads(user, params.botId, req.nextUrl.searchParams)));
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
