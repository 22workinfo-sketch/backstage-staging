import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth";
import { getPostById, publishChannelPost } from "@/lib/post-service";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } | Promise<{ id: string }> }
) {
  try {
    const session = await getAdminSession(req);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await Promise.resolve(params);
    const post = await getPostById(id);

    if (!post) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }

    const result = await publishChannelPost(id, post.botId, session.id);

    if (!result.success) {
      return NextResponse.json(
        {
          success: false,
          status: result.status,
          error: result.error,
        },
        { status: result.status === "UNKNOWN" ? 504 : 400 }
      );
    }

    return NextResponse.json({
      success: true,
      status: result.status,
      messageId: result.messageId,
    });
  } catch (error: any) {
    const message = error instanceof Error ? error.message : "Publishing failed";
    const status = message.includes("already in 'SENDING'") || message.includes("already published")
      ? 409
      : 500;

    return NextResponse.json({ error: message }, { status });
  }
}
