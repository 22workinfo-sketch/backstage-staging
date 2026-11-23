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
      // 1. Inspect what the token is (User Token or Page Token)
      const debugRes = await fetch(`https://graph.facebook.com/v21.0/me?access_token=${encodeURIComponent(token)}`);
      const meData = await debugRes.json();

      let actualPageToken = token;
      let targetPageId = bot.username.replace(/^facebook:/, "");

      // If this is a User Token, fetch the Page Token from /me/accounts
      if (meData?.id && meData.id !== targetPageId) {
        const accountsRes = await fetch(`https://graph.facebook.com/v21.0/me/accounts?access_token=${encodeURIComponent(token)}`);
        const accountsData = await accountsRes.json();
        const matchedPage = accountsData?.data?.find((p: any) => p.id === targetPageId) || accountsData?.data?.[0];
        if (matchedPage?.access_token) {
          actualPageToken = matchedPage.access_token;
          targetPageId = matchedPage.id;
          console.log(`[Subscribe] Extracted Page Token for page: ${matchedPage.name} (${targetPageId})`);
        }
      }

      // 2. Encrypt and save the verified actual page token
      const freshlyEncrypted = encryptBotToken(actualPageToken);
      await prisma.bot.update({
        where: { id: bot.id },
        data: {
          encryptedToken: freshlyEncrypted,
          description: `Facebook Page ID: ${targetPageId}`,
        },
      });

      // 3. Subscribe page to app webhooks
      const subUrl = `https://graph.facebook.com/v21.0/${encodeURIComponent(targetPageId)}/subscribed_apps?subscribed_fields=messages,messaging_postbacks&access_token=${encodeURIComponent(actualPageToken)}`;
      const subRes = await fetch(subUrl, { method: "POST" });
      const subData = await subRes.json();

      results.push({
        botId: bot.id,
        pageName: bot.name,
        ok: subRes.ok,
        targetPageId,
        me: meData,
        response: subData,
      });
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
