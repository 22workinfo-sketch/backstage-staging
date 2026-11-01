import { NextRequest, NextResponse } from "next/server";
import path from "path";
import fs from "fs";
import { getAdminSession } from "@/lib/auth";
import { UPLOADS_POSTS_DIR } from "@/lib/post-service";

export async function GET(
  req: NextRequest,
  { params }: { params: { filename: string } | Promise<{ filename: string }> }
) {
  try {
    const session = await getAdminSession(req);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { filename } = await Promise.resolve(params);

    // Sanitize filename against directory traversal
    if (
      !filename ||
      filename.includes("..") ||
      filename.includes("/") ||
      filename.includes("\\") ||
      !/^[a-zA-Z0-9_-]+\.(jpg|jpeg|png|webp)$/i.test(filename)
    ) {
      return NextResponse.json({ error: "Invalid filename" }, { status: 400 });
    }

    const fullPath = path.join(UPLOADS_POSTS_DIR, filename);

    if (!fs.existsSync(fullPath)) {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }

    const ext = path.extname(filename).toLowerCase();
    let contentType = "image/jpeg";
    if (ext === ".png") contentType = "image/png";
    if (ext === ".webp") contentType = "image/webp";

    const fileBuffer = fs.readFileSync(fullPath);

    return new NextResponse(fileBuffer, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load media file";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
