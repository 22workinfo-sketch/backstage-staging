import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolveBotToken } from "@/lib/bot-service";
import { encryptBotToken } from "@/lib/token-encryption";

export const dynamic = "force-dynamic";

/**
 * GET /api/messenger/subscribe
 * Subscribes all registered Facebook Pages to the Meta App webhook.
 * Meta Graph API: POST /{page-id}/subscribed_apps?subscribed_fields=messages,messaging_postbacks
 */
export async function GET(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get("secret");
  const queryToken = req.nextUrl.searchParams.get("token")?.trim();
  const expectedSecret = process.env.MESSENGER_VERIFY_TOKEN || "botdesk_messenger_verify_2026";

  if (secret !== expectedSecret) {
    return NextResponse.json({ error: "Invalid secret" }, { status: 403 });
  }

  const fbBots = await prisma.bot.findMany({
    where: {
      OR: [
        { username: { startsWith: "facebook:" } },
        { tokenEnvVar: "MESSENGER_PAGE_ACCESS_TOKEN" },
      ],
      isActive: true,
    },
  });

  if (fbBots.length === 0) {
    return NextResponse.json({ message: "No active Facebook page bots found in database" }, { status: 404 });
  }

  const results: Array<{ botId: string; pageName: string; ok: boolean; response: unknown }> = [];

  for (const bot of fbBots) {
    // If token passed in query parameter, use it and re-encrypt directly on Hostinger
    let token = queryToken || resolveBotToken(bot) || process.env.MESSENGER_PAGE_ACCESS_TOKEN;

    if (queryToken) {
      try {
        const freshlyEncrypted = encryptBotToken(queryToken);
        await prisma.bot.update({
          where: { id: bot.id },
          data: { encryptedToken: freshlyEncrypted },
        });
        token = queryToken;
      } catch (encErr) {
        console.warn("[Subscribe] Could not re-encrypt token on host:", encErr);
      }
    }

    if (!token) {
      results.push({
        botId: bot.id,
        pageName: bot.name,
        ok: false,
        response: "Missing or unable to decrypt token. Please provide ?token=<PAGE_ACCESS_TOKEN>",
      });
      continue;
    }

    try {
      // Subscribe page to app webhooks
      const url = `https://graph.facebook.com/v21.0/me/subscribed_apps?subscribed_fields=messages,messaging_postbacks&access_token=${encodeURIComponent(token)}`;
      const res = await fetch(url, { method: "POST" });
      const data = await res.json();
      results.push({ botId: bot.id, pageName: bot.name, ok: res.ok, response: data });
    } catch (err) {
      results.push({
        botId: bot.id,
        pageName: bot.name,
        ok: false,
        response: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return NextResponse.json({ results });
}
