import path from "path";
import fs from "fs";
import { Api, InlineKeyboard, InputFile } from "grammy";
import { prisma } from "./prisma";

export interface InlineUrlButton {
  label: string;
  url: string;
  order: number;
}

export interface CreatePostInput {
  botId: string;
  channelId: string;
  postType: "TEXT" | "IMAGE";
  content: string;
  mediaPath?: string | null;
  mediaOriginalName?: string | null;
  mediaMimeType?: string | null;
  mediaSizeBytes?: number | null;
  buttons?: InlineUrlButton[];
}

export interface UpdatePostInput {
  id: string;
  botId: string;
  channelId: string;
  postType: "TEXT" | "IMAGE";
  content: string;
  mediaPath?: string | null;
  mediaOriginalName?: string | null;
  mediaMimeType?: string | null;
  mediaSizeBytes?: number | null;
  buttons?: InlineUrlButton[];
}

export interface ChannelPermissionResult {
  status: "CAN_POST" | "CANNOT_POST" | "NOT_ADMIN" | "UNKNOWN";
  message: string;
  canPost: boolean;
  chatTitle?: string;
  chatUsername?: string;
}

export interface PublishResult {
  success: boolean;
  status: "PUBLISHED" | "FAILED" | "UNKNOWN";
  messageId?: number;
  error?: string;
}

export const UPLOADS_POSTS_DIR = path.join(process.cwd(), "uploads", "posts");

/**
 * Validates post content according to Telegram Bot API limits.
 */
export function validatePostContent(
  postType: "TEXT" | "IMAGE",
  content: string
): string {
  const trimmed = (content || "").trim();

  if (postType === "TEXT") {
    if (!trimmed) {
      throw new Error("Post text content is required for text-only messages.");
    }
    if (trimmed.length > 4096) {
      throw new Error(
        `Post text length (${trimmed.length} chars) exceeds Telegram limit of 4096 characters.`
      );
    }
  } else if (postType === "IMAGE") {
    if (trimmed.length > 1024) {
      throw new Error(
        `Image caption length (${trimmed.length} chars) exceeds Telegram limit of 1024 characters.`
      );
    }
  } else {
    throw new Error(`Unsupported post type: ${postType}`);
  }

  return trimmed;
}

/**
 * Validates inline URL buttons. Rejects non-HTTPS or unsafe links.
 */
export function validateInlineUrlButtons(
  buttons?: InlineUrlButton[]
): InlineUrlButton[] {
  if (!buttons || !Array.isArray(buttons)) {
    return [];
  }

  if (buttons.length > 10) {
    throw new Error("A post can have a maximum of 10 inline buttons.");
  }

  const validated: InlineUrlButton[] = [];

  for (let i = 0; i < buttons.length; i++) {
    const btn = buttons[i];
    const label = (btn.label || "").trim();
    if (!label) {
      throw new Error(`Button #${i + 1} must have a non-empty label.`);
    }
    if (label.length > 64) {
      throw new Error(
        `Button label "${label}" exceeds the maximum length of 64 characters.`
      );
    }

    const rawUrl = (btn.url || "").trim();
    if (!rawUrl) {
      throw new Error(`Button "${label}" must have a valid destination URL.`);
    }

    const lower = rawUrl.toLowerCase();
    const isAllowedScheme =
      lower.startsWith("https://") ||
      lower.startsWith("http://127.0.0.1") ||
      lower.startsWith("http://localhost") ||
      lower.startsWith("tg://");

    if (!isAllowedScheme) {
      throw new Error(
        `Button "${label}" destination URL must be a secure HTTPS link or Telegram link (tg://). Unsafe schemes are rejected.`
      );
    }

    try {
      if (!lower.startsWith("tg://")) {
        new URL(rawUrl);
      }
    } catch {
      throw new Error(`Button "${label}" has an invalid URL format.`);
    }

    validated.push({
      label,
      url: rawUrl,
      order: typeof btn.order === "number" ? btn.order : i,
    });
  }

  return validated.sort((a, b) => a.order - b.order);
}

/**
 * Validates local image file upload constraints.
 */
