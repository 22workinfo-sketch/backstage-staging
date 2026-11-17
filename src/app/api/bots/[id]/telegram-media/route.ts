import { NextRequest, NextResponse } from "next/server";
import { getAdminSession, enforcePasswordChangeStatus } from "@/lib/auth";
import { hasBotAccess, canUserMutate } from "@/lib/permissions";
import {
  getTelegramMediaAssets,
  deleteTelegramMediaAsset,
} from "@/lib/telegram-media-service";
import { verifyRequestOrigin } from "@/lib/rate-limit";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } | Promise<{ id: string }> }
) {
  try {
    const session = await getAdminSession(req);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const pwdCheck = enforcePasswordChangeStatus(session);
    if (pwdCheck) return pwdCheck;

    const { id: botId } = await Promise.resolve(params);

    const allowed = await hasBotAccess(session, botId);
    if (!allowed) {
      return NextResponse.json(
        { error: "Forbidden: You do not have access to this bot's media assets." },
        { status: 403 }
      );
    }

    const rawAssets = await getTelegramMediaAssets(botId);

    // Format BigInt values for JSON serialization
    const assets = rawAssets.map((asset) => ({
      ...asset,
      fileSizeBytes: asset.fileSizeBytes ? Number(asset.fileSizeBytes) : null,
      senderTelegramId: asset.senderTelegramId ? asset.senderTelegramId.toString() : null,
    }));

    return NextResponse.json({ success: true, assets });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to fetch Telegram media assets";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } | Promise<{ id: string }> }
) {
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

    const { id: botId } = await Promise.resolve(params);

    const allowed = await canUserMutate(session, botId);
    if (!allowed) {
      return NextResponse.json(
        { error: "Forbidden: You do not have permission to delete assets for this bot." },
        { status: 403 }
      );
    }

    const url = new URL(req.url);
    const assetId = url.searchParams.get("assetId");

    if (!assetId) {
      return NextResponse.json(
        { error: "Missing assetId query parameter." },
        { status: 400 }
      );
    }

    await deleteTelegramMediaAsset(assetId, botId);

    return NextResponse.json({ success: true, deletedId: assetId });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to delete Telegram media asset";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
