import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth";
import { getBotChannels, saveBotChannels } from "@/lib/channel-service";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } | Promise<{ id: string }> }
) {
  try {
    const session = await getAdminSession(req);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await Promise.resolve(params);
    const channels = await getBotChannels(id);

    return NextResponse.json({
      success: true,
      channels,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to fetch channels";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } | Promise<{ id: string }> }
) {
  try {
    const session = await getAdminSession(req);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await Promise.resolve(params);
    const body = await req.json();

    if (!body || !Array.isArray(body.channels)) {
      return NextResponse.json(
        { error: "Invalid payload: 'channels' array is required." },
        { status: 400 }
      );
    }

    const updated = await saveBotChannels(id, body.channels, session.id);

    return NextResponse.json({
      success: true,
      channels: updated,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to save channels";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