export function validateImageUpload(
  mimeType: string,
  sizeBytes: number
): void {
  const allowedMimes = ["image/jpeg", "image/png", "image/webp"];
  if (!allowedMimes.includes(mimeType.toLowerCase())) {
    throw new Error(
      `Unsupported image type "${mimeType}". Allowed formats: JPEG, PNG, WebP.`
    );
  }

  const maxBytes = 5 * 1024 * 1024; // 5 MB
  if (sizeBytes > maxBytes) {
    throw new Error(
      `Image size (${(sizeBytes / (1024 * 1024)).toFixed(2)} MB) exceeds the local MVP limit of 5 MB.`
    );
  }
}

/**
 * Resolves a bot's Telegram secret token from environment variables.
 * Never logs or returns the token to external callers.
 */
export async function resolveBotToken(botId: string): Promise<{
  token: string;
  bot: { id: string; name: string; username: string; tokenEnvVar: string };
}> {
  const bot = await prisma.bot.findUnique({
    where: { id: botId },
    select: { id: true, name: true, username: true, tokenEnvVar: true },
  });

  if (!bot) {
    throw new Error(`Bot with ID "${botId}" was not found.`);
  }

  const envVar = bot.tokenEnvVar || "TELEGRAM_BOT_TOKEN";
  const token = process.env[envVar];

  if (
    !token ||
    token.trim() === "" ||
    token.includes("placeholder") ||
    token.includes("your_test_bot_token")
  ) {
    throw new Error(
      `Bot token is not configured in environment variable "${envVar}". Configure a live BotFather token in .env.`
    );
  }

  return { token: token.trim(), bot };
}

/**
 * Checks whether the bot has "Post Messages" permission in a target channel.
 * If permission cannot be verified, returns "UNKNOWN" without fabricating health.
 */
export async function checkBotChannelPermissions(
  botId: string,
  channelId: string,
  customApi?: any
): Promise<ChannelPermissionResult> {
  const channel = await prisma.botChannel.findUnique({
    where: { id: channelId },
  });

  if (!channel || channel.botId !== botId) {
    return {
      status: "UNKNOWN",
      message: "Channel does not belong to the selected bot.",
      canPost: false,
    };
  }

  let api: any = customApi;
  if (!api) {
    try {
      const { token } = await resolveBotToken(botId);
      api = new Api(token);
    } catch (tokenErr: any) {
      return {
        status: "UNKNOWN",
        message: `Bot token unverified: ${tokenErr.message}`,
        canPost: false,
      };
    }
  }

  try {
    const targetChatId = channel.telegramChatId;
    const chat = await api.getChat(targetChatId);
    const botInfo = await api.getMe();
    const member = await api.getChatMember(targetChatId, botInfo.id);

    if (member.status === "creator") {
      return {
        status: "CAN_POST",
        message: "Bot is the channel Creator (Full administrator permissions).",
        canPost: true,
        chatTitle: chat.title,
        chatUsername: chat.username,
      };
    }

    if (member.status === "administrator") {
      // In channels, can_post_messages determines publishing rights
      if (member.can_post_messages !== false) {
        return {
          status: "CAN_POST",
          message: "Bot is an Administrator with 'Post Messages' permission enabled.",
          canPost: true,
          chatTitle: chat.title,
          chatUsername: chat.username,
        };
      } else {
        return {
          status: "CANNOT_POST",
          message: "Bot is an Administrator but 'Post Messages' permission is Disabled.",
          canPost: false,
          chatTitle: chat.title,
          chatUsername: chat.username,
        };
      }
    }

    return {
      status: "NOT_ADMIN",
      message: `Bot member status is "${member.status}". Bot must be an Administrator to publish.`,
      canPost: false,
      chatTitle: chat.title,
      chatUsername: chat.username,
    };
  } catch (err: any) {
    const rawError = String(err?.message || err || "").toLowerCase();

    if (
      rawError.includes("chat not found") ||
      rawError.includes("bot is not a member") ||
      rawError.includes("forbidden")
    ) {
      return {
        status: "NOT_ADMIN",
        message:
          "Bot is not in the channel or channel was not found. Add your bot as an Administrator in Telegram.",
        canPost: false,
      };
    }

    // Network timeout, rate limit, or unexpected error -> honest UNKNOWN
    return {
      status: "UNKNOWN",
      message: "Unable to verify Telegram permissions at this moment (Status: Unknown).",
      canPost: false,
    };
  }
}

