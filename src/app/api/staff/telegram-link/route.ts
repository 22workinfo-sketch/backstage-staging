import { NextRequest, NextResponse } from "next/server";
import { getAdminSession, enforcePasswordChangeStatus } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  generateStaffTelegramLinkCode,
  linkStaffTelegramDirectly,
} from "@/lib/telegram-media-service";
import { verifyRequestOrigin } from "@/lib/rate-limit";

export async function GET(req: NextRequest) {
  try {
    const session = await getAdminSession(req);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const pwdCheck = enforcePasswordChangeStatus(session);
    if (pwdCheck) return pwdCheck;

    const user = await prisma.adminUser.findUnique({
      where: { id: session.id },
      select: {
        id: true,
        email: true,
        role: true,
        telegramUserId: true,
        telegramUsername: true,
        telegramLinkCode: true,
        telegramLinkExpiresAt: true,
      },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const isCodeValid =
      user.telegramLinkCode &&
      user.telegramLinkExpiresAt &&
      user.telegramLinkExpiresAt > new Date();

    return NextResponse.json({
      success: true,
      linked: Boolean(user.telegramUserId),
      telegramUserId: user.telegramUserId ? user.telegramUserId.toString() : null,
      telegramUsername: user.telegramUsername,
      activeCode: isCodeValid ? user.telegramLinkCode : null,
      expiresAt: isCodeValid ? user.telegramLinkExpiresAt : null,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to fetch Telegram link status";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const originCheck = verifyRequestOrigin(req);
    if (!originCheck.isValid) {
      return NextResponse.json(
        { error: originCheck.error || "Forbidden" },
        { status: 403 }
      );
    }

    const session = await getAdminSession(req);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const pwdCheck = enforcePasswordChangeStatus(session);
    if (pwdCheck) return pwdCheck;

    const body = await req.json().catch(() => ({}));

    // If an admin provides direct link data for themselves or testing
    if (body.action === "DIRECT_LINK" && body.telegramUserId) {
      const res = await linkStaffTelegramDirectly(
        session.id,
        BigInt(body.telegramUserId),
        body.telegramUsername
      );
      return NextResponse.json(res);
    }

    // Default action: generate a 6-digit link code for the staff user
    const code = await generateStaffTelegramLinkCode(session.id);

    return NextResponse.json({
      success: true,
      code,
      expiresInMinutes: 15,
      instruction: `Open Telegram, send "/link ${code}" to any authorized Botdesk bot.`,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to generate Telegram link code";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
