import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth";
import { updateBotWelcomeMessage } from "@/lib/bot-service";

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
    const { welcomeMessage } = body;

    if (!welcomeMessage || typeof welcomeMessage !== "string" || !welcomeMessage.trim()) {
      return NextResponse.json(
        { error: "Welcome message is required and cannot be empty" },
        { status: 400 }
      );
    }

    const updatedConfig = await updateBotWelcomeMessage({
      botId: id,
      welcomeMessage,
      adminUserId: session.id,
    });

    return NextResponse.json({
      success: true,
      config: updatedConfig,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update configuration";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