/**
 * Retrieves channel posts scoped to bot and optionally channel.
 */
export async function getChannelPosts(botId: string, channelId?: string) {
  return prisma.channelPost.findMany({
    where: {
      botId,
      ...(channelId ? { channelId } : {}),
    },
    orderBy: { createdAt: "desc" },
    include: {
      channel: {
        select: {
          id: true,
          name: true,
          telegramChatId: true,
        },
      },
    },
  });
}

/**
 * Retrieves a single post by ID scoped to botId.
 */
export async function getPostById(postId: string, botId?: string) {
  return prisma.channelPost.findFirst({
    where: {
      id: postId,
      ...(botId ? { botId } : {}),
    },
    include: {
      channel: {
        select: {
          id: true,
          name: true,
          telegramChatId: true,
        },
      },
    },
  });
}

/**
 * Creates and saves a new draft post in PostgreSQL.
 */
export async function createDraftPost(
  input: CreatePostInput,
  adminUserId?: string
) {
  // 1. Verify channel belongs to bot
  const channel = await prisma.botChannel.findUnique({
    where: { id: input.channelId },
  });

  if (!channel || channel.botId !== input.botId) {
    throw new Error(
      `Channel with ID "${input.channelId}" does not belong to bot "${input.botId}".`
    );
  }

  // 2. Validate content & buttons
  const validatedContent = validatePostContent(input.postType, input.content);
  const validatedButtons = validateInlineUrlButtons(input.buttons);

  // 3. Verify media file exists if image post
  if (input.postType === "IMAGE") {
    if (!input.mediaPath) {
      throw new Error("Image post requires an uploaded media file.");
    }
    const fullPath = path.isAbsolute(input.mediaPath)
      ? input.mediaPath
      : path.join(UPLOADS_POSTS_DIR, input.mediaPath);

    if (!fs.existsSync(fullPath)) {
      throw new Error("Uploaded image file was not found on local storage.");
    }
  }

  // 4. Save draft in PostgreSQL
  const post = await prisma.channelPost.create({
    data: {
      botId: input.botId,
      channelId: input.channelId,
      postType: input.postType,
      content: validatedContent,
      mediaPath: input.mediaPath || null,
      mediaOriginalName: input.mediaOriginalName || null,
      mediaMimeType: input.mediaMimeType || null,
      mediaSizeBytes: input.mediaSizeBytes || null,
      buttonsConfig: validatedButtons.length > 0 ? (validatedButtons as any) : null,
      status: "DRAFT",
    },
    include: {
      channel: {
        select: { id: true, name: true, telegramChatId: true },
      },
    },
  });

  // 5. Audit log
  let validAdminUserId: string | null = null;
  if (adminUserId) {
    const adminExists = await prisma.adminUser.findUnique({
      where: { id: adminUserId },
      select: { id: true },
    });
    if (adminExists) validAdminUserId = adminExists.id;
  }

  await prisma.auditLog.create({
    data: {
      botId: input.botId,
      adminUserId: validAdminUserId,
      action: "CREATE_CHANNEL_POST_DRAFT",
      details: {
        postId: post.id,
        channelId: post.channelId,
        postType: post.postType,
        buttonCount: validatedButtons.length,
      },
    },
  });

  return post;
}

/**
 * Updates an existing draft or failed post in PostgreSQL.
 */
