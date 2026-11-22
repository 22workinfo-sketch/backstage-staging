import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolveBotToken } from "@/lib/bot-service";

export const dynamic = "force-dynamic";

/**
 * GET /api/messenger/webhook
 * Meta Webhook verification handshake.
 * Meta calls this when configuring the Webhook URL in Meta Developer Dashboard.
 */
export async function GET(req: NextRequest) {
  const searchParams = req.nextUrl.searchParams;
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  const expectedToken = process.env.MESSENGER_VERIFY_TOKEN || "botdesk_messenger_verify_2026";

  if (mode === "subscribe" && token === expectedToken) {
    console.log("[Messenger Webhook] Webhook verified successfully by Meta.");
    return new Response(challenge ?? "", {
      status: 200,
      headers: { "Content-Type": "text/plain" },
    });
  }

  console.warn(
    `[Messenger Webhook] Verification failed. Mode: ${mode}, Token: "${token}", Expected: "${expectedToken}"`
  );
  return new Response("Forbidden: Verification token mismatch", { status: 403 });
}

/**
 * POST /api/messenger/webhook
 * Handles incoming events (messages, attachments, postbacks) from Facebook Messenger.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    if (body.object === "page") {
      for (const entry of body.entry || []) {
        const pageId = String(entry.id);
        for (const messagingItem of entry.messaging || []) {
          // Ignore echo messages sent by the page itself
          if (messagingItem.message?.is_echo) continue;

          await processInboundMessengerMessage(pageId, messagingItem);
        }
      }

      return NextResponse.json({ status: "EVENT_RECEIVED" }, { status: 200 });
    }

    return new Response("Not Found", { status: 404 });
  } catch (err) {
    console.error("[Messenger Webhook Error]", err);
    // Always return 200 to Meta so it does not retry repeatedly on errors
    return NextResponse.json({ status: "EVENT_RECEIVED" }, { status: 200 });
  }
}

interface MessengerMessagingItem {
  sender?: { id: string };
  recipient?: { id: string };
  timestamp?: number;
  message?: {
    mid?: string;
    text?: string;
    attachments?: Array<{
      type: string;
      payload?: {
        url?: string;
        sticker_id?: number;
      };
    }>;
  };
  postback?: {
    title?: string;
    payload?: string;
  };
}

async function processInboundMessengerMessage(pageId: string, item: MessengerMessagingItem) {
  const senderId = item.sender?.id;
  if (!senderId || senderId === pageId) return;

  const timestamp = item.timestamp ? new Date(item.timestamp) : new Date();
  const text = item.message?.text || item.postback?.title || item.postback?.payload || "";
  const attachment = item.message?.attachments?.[0];
  const attachmentUrl = attachment?.payload?.url;
  const attachmentType = attachment?.type || "attachment";

  const messageBody = text || (attachment ? `[${attachmentType}]` : "[Facebook message]");

  // 1. Locate or create a Bot record for this Facebook Page in Botdesk
  let bot = await prisma.bot.findFirst({
    where: {
      OR: [
        { username: `facebook:${pageId}` },
        { description: { contains: `Page ID: ${pageId}` } },
      ],
      isActive: true,
    },
  });

  if (!bot) {
    bot = await prisma.bot.create({
      data: {
        name: `Facebook Page (${pageId})`,
        username: `facebook:${pageId}`,
        description: `Facebook Page ID: ${pageId}`,
        tokenEnvVar: "MESSENGER_PAGE_ACCESS_TOKEN",
        supportInboxEnabled: true,
        isActive: true,
        connectionStatus: "CONNECTED",
      },
    });
    console.log(`[Messenger Webhook] Auto-registered Facebook Page bot for Page ID: ${pageId} (Bot ID: ${bot.id})`);
  }

  // 2. Upsert SupportConversation for this customer (PSID)
  const conversation = await prisma.supportConversation.upsert({
    where: {
      botId_chatId: {
        botId: bot.id,
        chatId: senderId,
      },
    },
    create: {
      botId: bot.id,
      chatId: senderId,
      name: `Facebook User (${senderId.slice(-4)})`,
      username: null,
      resolved: false,
      lastActivityAt: timestamp,
    },
    update: {
      resolved: false,
      lastActivityAt: timestamp,
    },
  });

  // 3. Store incoming message in database
  await prisma.supportMessage.create({
    data: {
      conversationId: conversation.id,
      body: messageBody,
      status: "RECEIVED",
      attachmentId: attachmentUrl || null,
      attachmentName: attachment ? attachmentType.charAt(0).toUpperCase() + attachmentType.slice(1) : null,
      createdAt: timestamp,
    },
  });

  // 4. Optionally fetch customer profile name from Meta Graph API in background
  const pageToken = resolveBotToken(bot) || process.env.MESSENGER_PAGE_ACCESS_TOKEN;
  if (pageToken) {
    fetchCustomerFacebookName(pageToken, senderId, conversation.id).catch(() => {});
  }
}

async function fetchCustomerFacebookName(token: string, psid: string, conversationId: string) {
  try {
    const url = `https://graph.facebook.com/v21.0/${encodeURIComponent(psid)}?fields=first_name,last_name,name&access_token=${encodeURIComponent(token)}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return;

    const profile = await res.json();
    const fullName = profile.name || [profile.first_name, profile.last_name].filter(Boolean).join(" ");
    if (fullName) {
      await prisma.supportConversation.update({
        where: { id: conversationId },
        data: { name: fullName },
      });
    }
  } catch {
    // Non-blocking
  }
}
