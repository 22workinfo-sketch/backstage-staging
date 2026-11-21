import { NextRequest, NextResponse } from "next/server";
import { getStaffSession, type AdminSession } from "../auth";
import { verifyRequestOrigin } from "../rate-limit";
import { InboxError, inboxBotScope } from "./access";

export async function inboxRequest(req: NextRequest, handle: (user: AdminSession) => Promise<Response>) {
  try {
    if (req.method !== "GET" && !verifyRequestOrigin(req).isValid) throw new InboxError(403, "Origin verification failed.");
    const session = await getStaffSession(req);
    if (!session) throw new InboxError(401, "Sign in to continue.");
    inboxBotScope(session);
    const result = await handle(session);
    result.headers.set("Cache-Control", "private, no-store");
    return result;
  } catch (err) {
    const known = err instanceof InboxError;
    return NextResponse.json({ error: known ? err.message : "The inbox is temporarily unavailable." }, {
      status: known ? err.status : 503, headers: { "Cache-Control": "private, no-store" },
    });
  }
}

export async function readPayload(req: NextRequest) {
  const data = await req.json().catch(() => null);
  if (!data || typeof data !== "object" || Array.isArray(data)) throw new InboxError(400, "Invalid request.");
  return data as Record<string, unknown>;
}
