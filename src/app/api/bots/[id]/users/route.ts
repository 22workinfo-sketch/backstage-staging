import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth";
import { getBotUsers } from "@/lib/bot-service";

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
    const users = await getBotUsers(id);

    // Convert BigInt telegramId to string for JSON serialization
    const serializedUsers = users.map((user) => ({
      ...user,
      telegramId: user.telegramId.toString(),
    }));

    return NextResponse.json({
      success: true,
      users: serializedUsers,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch users";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
