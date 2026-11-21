import { Bot, Keyboard, InlineKeyboard } from "grammy";
import { telegramHttpsAgent } from "./telegram-client";
import {
  handleTelegramStart,
  handleTelegramContact,
  handleTelegramText,
} from "./bot-service";
import {
  handleFlowStart,
  handleFlowText,
  handleFlowContact,
  FlowExecutionStep,
} from "./flow/flow-engine";
import { scheduleMessageDeletion } from "./deletion-service";
import {
  getBotChannels,
  checkUserChannelMemberships,
} from "./channel-service";
import { recordChannelActivityEvent } from "./activity-service";
import { recordCampaignTouch, recordMarketingConsent } from "./marketing-service";
import { receiveSupportUpdate } from "./inbox/receive";
import { prisma } from "./prisma";
import {
  isTelegramUserAuthorizedForBot,
  verifyAndLinkTelegramStaff,
  storeTelegramVideoAsset,
} from "./telegram-media-service";

async function dispatchFlowExecutionSteps(
  ctx: any,
  botId: string,
  steps: FlowExecutionStep[]
): Promise<void> {
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    const isLastStep = i === steps.length - 1;

    let replyMarkup: any = undefined;

    if (step.urlButtons && step.urlButtons.length > 0) {
      const inlineKeyboard = new InlineKeyboard();
      for (const ub of step.urlButtons) {
        inlineKeyboard.url(ub.text, ub.url).row();
      }
      replyMarkup = inlineKeyboard;
    } else if (step.buttons && step.buttons.length > 0) {
      const replyKeyboard = new Keyboard();
      for (const btn of step.buttons) {
        if (btn.actionType === "REQUEST_CONTACT") {
          replyKeyboard.requestContact(btn.label).row();
        } else {
          replyKeyboard.text(btn.label).row();
        }
      }
      if (!step.isRoot && !step.isEnd && step.nodeType !== "REQUEST_PHONE" && step.nodeType !== "START") {
        replyKeyboard.text("◀ Back").text("🏠 Main Menu").row();
      }
      replyKeyboard.resized();
      replyMarkup = replyKeyboard;
    }

    let sentMsg: any = null;

    if (step.nodeType === "IMAGE" && (step.mediaUrl || step.mediaStorageKey)) {
      const photoSrc = step.mediaUrl || step.mediaStorageKey;
      sentMsg = await ctx.replyWithPhoto(photoSrc, {
        caption: step.caption || undefined,
        reply_markup: isLastStep ? replyMarkup : undefined,
      });
    } else if (step.nodeType === "VIDEO" && (step.mediaUrl || step.mediaStorageKey)) {
      const videoSrc = step.mediaUrl || step.mediaStorageKey;
      sentMsg = await ctx.replyWithVideo(videoSrc, {
        caption: step.caption || undefined,
        reply_markup: isLastStep ? replyMarkup : undefined,
      });
    } else {
      const text = step.text || "Choose an option:";
      sentMsg = await ctx.reply(text, {
        reply_markup: replyMarkup,
      });
    }

    if (step.autoDeleteReply && step.deleteAfterSeconds && sentMsg) {
      try {
        await scheduleMessageDeletion({
          botId,
          chatId: String(sentMsg.chat.id),
          messageId: sentMsg.message_id,
          deleteAfterSeconds: step.deleteAfterSeconds,
        });
      } catch (e) {
        console.error("[AutoDelete Error]", e);
      }
    }
  }
}

/**
 * Registers all core Telegram bot event handlers onto a grammY Bot instance.
 * Shared seamlessly between local long polling and cloud webhooks.
 */
