import { prisma } from "./prisma";

export interface TelegramProfileInput {
  botId: string;
  telegramId: bigint | number | string;
  firstName?: string | null;
  lastName?: string | null;
  username?: string | null;
  languageCode?: string | null;
}

export interface TelegramContactInput {
  botId: string;
  senderTelegramId: bigint | number | string;
  contactUserId?: bigint | number | string | null;
  phoneNumber: string;
}

export interface UpdateWelcomeMessageInput {
  botId: string;
  welcomeMessage: string;
  adminUserId?: string;
}

/**
 * Handles Telegram /start command:
 * 1. Validates bot existence.
 * 2. Upserts user profile in PostgreSQL.
 * 3. Retrieves dynamic welcome message and menu configuration.
 */
export async function handleTelegramStart(input: TelegramProfileInput) {
  const telegramIdBigInt = BigInt(input.telegramId);

  // Verify bot existence (enforce bot validation)
  const bot = await prisma.bot.findUnique({
    where: { id: input.botId },
    include: { config: true },
  });

  if (!bot || !bot.isActive) {
    throw new Error(`Bot with ID ${input.botId} not found or inactive`);
  }

  // Upsert user profile (bot-isolated: composite unique [botId, telegramId])
  const user = await prisma.telegramUser.upsert({
    where: {
      botId_telegramId: {
        botId: input.botId,
        telegramId: telegramIdBigInt,
      },
    },
    create: {
      botId: input.botId,
      telegramId: telegramIdBigInt,
      firstName: input.firstName ?? null,
      lastName: input.lastName ?? null,
      username: input.username ?? null,
      languageCode: input.languageCode ?? null,
      firstSeenAt: new Date(),
      lastSeenAt: new Date(),
    },
    update: {
      firstName: input.firstName ?? null,
      lastName: input.lastName ?? null,
      username: input.username ?? null,
      languageCode: input.languageCode ?? null,
      lastSeenAt: new Date(),
    },
  });

  // Fetch active buttons for the bot from PostgreSQL
  const activeButtons = await prisma.botButton.findMany({
    where: { botId: input.botId, isEnabled: true },
    orderBy: { order: "asc" },
  });

  const welcomeMessage =
    bot.config?.welcomeMessage ||
    "Welcome! I am your test Telegram bot. Tap the button below to get started.";

  // If active buttons exist in DB, use them; otherwise fallback to standard default buttons
  const buttonsToReturn =
    activeButtons.length > 0
      ? activeButtons
      : [
          {
            id: "default-1",
            botId: input.botId,
            label: "📱 Share Phone Number",
            actionType: "REQUEST_CONTACT",
            replyText: null,
            autoDeleteReply: false,
            deleteAfterSeconds: 30,
            isEnabled: true,
            order: 0,
          },
          {
            id: "default-2",
            botId: input.botId,
            label: "ℹ️ Help / Info",
            actionType: "SEND_TEXT",
            replyText:
              "ℹ️ Backstage Test Bot Help:\n\n• Send /start to reload your profile and see the welcome message.\n• Tap 'Share Phone Number' to store your contact number in PostgreSQL.\n• The welcome message and menu buttons can be updated live from your local Admin Web Panel!",
            autoDeleteReply: false,
            deleteAfterSeconds: 30,
            isEnabled: true,
            order: 1,
          },
        ];

  return {
    bot,
    user,
    welcomeMessage,
    buttons: buttonsToReturn,
    menuConfig: { buttons: buttonsToReturn },
  };
}

export type ContactValidationResult =
  | { success: true; user: any }
  | {
      success: false;
      reason: "MISSING_CONTACT_USER_ID" | "OWNERSHIP_MISMATCH" | "USER_NOT_FOUND";
    };

/**
 * Handles user sharing their contact / phone number:
 * Validates that contact.user_id matches the sender's Telegram ID.
 * Rejects forwarded or foreign contacts without overwriting existing data.
 * Phone numbers are NEVER written to logs.
 */
