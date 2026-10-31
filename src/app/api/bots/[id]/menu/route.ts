import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth";
import { getBotButtons, saveBotButtons } from "@/lib/bot-service";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getAdminSession(req);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = params;
    const buttons = await getBotButtons(id);

    return NextResponse.json({
      success: true,
      buttons,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to fetch bot menu";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getAdminSession(req);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = params;
    const body = await req.json();

    if (!body || !Array.isArray(body.buttons)) {
      return NextResponse.json(
        { error: "Invalid payload: 'buttons' array is required." },
        { status: 400 }
      );
    }

    const updatedButtons = await saveBotButtons(
      id,
      body.buttons,
      session.id
    );

    return NextResponse.json({
      success: true,
      buttons: updatedButtons,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to save bot menu";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