export function registerBotHandlers(bot: Bot, botId: string): void {
  bot.use(async (ctx, next) => {
    let waitMs = 500;
    for (;;) {
      try {
        if (await receiveSupportUpdate(botId, ctx.update)) return;
        break;
      } catch (error) {
        // Webhook delivery retries non-2xx. Polling must persist before the next offset.
        if (!bot.isRunning()) throw error;
        await new Promise(resolve => setTimeout(resolve, waitMs));
        waitMs = Math.min(10000, waitMs * 2);
      }
    }
    return next();
  });

  // 1. Handle /start command
  bot.command("start", async (ctx) => {
    try {
      const from = ctx.from;
      if (!from) return;

      // 1.0 Track Campaign Deep Link (e.g. /start c_<slug>)
      const startPayload = ctx.match ? String(ctx.match).trim() : "";
      if (startPayload.startsWith("c_")) {
        const campaignSlug = startPayload.substring(2);
        await recordCampaignTouch({
          botId,
          slug: campaignSlug,
          telegramUserId: from.id,
        }).catch((e) => console.error("[Campaign Touch Error]", e));
      }

      // 1.1 Check if Bot Flow is published for this bot
      const flowResult = await handleFlowStart(
        botId,
        {
          telegramId: from.id,
          firstName: from.first_name,
          lastName: from.last_name,
          username: from.username,
          languageCode: from.language_code,
        },
        {
          getChatMemberFn: (chatId, userId) => ctx.api.getChatMember(chatId, userId),
          updateId: ctx.update?.update_id,
        }
      );

      if (flowResult.hasFlow) {
        if (flowResult.steps && flowResult.steps.length > 0) {
          await dispatchFlowExecutionSteps(ctx, botId, flowResult.steps);
          console.log(
            `[Telegram Bot Flow V2] Handled /start steps for user @${from.username ?? "no_username"} (${from.id})`
          );
          return;
        }

        if (flowResult.buttons) {
          const replyKeyboard = new Keyboard();
          for (const btn of flowResult.buttons) {
            if (btn.actionType === "REQUEST_CONTACT") {
              replyKeyboard.requestContact(btn.label).row();
            } else {
              replyKeyboard.text(btn.label).row();
            }
          }
          replyKeyboard.resized();

          const welcome =
            flowResult.welcomeMessage ||
            "Welcome! Please choose an option from the menu.";

          await ctx.reply(welcome, {
            reply_markup: replyKeyboard,
          });

          console.log(
            `[Telegram Bot Flow] Handled /start for user @${from.username ?? "no_username"} (${from.id})`
          );
          return;
        }
      }

      // 1.2 Fallback to legacy BotButton menu if no Flow V1 is published
      const result = await handleTelegramStart({
        botId,
        telegramId: from.id,
        firstName: from.first_name,
        lastName: from.last_name,
        username: from.username,
        languageCode: from.language_code,
      });

      const replyKeyboard = new Keyboard();
      const configuredButtons = result.buttons || [];

      if (configuredButtons.length > 0) {
        for (const btn of configuredButtons) {
          if (btn.actionType === "REQUEST_CONTACT") {
            replyKeyboard.requestContact(btn.label).row();
          } else {
            replyKeyboard.text(btn.label).row();
          }
        }
      } else {
        replyKeyboard.text("ℹ️ Help / Info").row();
      }

      replyKeyboard.resized();

      const optionalNotice =
        "\n\n━━━━━━━━━━━━━━━━━━━━\n" +
        "ℹ️ Note: Sharing your phone number is completely optional. If you choose to tap '📱 Share Phone Number', your number will be made available to authorized backstage staff for customer support and contact purposes. You can freely use /start and the menu without sharing.";

      await ctx.reply(result.welcomeMessage + optionalNotice, {
        reply_markup: replyKeyboard,
      });

      console.log(
        `[Telegram Bot] Handled /start for user @${from.username ?? "no_username"} (${from.id})`
      );
    } catch (error) {
      console.error(
        "[Telegram Bot Error] Failed to handle /start:",
        error instanceof Error ? error.message : "Unknown error"
      );
      try {
        await ctx.reply(
          "Sorry, a temporary error occurred while connecting to Backstage. Please try again later."
        );
      } catch {}
      if (process.env.TELEGRAM_MODE === "webhook") throw error;
    }
  });

  // 1.5 Marketing Consent Commands (/optin, /optout, /marketing_stop)
  bot.command("optin", async (ctx) => {
    try {
      const from = ctx.from;
      if (!from) return;

      await recordMarketingConsent({
        botId,
        telegramUserId: from.id,
        consentStatus: "OPTED_IN",
        source: "COMMAND_OPTIN",
        purpose: "GENERAL_MARKETING",
      });

      await ctx.reply(
        "✅ You have successfully opted in to receive promotional and update messages from this bot.\n\n" +
          "You can withdraw your consent at any time by sending /optout."
      );
    } catch (err) {
      console.error("[Bot Error /optin]", err);
    }
  });

  bot.command(["optout", "marketing_stop"], async (ctx) => {
    try {
      const from = ctx.from;
      if (!from) return;

      await recordMarketingConsent({
        botId,
        telegramUserId: from.id,
        consentStatus: "OPTED_OUT",
        source: "COMMAND_OPTOUT",
        purpose: "GENERAL_MARKETING",
      });

      await ctx.reply(
        "🛑 You have unsubscribed from marketing and promotional messages from this bot.\n\n" +
          "Your preference has been saved and you will not receive promotional broadcasts. You can re-subscribe anytime by sending /optin."
      );
    } catch (err) {
      console.error("[Bot Error /optout]", err);
    }
  });

  // 1.8 Handle /link command (Staff Telegram Identity Verification)
  bot.command("link", async (ctx) => {
    try {
      const from = ctx.from;
      if (!from) return;

      const code = ctx.match ? String(ctx.match).trim() : "";
      console.log(
        `[Staff Linking] Received /link command from @${from.username || "no_username"} (${from.id}) with code: "${code}"`
      );
      if (!code) {
        await ctx.reply(
          "ℹ️ Staff Telegram Linking:\n\n" +
            "To authorize your Telegram account to manage bots and send media assets:\n" +
            "1. Log in to Botdesk Backstage\n" +
            "2. Go to Users & Access / Staff\n" +
            "3. Click 'Generate Telegram Link Code'\n" +
            "4. Send '/link <code>' to this bot."
        );
        return;
      }

      const res = await verifyAndLinkTelegramStaff(code, from.id, from.username);
      if (res.success) {
        console.log(
          `[Staff Linking] Successfully linked @${from.username || "no_username"} (${from.id}) to ${res.adminUser?.email}`
        );
        await ctx.reply(
          `✅ Account Linked Successfully!\n\n` +
            `Telegram ID: ${from.id}\n` +
            `Staff Account: ${res.adminUser?.email} (${res.adminUser?.role})\n\n` +
            `You can now forward or send long videos directly to this bot to publish them in Botdesk without downloading.`
        );
      } else {
        console.warn(
          `[Staff Linking] Failed to link @${from.username || "no_username"} (${from.id}): ${res.message}`
        );
        await ctx.reply(`⚠️ Linking Failed: ${res.message}`);
      }
    } catch (err) {
      console.error("[Bot Error /link]", err);
    }
  });

  // 2. Handle contact sharing (phone number collection with ownership validation)
  bot.on(":contact", async (ctx) => {
    try {
      const contact = ctx.message?.contact;
      const from = ctx.from;
      if (!contact || !from) return;

      // Check Flow V2 contact node handler first
      const flowContactRes = await handleFlowContact(botId, from.id, contact, {
        getChatMemberFn: (chatId, userId) => ctx.api.getChatMember(chatId, userId),
        updateId: ctx.update?.update_id,
      });

      if (flowContactRes.handled && flowContactRes.steps && flowContactRes.steps.length > 0) {
        await dispatchFlowExecutionSteps(ctx, botId, flowContactRes.steps);
        console.log(`[Telegram Bot Flow V2] Handled contact sharing steps for user ${from.id}`);
        return;
      }

      const result = await handleTelegramContact({
        botId,
        senderTelegramId: from.id,
        contactUserId: contact.user_id,
        phoneNumber: contact.phone_number,
      });

      if (result.success) {
        console.log(
          `[Telegram Bot] Verified and recorded contact for Telegram user ${from.id}`
        );
        await ctx.reply(
          "✅ Thank you! Your phone number has been verified and securely recorded for support purposes in Backstage."
        );
      } else {
        console.warn(
          `[Telegram Bot] Contact rejected for Telegram user ${from.id}. Reason: ${result.reason}`
        );
        await ctx.reply(
          "⚠️ We could not verify this phone number.\n\n" +
            "To protect your account, we only accept your own personal contact. " +
            "Please tap the '📱 Share Phone Number' button below rather than forwarding a contact card."
        );
      }
    } catch (error) {
      console.error(
        "[Telegram Bot Error] Failed to process contact:",
        error instanceof Error ? error.message : "Unknown error"
      );
      try {
        await ctx.reply(
          "Could not record phone number due to a temporary error. Please try again."
        );
      } catch {}
      if (process.env.TELEGRAM_MODE === "webhook") throw error;
    }
  });

  // 2.5 Handle non-text messages while in USER_INPUT node
  bot.on(
    [
      "message:photo",
      "message:video",
      "message:voice",
      "message:sticker",
      "message:document",
    ],
    async (ctx, next) => {
      const from = ctx.from;
      if (from) {
        const user = await prisma.telegramUser.findUnique({
          where: { botId_telegramId: { botId, telegramId: BigInt(from.id) } },
        });
        const ctxData = (user?.flowStepContext || {}) as any;
        if (ctxData?.waitingForInput) {
          await ctx.reply(
            "⚠️ Unsupported format. Please reply with your response as text (or send /cancel to exit)."
          );
          return;
        }
      }
      return next();
    }
  );

  // 2.8 Handle video messages (direct or forwarded) for Telegram video library reuse
  bot.on(["message:video", "message:document"], async (ctx, next) => {
    const msg = ctx.message;
    const from = ctx.from;
    if (!msg || !from) return next();

    // Check if message is a video or a video document
    const video = msg.video;
    const doc = msg.document;
    const isVideoDoc = Boolean(doc && doc.mime_type && doc.mime_type.startsWith("video/"));

    if (!video && !isVideoDoc) {
      return next();
    }

    console.log(
      `[Telegram Media Reuse] Received video message from @${from.username || "no_username"} (${from.id}), size: ${video?.file_size || doc?.file_size || 0} bytes`
    );

    // 1. Authenticate sender: must be linked to active Backstage staff authorized for this bot
    const auth = await isTelegramUserAuthorizedForBot(from.id, botId);

    if (!auth.authorized) {
      console.warn(
        `[Telegram Media Reuse] Rejected video from unlinked/unauthorized user @${from.username || "no_user"} (${from.id}): ${auth.reason}`
      );
      await ctx.reply(
        `⛔ Unauthorized: Your Telegram account (ID: ${from.id}) is not linked to an authorized staff account for this bot.\n\n` +
          `To link your account:\n` +
          `1. Log in to Botdesk Backstage\n` +
          `2. Go to Users & Access / Staff -> Generate Link Code\n` +
          `3. Send "/link <code>" to this bot.`
      );
      return;
    }

    // 2. Extract video metadata
    const fileId = video ? video.file_id : doc!.file_id;
    const fileUniqueId = video ? video.file_unique_id : doc!.file_unique_id;
    const fileSize = video ? video.file_size : doc!.file_size;
    const duration = video ? video.duration : undefined;
    const width = video ? video.width : undefined;
    const height = video ? video.height : undefined;
    const mimeType = video ? video.mime_type || "video/mp4" : doc!.mime_type || "video/mp4";
    const fileName = video ? (video as any).file_name : doc!.file_name;
    const caption = msg.caption || undefined;

    // Forward source info (if message was forwarded from another chat/channel)
    const forwardFromChat = (msg as any).forward_from_chat;
    const forwardFromMsgId = (msg as any).forward_from_message_id;
    const forwardSenderName =
      (msg as any).forward_sender_name ||
      (msg as any).forward_from?.username ||
      (msg as any).forward_from?.first_name;

    // 3. Store asset in database
    await storeTelegramVideoAsset({
      botId,
      telegramFileId: fileId,
      telegramFileUniqueId: fileUniqueId,
      sourceChatId: String(ctx.chat.id),
      sourceMessageId: msg.message_id,
      forwardFromChatId: forwardFromChat ? String(forwardFromChat.id) : undefined,
      forwardFromMessageId: forwardFromMsgId ? Number(forwardFromMsgId) : undefined,
      forwardFromChatTitle: forwardFromChat ? String(forwardFromChat.title) : undefined,
      forwardSenderName,
      fileType: video ? "VIDEO" : "DOCUMENT",
      mimeType,
      fileName,
      fileSizeBytes: fileSize,
      duration,
      width,
      height,
      originalCaption: caption,
      senderTelegramId: from.id,
      senderUsername: from.username,
      senderFirstName: from.first_name,
      addedByUserId: auth.adminUser?.id,
    });

    // 4. Send rich confirmation to staff user in Telegram
    const sizeMb = fileSize ? (fileSize / (1024 * 1024)).toFixed(1) : "Unknown";
    const durStr = duration ? `${Math.floor(duration / 60)}m ${duration % 60}s` : "Unknown";

    const botRecord = await prisma.bot.findUnique({
      where: { id: botId },
      select: { name: true, username: true },
    });

    await ctx.reply(
      `🎬 Video Stored in Botdesk Library!\n\n` +
        `📁 File: ${fileName || "Telegram Video"}\n` +
        `⏱ Duration: ${durStr}\n` +
        `📦 Size: ${sizeMb} MB (Telegram Native Reuse)\n` +
        `🤖 Receiving Bot: @${botRecord?.username || botId}\n` +
        (caption
          ? `💬 Caption: "${caption.slice(0, 80)}${caption.length > 80 ? "..." : ""}"\n`
          : "") +
        `\n` +
        `Ready to publish! Open Botdesk -> Channel Posts -> select @${botRecord?.username || "bot"} -> switch to "From Telegram" to publish or schedule.`
    );
  });

  // 3. Handle dynamic reply keyboard button presses (Flow V1 & V2 with legacy fallback)
  bot.on("message:text", async (ctx, next) => {
    const text = ctx.message?.text;
    if (!text || text.startsWith("/")) {
      return next(); // Let commands like /start pass through
    }

    try {
      const from = ctx.from;

      // 3.1 Try Bot Flow runtime engine first
      if (from) {
        const flowResult = await handleFlowText(botId, from.id, text, {
          getChatMemberFn: (chatId, userId) => ctx.api.getChatMember(chatId, userId),
          updateId: ctx.update?.update_id,
        });

        if (flowResult.hasFlow && flowResult.handled) {
          // If Flow V2 emitted execution steps, dispatch them
          if (flowResult.steps && flowResult.steps.length > 0) {
            await dispatchFlowExecutionSteps(ctx, botId, flowResult.steps);
            console.log(
              `[Telegram Bot Flow V2] Handled text update for user ${from.id} via V2 steps`
            );
            return;
          }

          // A. Menu Navigation (Submenu, Back, Main, Recovery)
          if (
            flowResult.actionType === "OPEN_SUBMENU" ||
            flowResult.actionType === "NAVIGATE_BACK" ||
            flowResult.actionType === "NAVIGATE_MAIN" ||
            flowResult.actionType === "RECOVERED_TO_ROOT"
          ) {
            const replyKeyboard = new Keyboard();
            const buttons = flowResult.buttons || [];
            for (const btn of buttons) {
              if (btn.actionType === "REQUEST_CONTACT") {
                replyKeyboard.requestContact(btn.label).row();
              } else {
                replyKeyboard.text(btn.label).row();
              }
            }
            if (!flowResult.isRoot) {
              replyKeyboard.text("◀ Back").text("🏠 Main Menu").row();
            }
            replyKeyboard.resized();

            await ctx.reply(flowResult.replyText || "Choose an option:", {
              reply_markup: replyKeyboard,
            });
            console.log(
              `[Telegram Bot Flow] Navigated (${flowResult.actionType}) for user ${from.id} -> ${flowResult.menu?.title || "Menu"}`
            );
            return;
          }

          // B. Send Text (with optional auto-delete)
          if (flowResult.actionType === "SEND_TEXT") {
            if (flowResult.replyText) {
              const sent = await ctx.reply(flowResult.replyText);
              console.log(
                `[Telegram Bot Flow] Sent text reply for "${text}" (user ${from.id})`
              );

              if (
                flowResult.autoDeleteReply &&
                flowResult.deleteAfterSeconds
              ) {
                try {
                  await scheduleMessageDeletion({
                    botId,
                    chatId: String(sent.chat.id),
                    messageId: sent.message_id,
                    deleteAfterSeconds: flowResult.deleteAfterSeconds,
                  });
                } catch (schedErr) {
                  console.error(
                    "[AutoDelete Error] Failed to schedule deletion:",
                    schedErr instanceof Error ? schedErr.message : schedErr
                  );
                }
              }
            }
            return;
          }

          // C. URL / External Link (Reply message with attached Inline URL Button)
          if (flowResult.actionType === "URL") {
            const inlineKeyboard = new InlineKeyboard().url(
              flowResult.urlLabel || "🌐 Open Link",
              flowResult.url || ""
            );
            await ctx.reply(
              flowResult.replyText || "Please visit the official link below:",
              { reply_markup: inlineKeyboard }
            );
            console.log(
              `[Telegram Bot Flow] Sent URL inline button for "${text}" (user ${from.id})`
            );
            return;
          }

          // D. Contact Request (Phone Number)
          if (flowResult.actionType === "REQUEST_CONTACT") {
            const contactKeyboard = new Keyboard()
              .requestContact(flowResult.contactLabel || "📱 Share Phone Number")
              .row();
            if (!flowResult.isRoot) {
              contactKeyboard.text("◀ Back").text("🏠 Main Menu").row();
            }
            contactKeyboard.resized();

            await ctx.reply(
              flowResult.replyText ||
                "Please tap 'Share Phone Number' below to securely share your contact with support.",
              { reply_markup: contactKeyboard }
            );
            return;
          }

          // E. Join Channels
          if (flowResult.actionType === "JOIN_CHANNELS") {
            const channels = await getBotChannels(botId, true);
            if (channels.length === 0) {
              await ctx.reply(
                "ℹ️ No official channels are currently configured for this bot."
              );
              return;
            }

            const inlineKeyboard = new InlineKeyboard();
            for (const ch of channels) {
              inlineKeyboard.url(ch.buttonLabel, ch.inviteLink).row();
            }
            inlineKeyboard.text("🔄 Check Joined", `check_joined:${botId}`).row();

            const promptText =
              flowResult.replyText ||
              "Please join our official channels below, then tap 'Check Joined' to verify your membership.";

            await ctx.reply(promptText, { reply_markup: inlineKeyboard });
            return;
          }
        }
      }

      // 3.2 Fallback to legacy BotButton menu handler
      const result = await handleTelegramText(botId, text);
      if (result.handled) {
        if (result.actionType === "JOIN_CHANNELS") {
          const channels = await getBotChannels(botId, true);
          if (channels.length === 0) {
            await ctx.reply(
              "ℹ️ No official channels are currently configured for this bot."
            );
            return;
          }

          const inlineKeyboard = new InlineKeyboard();
          for (const ch of channels) {
            inlineKeyboard.url(ch.buttonLabel, ch.inviteLink).row();
          }
          inlineKeyboard.text("🔄 Check Joined", `check_joined:${botId}`).row();

          const promptText =
            result.replyText ||
            "Please join our official channels below, then tap 'Check Joined' to verify your membership.";

          await ctx.reply(promptText, { reply_markup: inlineKeyboard });
          console.log(
            `[Telegram Bot] Displayed ${channels.length} channels with inline buttons for button "${text}" (user ${ctx.from?.id})`
          );
          return;
        }

        if (result.replyText) {
          const sent = await ctx.reply(result.replyText);
          console.log(
            `[Telegram Bot] Handled menu action for button "${text}" (user ${ctx.from?.id})`
          );

          if (
            result.button?.autoDeleteReply &&
            result.button?.deleteAfterSeconds
          ) {
            try {
              await scheduleMessageDeletion({
                botId,
                chatId: String(sent.chat.id),
                messageId: sent.message_id,
                deleteAfterSeconds: result.button.deleteAfterSeconds,
              });
              console.log(
                `[AutoDelete] Scheduled deletion for message ID ${sent.message_id} in chat ${sent.chat.id} after ${result.button.deleteAfterSeconds}s`
              );
            } catch (schedErr) {
              console.error(
                "[AutoDelete Error] Failed to schedule message deletion:",
                schedErr instanceof Error ? schedErr.message : schedErr
              );
            }
          }
          return;
        }
      }
    } catch (error) {
      console.error(
        "[Telegram Bot Error] Error evaluating menu button text:",
        error instanceof Error ? error.message : "Unknown error"
      );
      if (process.env.TELEGRAM_MODE === "webhook") throw error;
    }

    return next();
  });

  // 4. Handle "Check Joined" callback button press
  bot.callbackQuery(/^check_joined:(.+)$/, async (ctx) => {
    try {
      await ctx.answerCallbackQuery({
        text: "Checking channel memberships...",
      });

      const parts = (ctx.callbackQuery.data || "").split(":");
      const targetBotId = parts[1] || botId;
      const userId = ctx.from.id;

      const summary = await checkUserChannelMemberships({
        botId: targetBotId,
        userId,
        getChatMemberFn: async (chatId, uId) => {
          return bot.api.getChatMember(chatId, uId);
        },
      });

      let message = "";
      if (summary.allRequiredJoined && !summary.hasErrors) {
        message =
          "✅ **Membership Verified!**\n\n" +
          "Thank you! You have successfully joined all required channels.";
        if (summary.details.length > 0) {
          message +=
            "\n\n" +
            summary.details
              .map((d) => `• **${d.channelName}**: Verified (${d.status})`)
              .join("\n");
        }
      } else if (summary.hasErrors) {
        message =
          "⚠️ **Verification Notice**\n\n" +
          summary.message +
          "\n\n" +
          summary.details
            .filter((d) => d.status === "error")
            .map((d) => `• **${d.channelName}**: ${d.errorMessage}`)
            .join("\n") +
          "\n\n_Note: Please ensure the bot is added as an Administrator to each channel to verify membership._";
      } else {
        message =
          "⚠️ **Membership Verification Incomplete**\n\n" +
          "You must join all required channels to proceed:\n\n";
        message += summary.details
          .map((d) => {
            const icon = d.isJoined ? "✅" : d.isRequired ? "❌" : "⚪";
            const statusDesc = d.isJoined
              ? "Joined"
              : d.isRequired
              ? "Required — Not Joined"
              : "Optional — Not Joined";
            return `${icon} **${d.channelName}**: ${statusDesc}`;
          })
          .join("\n");
        message +=
          "\n\nPlease tap the channel links above to join, then tap **Check Joined** again.";
      }

      await ctx.reply(message, { parse_mode: "Markdown" });
      console.log(
        `[Telegram Bot] Membership check completed for Telegram user ${userId}: allRequiredJoined=${summary.allRequiredJoined}`
      );
    } catch (error) {
      console.error(
        "[Telegram Bot Error] Callback query check_joined error:",
        error instanceof Error ? error.message : "Unknown error"
      );
      try {
        await ctx.reply(
          "Sorry, an unexpected error occurred while checking channel membership. Please try again later."
        );
      } catch {}
      if (process.env.TELEGRAM_MODE === "webhook") throw error;
    }
  });

  // 5. Handle channel chat_member updates (join, leave, kick, promote)
  bot.on("chat_member", async (ctx) => {
    try {
      const chatMember = ctx.chatMember;
      if (!chatMember) return;

      const chat = ctx.chat;
      const oldStatus = chatMember.old_chat_member?.status;
      const newStatus = chatMember.new_chat_member?.status;
      const targetUser = chatMember.new_chat_member?.user;
      const actor = chatMember.from;
      const updateId = ctx.update?.update_id;

      if (!targetUser || !chat) return;

      const isNonMember = (s?: string) => s === "left" || s === "kicked";
      const isMember = (s?: string) =>
        s === "member" || s === "administrator" || s === "creator" || s === "restricted";

      let eventType: "JOINED" | "LEFT" | null = null;
      if (isNonMember(oldStatus) && isMember(newStatus)) {
        eventType = "JOINED";
      } else if (isMember(oldStatus) && isNonMember(newStatus)) {
        eventType = "LEFT";
      } else if (oldStatus !== newStatus) {
        // Status transitions (e.g. restricted or promoted)
        eventType = isMember(newStatus) ? "JOINED" : "LEFT";
      }

      if (eventType) {
        await recordChannelActivityEvent({
          botId,
          telegramChatId: String(chat.id),
          channelTitle: (chat as any).title || null,
          telegramUserId: targetUser.id,
          userFirstName: targetUser.first_name || null,
          userLastName: targetUser.last_name || null,
          username: targetUser.username || null,
          actorUserId: actor ? actor.id : null,
          actorUsername: actor ? actor.username : null,
          eventType,
          status: newStatus,
          source: "TELEGRAM_UPDATE",
          updateId,
          details: {
            oldStatus,
            newStatus,
            chatType: chat.type,
            chatUsername: (chat as any).username || null,
            viaInviteLink: Boolean((chatMember as any).invite_link),
          },
        });

        console.log(
          `[Channel Activity] Recorded ${eventType} for user ${targetUser.id} in channel ${chat.id} (bot: ${botId})`
        );
      }
    } catch (err) {
      console.error("[Channel Activity Error] Failed to process chat_member update:", err);
    }
  });

  // 6. Global error sanitizer (never leak bot tokens in traces)
  bot.catch((err) => {
    const sanitizedMessage = String(err.message || "").replace(
      /\d+:[A-Za-z0-9_-]{35}/g,
      "[REDACTED_BOT_TOKEN]"
    );
    console.error("[Telegram Bot Global Error]", sanitizedMessage);
    if (process.env.TELEGRAM_MODE === "webhook") {
      throw err;
    }
  });
}