export async function handleTelegramContact(
  input: TelegramContactInput
): Promise<ContactValidationResult> {
  const senderIdBigInt = BigInt(input.senderTelegramId);

  // 1. Verify contact.user_id is present
  if (input.contactUserId === undefined || input.contactUserId === null) {
    return { success: false, reason: "MISSING_CONTACT_USER_ID" };
  }

  // 2. Verify contact.user_id exactly matches the sender's Telegram ID
  const contactUserIdBigInt = BigInt(input.contactUserId);
  if (contactUserIdBigInt !== senderIdBigInt) {
    return { success: false, reason: "OWNERSHIP_MISMATCH" };
  }

  // 3. Verify user exists in database for this bot
  const existingUser = await prisma.telegramUser.findUnique({
    where: {
      botId_telegramId: {
        botId: input.botId,
        telegramId: senderIdBigInt,
      },
    },
  });

  if (!existingUser) {
    return { success: false, reason: "USER_NOT_FOUND" };
  }

  // 4. Update the user with verified phone number (never logged)
  const updatedUser = await prisma.telegramUser.update({
    where: {
      botId_telegramId: {
        botId: input.botId,
        telegramId: senderIdBigInt,
      },
    },
    data: {
      telegramPhNo: input.phoneNumber,
      lastSeenAt: new Date(),
    },
  });

  return { success: true, user: updatedUser };
}

/**
 * Retrieves bot details and configuration by botId.
 */
export async function getBotWithConfig(botId: string) {
  return prisma.bot.findUnique({
    where: { id: botId },
    include: {
      config: true,
      _count: {
        select: { users: true },
      },
    },
  });
}

/**
 * Retrieves all registered bots for the backstage dashboard.
 */
export async function getAllBots() {
  return prisma.bot.findMany({
    orderBy: { createdAt: "asc" },
    include: {
      config: true,
      _count: {
        select: { users: true },
      },
    },
  });
}

/**
 * Retrieves users strictly isolated by botId.
 * No data leakage between different bots.
 */
export async function getBotUsers(botId: string) {
  return prisma.telegramUser.findMany({
    where: { botId },
    orderBy: { lastSeenAt: "desc" },
  });
}

/**
 * Updates welcome message for a bot and writes an audit log entry.
 */
export async function updateBotWelcomeMessage(input: UpdateWelcomeMessageInput) {
  const trimmedMessage = input.welcomeMessage.trim();
  if (!trimmedMessage) {
    throw new Error("Welcome message cannot be empty");
  }

  // Fetch current config for audit trail
  const currentConfig = await prisma.botConfig.findUnique({
    where: { botId: input.botId },
  });

  const previousMessage = currentConfig?.welcomeMessage ?? "";

  // Upsert the bot configuration
  const updatedConfig = await prisma.botConfig.upsert({
    where: { botId: input.botId },
    create: {
      botId: input.botId,
      welcomeMessage: trimmedMessage,
    },
    update: {
      welcomeMessage: trimmedMessage,
    },
  });

  // Create audit log record
  await prisma.auditLog.create({
    data: {
      botId: input.botId,
      adminUserId: input.adminUserId ?? null,
      action: "UPDATE_WELCOME_MESSAGE",
      details: {
        previous: previousMessage,
        updated: trimmedMessage,
      },
    },
  });

  return updatedConfig;
}

export interface ButtonInput {
  id?: string;
  label: string;
  actionType: "SEND_TEXT" | "REQUEST_CONTACT" | "JOIN_CHANNELS" | string;
  replyText?: string | null;
  autoDeleteReply?: boolean;
  deleteAfterSeconds?: number;
  isEnabled: boolean;
  order: number;
}

/**
 * Retrieves configured reply keyboard buttons for a bot.
 */