export async function updateDraftPost(
  input: UpdatePostInput,
  adminUserId?: string
) {
  const existing = await prisma.channelPost.findUnique({
    where: { id: input.id },
  });

  if (!existing || existing.botId !== input.botId) {
    throw new Error(`Post with ID "${input.id}" was not found.`);
  }

  if (existing.status === "SENDING" || existing.status === "PUBLISHED") {
    throw new Error(
      `Cannot edit a post with status "${existing.status}". Only DRAFT, FAILED, or UNKNOWN posts can be modified.`
    );
  }

  const channel = await prisma.botChannel.findUnique({
    where: { id: input.channelId },
  });

  if (!channel || channel.botId !== input.botId) {
    throw new Error(
      `Channel with ID "${input.channelId}" does not belong to bot "${input.botId}".`
    );
  }

  const validatedContent = validatePostContent(input.postType, input.content);
  const validatedButtons = validateInlineUrlButtons(input.buttons);

  if (input.postType === "IMAGE") {
    const mediaPath = input.mediaPath || existing.mediaPath;
    if (!mediaPath) {
      throw new Error("Image post requires an uploaded media file.");
    }
  }

  const updated = await prisma.channelPost.update({
    where: { id: input.id },
    data: {
      channelId: input.channelId,
      postType: input.postType,
      content: validatedContent,
      mediaPath: input.mediaPath !== undefined ? input.mediaPath : existing.mediaPath,
      mediaOriginalName:
        input.mediaOriginalName !== undefined
          ? input.mediaOriginalName
          : existing.mediaOriginalName,
      mediaMimeType:
        input.mediaMimeType !== undefined
          ? input.mediaMimeType
          : existing.mediaMimeType,
      mediaSizeBytes:
        input.mediaSizeBytes !== undefined
          ? input.mediaSizeBytes
          : existing.mediaSizeBytes,
      buttonsConfig: validatedButtons.length > 0 ? (validatedButtons as any) : null,
      status: "DRAFT", // Reset to draft on edit
      lastError: null,
    },
    include: {
      channel: {
        select: { id: true, name: true, telegramChatId: true },
      },
    },
  });

  return updated;
}

/**
 * Deletes a post and cleans up any local uploaded image file.
 */
export async function deletePost(
  postId: string,
  botId: string,
  _adminUserId?: string
) {
  const post = await prisma.channelPost.findUnique({
    where: { id: postId },
  });

  if (!post || post.botId !== botId) {
    throw new Error(`Post with ID "${postId}" was not found.`);
  }

  if (post.status === "SENDING") {
    throw new Error("Cannot delete a post that is currently publishing.");
  }

  // Clean up local media file
  if (post.mediaPath) {
    const fullPath = path.isAbsolute(post.mediaPath)
      ? post.mediaPath
      : path.join(UPLOADS_POSTS_DIR, post.mediaPath);

    if (fs.existsSync(fullPath)) {
      try {
        fs.unlinkSync(fullPath);
      } catch {
        // Ignore deletion error
      }
    }
  }

  await prisma.channelPost.delete({
    where: { id: postId },
  });

  return { success: true };
}

/**
 * Publishes a channel post to Telegram.
 * Enforces atomic state claiming to prevent concurrent/double-click duplicate sending.
 * Never auto-retries an UNKNOWN result.
 */