/**
 * Creates and initializes a fully configured grammY Bot instance.
 * Accepts optional botInfo to avoid redundant getMe network round trips on cold start.
 */
export function createTelegramBot(
  token: string,
  botId: string,
  botInfo?: any
): Bot {
  const isTest = process.env.NODE_ENV === "test" || Boolean(process.env.VITEST);
  const defaultBotInfo = isTest
    ? {
        id: 123456789,
        is_bot: true,
        first_name: "BackStage Bot",
        username: "backstage_bot",
        can_join_groups: true,
        can_read_all_group_messages: false,
        supports_inline_queries: false,
      }
    : undefined;

  const botConfig: any = {
    client: {
      baseFetchConfig: { agent: telegramHttpsAgent } as any,
    },
  };

  if (botInfo !== undefined) {
    botConfig.botInfo = botInfo;
  } else if (defaultBotInfo) {
    botConfig.botInfo = defaultBotInfo;
  }

  const bot = new Bot(token, botConfig);
  registerBotHandlers(bot, botId);
  return bot;
}

// Cached bot instances for webhook runtime mapped by botId
const webhookBotInstances = new Map<string, { bot: Bot; token: string }>();
let globalTestBot: Bot | null = null;

export function _setWebhookBotForTesting(bot: Bot | null, botId?: string): void {
  globalTestBot = bot;
  if (botId) {
    if (bot) {
      webhookBotInstances.set(botId, { bot, token: "test" });
    } else {
      webhookBotInstances.delete(botId);
    }
  } else if (!bot) {
    webhookBotInstances.clear();
  }
}

export function getWebhookBotInstance(token: string, botId: string): Bot {
  if (globalTestBot) {
    return globalTestBot;
  }

  const existing = webhookBotInstances.get(botId);
  if (existing && existing.token === token) {
    return existing.bot;
  }

  const newBot = createTelegramBot(token, botId);
  webhookBotInstances.set(botId, { bot: newBot, token });
  return newBot;
}
