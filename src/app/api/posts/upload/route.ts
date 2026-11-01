import { NextRequest, NextResponse } from "next/server";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import { getAdminSession } from "@/lib/auth";
import { validateImageUpload, UPLOADS_POSTS_DIR } from "@/lib/post-service";

export async function POST(req: NextRequest) {
  try {
    const session = await getAdminSession(req);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const formData = await req.formData();
    const file = formData.get("file");

    if (!file || !(file instanceof Blob)) {
      return NextResponse.json(
        { error: "No image file provided in upload request." },
        { status: 400 }
      );
    }

    const mimeType = file.type || "application/octet-stream";
    const sizeBytes = file.size;
    const originalName = (file as any).name || "image.png";

    // Validate type and size constraints
    validateImageUpload(mimeType, sizeBytes);

    // Ensure uploads directory exists
    if (!fs.existsSync(UPLOADS_POSTS_DIR)) {
      fs.mkdirSync(UPLOADS_POSTS_DIR, { recursive: true });
    }

    // Determine extension safely
    let ext = ".jpg";
    if (mimeType === "image/png") ext = ".png";
    else if (mimeType === "image/webp") ext = ".webp";
    else if (mimeType === "image/jpeg") ext = ".jpg";

    const safeFilename = `${crypto.randomUUID()}${ext}`;
    const targetFilePath = path.join(UPLOADS_POSTS_DIR, safeFilename);

    // Convert file blob to buffer and write to disk
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    fs.writeFileSync(targetFilePath, buffer);

    return NextResponse.json({
      success: true,
      filename: safeFilename,
      originalName,
      mimeType,
      sizeBytes,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Image upload failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