export async function getBotButtons(botId: string, onlyEnabled: boolean = false) {
  return prisma.botButton.findMany({
    where: {
      botId,
      ...(onlyEnabled ? { isEnabled: true } : {}),
    },
    orderBy: { order: "asc" },
  });
}

/**
 * Validates and saves the bot reply keyboard buttons.
 * Enforces bot_id scoping, length restrictions, duplicate label checks, and max button limits.
 */
export async function saveBotButtons(
  botId: string,
  buttons: ButtonInput[],
  adminUserId?: string
) {
  // 1. Max button count validation (keep UI and keyboard manageable)
  if (buttons.length > 12) {
    throw new Error("A bot menu can have a maximum of 12 buttons.");
  }

  // 2. Validate individual buttons and uniqueness of labels
  const seenLabels = new Set<string>();

  for (let i = 0; i < buttons.length; i++) {
    const btn = buttons[i];
    const trimmedLabel = btn.label ? btn.label.trim() : "";

    if (!trimmedLabel) {
      throw new Error(`Button #${i + 1} must have a non-empty label.`);
    }

    if (trimmedLabel.length > 64) {
      throw new Error(
        `Button label "${trimmedLabel}" exceeds the maximum length of 64 characters.`
      );
    }

    const normalizedLabel = trimmedLabel.toLowerCase();
    if (seenLabels.has(normalizedLabel)) {
      throw new Error(
        `Duplicate button label detected: "${trimmedLabel}". Each button label must be unique within the bot.`
      );
    }
    seenLabels.add(normalizedLabel);

    if (
      btn.actionType !== "SEND_TEXT" &&
      btn.actionType !== "REQUEST_CONTACT" &&
      btn.actionType !== "JOIN_CHANNELS"
    ) {
      throw new Error(
        `Button "${trimmedLabel}" has an unsupported action type: ${btn.actionType}. Only SEND_TEXT, REQUEST_CONTACT, and JOIN_CHANNELS are supported.`
      );
    }

    if (btn.actionType === "SEND_TEXT") {
      const trimmedReply = btn.replyText ? btn.replyText.trim() : "";
      if (!trimmedReply) {
        throw new Error(
          `Button "${trimmedLabel}" requires a reply text for the SEND_TEXT action.`
        );
      }
      if (trimmedReply.length > 2000) {
        throw new Error(
          `Reply text for "${trimmedLabel}" exceeds maximum length of 2000 characters.`
        );
      }
      if (btn.autoDeleteReply) {
        const delay =
          btn.deleteAfterSeconds !== undefined
            ? Math.floor(btn.deleteAfterSeconds)
            : 30;
        if (isNaN(delay) || delay < 5 || delay > 86400) {
          throw new Error(
            `Button "${trimmedLabel}" has invalid auto-delete delay: ${btn.deleteAfterSeconds}. Delay must be between 5 and 86400 seconds (24 hours).`
          );
        }
      }
    } else if (btn.actionType === "JOIN_CHANNELS") {
      if (btn.replyText && btn.replyText.trim().length > 2000) {
        throw new Error(
          `Prompt text for "${trimmedLabel}" exceeds maximum length of 2000 characters.`
        );
      }
    }
  }

  // 3. Transactionally sync buttons in PostgreSQL (10s maxWait, 20s timeout, with direct fallback)
  const executeSaveButtons = async (client: typeof prisma | any) => {
    // Collect existing button IDs in payload
    const incomingIds = buttons
      .map((b) => b.id)
      .filter((id): id is string => typeof id === "string" && id.length > 0);

    // Delete buttons removed by the admin for this specific bot
    await client.botButton.deleteMany({
      where: {
        botId,
        id: { notIn: incomingIds },
      },
    });

    const results = [];
    for (let index = 0; index < buttons.length; index++) {
      const b = buttons[index];
      const trimmedLabel = b.label.trim();
      const trimmedReply =
        b.actionType === "SEND_TEXT" ? b.replyText?.trim() ?? null : null;
      const autoDeleteReply =
        b.actionType === "SEND_TEXT" ? Boolean(b.autoDeleteReply) : false;
      const deleteAfterSeconds =
        b.actionType === "SEND_TEXT" && b.autoDeleteReply
          ? Math.floor(b.deleteAfterSeconds ?? 30)
          : 30;

      if (b.id) {
        const updated = await client.botButton.upsert({
          where: { id: b.id },
          update: {
            label: trimmedLabel,
            actionType: b.actionType,
            replyText: trimmedReply,
            autoDeleteReply,
            deleteAfterSeconds,
            isEnabled: b.isEnabled ?? true,
            order: index,
          },
          create: {
            id: b.id,
            botId,
            label: trimmedLabel,
            actionType: b.actionType,
            replyText: trimmedReply,
            autoDeleteReply,
            deleteAfterSeconds,
            isEnabled: b.isEnabled ?? true,
            order: index,
          },
        });
        results.push(updated);
      } else {
        const created = await client.botButton.create({
          data: {
            botId,
            label: trimmedLabel,
            actionType: b.actionType,
            replyText: trimmedReply,
            autoDeleteReply,
            deleteAfterSeconds,
            isEnabled: b.isEnabled ?? true,
            order: index,
          },
        });
        results.push(created);
      }
    }

    // Verify adminUser exists if provided to prevent foreign key errors
    let validAdminUserId: string | null = null;
    if (adminUserId) {
      const adminExists = await client.adminUser.findUnique({
        where: { id: adminUserId },
        select: { id: true },
      });
      if (adminExists) {
        validAdminUserId = adminExists.id;
      }
    }

    // 4. Record audit log
    await client.auditLog.create({
      data: {
        botId,
        adminUserId: validAdminUserId,
        action: "UPDATE_BOT_MENU",
        details: {
          buttonCount: buttons.length,
          labels: buttons.map((b) => b.label.trim()),
        },
      },
    });

    return results;
  };

  try {
    return await prisma.$transaction((tx) => executeSaveButtons(tx), {
      maxWait: 10000,
      timeout: 20000,
    });
  } catch (err: any) {
    const errMsg = String(err?.message || err);
    if (
      errMsg.includes("Transaction API error") ||
      errMsg.includes("Unable to start a transaction") ||
      errMsg.includes("Transaction timed out")
    ) {
      console.warn(
        `[BotService] Interactive transaction timed out. Falling back to direct database execution.`
      );
      return await executeSaveButtons(prisma);
    }
    throw err;
  }
}