export async function publishChannelPost(
  postId: string,
  botId: string,
  adminUserId?: string,
  customApi?: any
): Promise<PublishResult> {
  // 1. Concurrency Guard: Atomically claim the post for publishing
  const claimResult = await prisma.channelPost.updateMany({
    where: {
      id: postId,
      botId,
      status: { in: ["DRAFT", "FAILED", "UNKNOWN"] },
    },
    data: {
      status: "SENDING",
      updatedAt: new Date(),
    },
  });

  if (claimResult.count === 0) {
    throw new Error(
      "Post cannot be published: it is already in 'SENDING' status, already 'PUBLISHED', or does not exist."
    );
  }

  // 2. Fetch the claimed post with channel details
  const post = await prisma.channelPost.findUnique({
    where: { id: postId },
    include: {
      channel: true,
      bot: true,
    },
  });

  if (!post || !post.channel) {
    await prisma.channelPost.update({
      where: { id: postId },
      data: { status: "FAILED", lastError: "Target channel no longer exists." },
    });
    return { success: false, status: "FAILED", error: "Target channel missing." };
  }

  // 3. Resolve Telegram API instance
  let api: any = customApi;
  if (!api) {
    try {
      const { token } = await resolveBotToken(botId);
      api = new Api(token);
    } catch (tokenErr: any) {
      await prisma.channelPost.update({
        where: { id: postId },
        data: {
          status: "FAILED",
          lastError: `Bot token error: ${tokenErr.message}`,
        },
      });
      return {
        success: false,
        status: "FAILED",
        error: tokenErr.message,
      };
    }
  }

  // 4. Build inline keyboard
  let replyMarkup: InlineKeyboard | undefined = undefined;
  if (post.buttonsConfig && Array.isArray(post.buttonsConfig)) {
    const rawButtons = post.buttonsConfig as any[];
    if (rawButtons.length > 0) {
      replyMarkup = new InlineKeyboard();
      for (const b of rawButtons) {
        if (b.label && b.url) {
          replyMarkup.url(b.label, b.url).row();
        }
      }
    }
  }

  const targetChatId = post.channel.telegramChatId;
  let sentMessageId: number | undefined;

  // 5. Send message via Telegram Bot API
  try {
    if (post.postType === "TEXT") {
      const res = await api.sendMessage(targetChatId, post.content, {
        reply_markup: replyMarkup,
      });
      sentMessageId = res.message_id;
    } else if (post.postType === "IMAGE") {
      if (!post.mediaPath) {
        throw new Error("Missing local media file path for image post.");
      }
      const fullPath = path.isAbsolute(post.mediaPath)
        ? post.mediaPath
        : path.join(UPLOADS_POSTS_DIR, post.mediaPath);

      if (!fs.existsSync(fullPath)) {
        throw new Error("Uploaded media file was not found on local disk.");
      }

      const res = await api.sendPhoto(
        targetChatId,
        new InputFile(fullPath),
        {
          caption: post.content || undefined,
          reply_markup: replyMarkup,
        }
      );
      sentMessageId = res.message_id;
    } else {
      throw new Error(`Unsupported post type: ${post.postType}`);
    }

    // 6. Confirmed Success -> Update to PUBLISHED
    await prisma.channelPost.update({
      where: { id: postId },
      data: {
        status: "PUBLISHED",
        telegramMessageId: sentMessageId,
        sentAt: new Date(),
        lastError: null,
      },
    });

    // 7. Audit log (Never log private tokens or invite links)
    let validAdminUserId: string | null = null;
    if (adminUserId) {
      const adminExists = await prisma.adminUser.findUnique({
        where: { id: adminUserId },
        select: { id: true },
      });
      if (adminExists) validAdminUserId = adminExists.id;
    }

    await prisma.auditLog.create({
      data: {
        botId,
        adminUserId: validAdminUserId,
        action: "PUBLISH_CHANNEL_POST",
        details: {
          postId,
          channelId: post.channelId,
          telegramChatId: targetChatId,
          messageId: sentMessageId,
          postType: post.postType,
        },
      },
    });

    return {
      success: true,
      status: "PUBLISHED",
      messageId: sentMessageId,
    };
  } catch (err: any) {
    const errorStr = String(err?.message || err || "Unknown Telegram publishing error");
    const lower = errorStr.toLowerCase();

    // Distinguish between definitive Telegram rejections vs Network/Timeout errors
    const isTimeoutOrNetworkError =
      lower.includes("timeout") ||
      lower.includes("etimedout") ||
      lower.includes("econnreset") ||
      lower.includes("socket hang up") ||
      lower.includes("network error");

    if (isTimeoutOrNetworkError) {
      // Possible delivery: mark UNKNOWN and DO NOT auto-retry!
      const unknownMsg =
        "Network connection timed out while waiting for Telegram response. The post may have been received by Telegram. Please check the channel manually before retrying.";

      await prisma.channelPost.update({
        where: { id: postId },
        data: {
          status: "UNKNOWN",
          lastError: unknownMsg,
        },
      });

      return {
        success: false,
        status: "UNKNOWN",
        error: unknownMsg,
      };
    }

    // Definitive API failure (e.g. 400 Bad Request, 403 Forbidden)
    const sanitizedError = errorStr.replace(
      /\d+:[A-Za-z0-9_-]{35}/g,
      "[REDACTED_BOT_TOKEN]"
    );

    await prisma.channelPost.update({
      where: { id: postId },
      data: {
        status: "FAILED",
        lastError: sanitizedError,
      },
    });

    return {
      success: false,
      status: "FAILED",
      error: sanitizedError,
    };
  }
}
