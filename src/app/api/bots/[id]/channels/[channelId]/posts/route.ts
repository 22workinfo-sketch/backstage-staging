import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth";
import {
  getChannelPosts,
  createDraftPost,
  CreatePostInput,
} from "@/lib/post-service";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string; channelId: string } | Promise<{ id: string; channelId: string }> }
) {
  try {
    const session = await getAdminSession(req);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id: botId, channelId } = await Promise.resolve(params);
    const posts = await getChannelPosts(botId, channelId);

    return NextResponse.json({ success: true, posts });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to fetch posts";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string; channelId: string } | Promise<{ id: string; channelId: string }> }
) {
  try {
    const session = await getAdminSession(req);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id: botId, channelId } = await Promise.resolve(params);
    const body = await req.json();

    const input: CreatePostInput = {
      botId,
      channelId,
      postType: body.postType === "IMAGE" ? "IMAGE" : "TEXT",
      content: body.content || "",
      mediaPath: body.mediaPath,
      mediaOriginalName: body.mediaOriginalName,
      mediaMimeType: body.mediaMimeType,
      mediaSizeBytes: body.mediaSizeBytes,
      buttons: body.buttons || [],
    };

    const post = await createDraftPost(input, session.id);

    return NextResponse.json({ success: true, post }, { status: 201 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to create draft post";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