/**
 * Handles incoming text messages from Telegram users:
 * Checks if the text matches an active SEND_TEXT button for the bot.
 * Gracefully ignores disabled, removed, or unrecognized text.
 */
export async function handleTelegramText(botId: string, text: string) {
  if (!text || typeof text !== "string") {
    return { handled: false };
  }

  const trimmedText = text.trim();

  // Find enabled button for this bot matching the exact label (SEND_TEXT or JOIN_CHANNELS)
  const button = await prisma.botButton.findFirst({
    where: {
      botId,
      label: trimmedText,
      isEnabled: true,
      actionType: { in: ["SEND_TEXT", "JOIN_CHANNELS"] },
    },
  });

  if (!button) {
    return { handled: false };
  }

  if (button.actionType === "SEND_TEXT") {
    if (!button.replyText) return { handled: false };
    return {
      handled: true,
      actionType: "SEND_TEXT",
      replyText: button.replyText,
      button,
    };
  }

  if (button.actionType === "JOIN_CHANNELS") {
    const defaultPrompt =
      "Please join our official channels below, then tap 'Check Joined' to verify your membership.";
    return {
      handled: true,
      actionType: "JOIN_CHANNELS",
      replyText: button.replyText || defaultPrompt,
      button,
    };
  }

  return { handled: false };
}
