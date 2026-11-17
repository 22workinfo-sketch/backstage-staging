import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "../src/lib/prisma";
import {
  isTelegramUserAuthorizedForBot,
  generateStaffTelegramLinkCode,
  verifyAndLinkTelegramStaff,
  linkStaffTelegramDirectly,
  storeTelegramVideoAsset,
  getTelegramMediaAssets,
  getTelegramMediaAssetById,
  deleteTelegramMediaAsset,
} from "../src/lib/telegram-media-service";
import {
  createDraftPost,
  updateDraftPost,
  publishChannelPost,
} from "../src/lib/post-service";

describe("Telegram Video Reuse Feature (Zero Local Re-Upload)", () => {
  const botAId = "11111111-tgvid-aaaa-aaaa-aaaaaaaaaaaa";
  const botBId = "11111111-tgvid-bbbb-bbbb-bbbbbbbbbbbb";
  const channelAId = "22222222-tgchan-aaaa-aaaa-aaaaaaaaaaaa";
  const channelBId = "22222222-tgchan-bbbb-bbbb-bbbbbbbbbbbb";
  const adminUserId = "33333333-staff-aaaa-aaaa-aaaaaaaaaaaa";
  const editorUserId = "33333333-staff-eeee-eeee-eeeeeeeeeeee";

  beforeAll(async () => {
    // 1. Create two isolated test bots
    await prisma.bot.upsert({
      where: { id: botAId },
      create: {
        id: botAId,
        name: "Video Test Bot A",
        username: "video_test_bot_a",
      },
      update: {},
    });

    await prisma.bot.upsert({
      where: { id: botBId },
      create: {
        id: botBId,
        name: "Video Test Bot B",
        username: "video_test_bot_b",
      },
      update: {},
    });

    // 2. Create test channels
    await prisma.botChannel.upsert({
      where: { id: channelAId },
      create: {
        id: channelAId,
        botId: botAId,
        name: "Bot A Channel",
        telegramChatId: "@channel_a_test",
        inviteLink: "https://t.me/channel_a_test",
        buttonLabel: "Join A",
        isRequired: true,
        isEnabled: true,
      },
      update: {},
    });

    await prisma.botChannel.upsert({
      where: { id: channelBId },
      create: {
        id: channelBId,
        botId: botBId,
        name: "Bot B Channel",
        telegramChatId: "@channel_b_test",
        inviteLink: "https://t.me/channel_b_test",
        buttonLabel: "Join B",
        isRequired: true,
        isEnabled: true,
      },
      update: {},
    });

    // 3. Create test Admin and Editor staff users
    await prisma.adminUser.upsert({
      where: { id: adminUserId },
      create: {
        id: adminUserId,
        email: "superadmin_tg@test.local",
        passwordHash: "dummyhash",
        role: "SUPER_ADMIN",
      },
      update: {
        telegramUserId: null,
        telegramUsername: null,
        telegramLinkCode: null,
      },
    });

    await prisma.adminUser.upsert({
      where: { id: editorUserId },
      create: {
        id: editorUserId,
        email: "editor_tg@test.local",
        passwordHash: "dummyhash",
        role: "EDITOR",
      },
      update: {
        telegramUserId: null,
        telegramUsername: null,
        telegramLinkCode: null,
      },
    });

    // Assign editor to Bot A only
    await prisma.staffBotAssignment.deleteMany({
      where: { userId: editorUserId },
    });
    await prisma.staffBotAssignment.create({
      data: {
        userId: editorUserId,
        botId: botAId,
      },
    });
  });

  afterAll(async () => {
    // Cleanup test artifacts
    await prisma.channelPost.deleteMany({
      where: { botId: { in: [botAId, botBId] } },
    });
    await prisma.telegramMediaAsset.deleteMany({
      where: { botId: { in: [botAId, botBId] } },
    });
    await prisma.botChannel.deleteMany({
      where: { id: { in: [channelAId, channelBId] } },
    });
    await prisma.staffBotAssignment.deleteMany({
      where: { userId: { in: [adminUserId, editorUserId] } },
    });
    await prisma.adminUser.deleteMany({
      where: { id: { in: [adminUserId, editorUserId] } },
    });
    await prisma.bot.deleteMany({
      where: { id: { in: [botAId, botBId] } },
    });
  });

  describe("1. Staff Authorization & Identity Linking", () => {
    it("should reject unlinked Telegram users", async () => {
      const unlinkedId = 9999888877n;
      const res = await isTelegramUserAuthorizedForBot(unlinkedId, botAId);
      expect(res.authorized).toBe(false);
      expect(res.reason).toContain("not linked to any active Backstage staff account");
    });

    it("should generate a 6-digit link code and verify Telegram staff identity", async () => {
      const code = await generateStaffTelegramLinkCode(adminUserId);
      expect(code).toMatch(/^\d{6}$/);

      // Verify code with Telegram identity
      const telegramStaffId = 777666555n;
      const linkResult = await verifyAndLinkTelegramStaff(
        code,
        telegramStaffId,
        "superadmin_tg"
      );
      expect(linkResult.success).toBe(true);
      expect(linkResult.adminUser?.email).toBe("superadmin_tg@test.local");

      // Now authorized for Bot A
      const authCheckA = await isTelegramUserAuthorizedForBot(telegramStaffId, botAId);
      expect(authCheckA.authorized).toBe(true);

      // SuperAdmin is also authorized for Bot B
      const authCheckB = await isTelegramUserAuthorizedForBot(telegramStaffId, botBId);
      expect(authCheckB.authorized).toBe(true);
    });

    it("should enforce bot-assignment scoping for Editor staff", async () => {
      const editorTelegramId = 555444333n;
      await linkStaffTelegramDirectly(editorUserId, editorTelegramId, "editor_user");

      // Editor IS assigned to Bot A
      const authBotA = await isTelegramUserAuthorizedForBot(editorTelegramId, botAId);
      expect(authBotA.authorized).toBe(true);

      // Editor IS NOT assigned to Bot B
      const authBotB = await isTelegramUserAuthorizedForBot(editorTelegramId, botBId);
      expect(authBotB.authorized).toBe(false);
      expect(authBotB.reason).toContain("not assigned to manage this bot");
    });
  });

  describe("2. Multi-Bot Scoping & Asset Isolation", () => {
    let assetAId: string;

    it("should store video asset strictly scoped to Bot A", async () => {
      const assetA = await storeTelegramVideoAsset({
        botId: botAId,
        telegramFileId: "BAACAgIAAxkBAAICamX...botA_file_id",
        telegramFileUniqueId: "AgADuniqueA123",
        sourceChatId: "-1001234567890",
        sourceMessageId: 1042,
        forwardFromChatTitle: "Awesome Movie Channel",
        fileType: "VIDEO",
        mimeType: "video/mp4",
        fileName: "long_documentary_part1.mp4",
        fileSizeBytes: 150 * 1024 * 1024, // 150 MB
        duration: 2700, // 45 minutes
        width: 1920,
        height: 1080,
        originalCaption: "Episode 1: The Beginning",
        senderTelegramId: 777666555n,
        senderUsername: "superadmin_tg",
        addedByUserId: adminUserId,
      });

      expect(assetA.id).toBeDefined();
      expect(assetA.botId).toBe(botAId);
      expect(assetA.duration).toBe(2700);
      assetAId = assetA.id;
    });

    it("should isolate assets: Bot B cannot list or access Bot A's media assets", async () => {
      const botAAssets = await getTelegramMediaAssets(botAId);
      expect(botAAssets.some((a) => a.id === assetAId)).toBe(true);

      const botBAssets = await getTelegramMediaAssets(botBId);
      expect(botBAssets.some((a) => a.id === assetAId)).toBe(false);

      const crossFetch = await getTelegramMediaAssetById(assetAId, botBId);
      expect(crossFetch).toBeNull();
    });

    it("should reject creating a Bot B post using Bot A's Telegram media asset", async () => {
      await expect(
        createDraftPost({
          botId: botBId,
          channelId: channelBId,
          postType: "TELEGRAM_VIDEO",
          content: "Attempting cross-bot theft",
          telegramAssetId: assetAId,
          telegramReuseMethod: "SEND_VIDEO",
        })
      ).rejects.toThrow("Telegram media asset does not belong to the selected bot.");
    });
  });

  describe("3. Post Draft & Update with TELEGRAM_VIDEO", () => {
    let postDraftId: string;
    let assetAId: string;

    beforeAll(async () => {
      const assets = await getTelegramMediaAssets(botAId);
      assetAId = assets[0].id;
    });

    it("should create a draft post referencing Telegram video asset and resolving metadata", async () => {
      const post = await createDraftPost({
        botId: botAId,
        channelId: channelAId,
        postType: "TELEGRAM_VIDEO",
        content: "Check out this 45-minute documentary! 🎬",
        telegramAssetId: assetAId,
        telegramReuseMethod: "SEND_VIDEO",
        hasSpoiler: true,
        buttons: [
          { label: "Watch Trailer", url: "https://example.com/trailer", order: 0 },
        ],
      });

      expect(post.id).toBeDefined();
      expect(post.postType).toBe("TELEGRAM_VIDEO");
      expect(post.telegramAssetId).toBe(assetAId);
      expect(post.telegramFileId).toContain("botA_file_id");
      expect(post.telegramSourceChatId).toBe("-1001234567890");
      expect(post.telegramSourceMessageId).toBe(1042);
      expect(post.telegramDuration).toBe(2700);
      expect(post.telegramVideoWidth).toBe(1920);
      expect(post.telegramVideoHeight).toBe(1080);
      expect(post.hasSpoiler).toBe(true);
      expect(post.mediaPath).toBeNull(); // No local upload needed

      postDraftId = post.id;
    });

    it("should update draft method to FORWARD_MESSAGE", async () => {
      const updated = await updateDraftPost({
        id: postDraftId,
        botId: botAId,
        channelId: channelAId,
        postType: "TELEGRAM_VIDEO",
        content: "",
        telegramAssetId: assetAId,
        telegramReuseMethod: "FORWARD_MESSAGE",
      });

      expect(updated.telegramReuseMethod).toBe("FORWARD_MESSAGE");
    });
  });

  describe("4. Publishing Engine (Mocked Telegram Bot API)", () => {
    let assetAId: string;

    beforeAll(async () => {
      const assets = await getTelegramMediaAssets(botAId);
      assetAId = assets[0].id;
    });

    it("should dispatch sendVideo with Telegram file_id, caption, spoiler, and buttons", async () => {
      const draft = await createDraftPost({
        botId: botAId,
        channelId: channelAId,
        postType: "TELEGRAM_VIDEO",
        content: "Direct video dispatch test with button",
        telegramAssetId: assetAId,
        telegramReuseMethod: "SEND_VIDEO",
        hasSpoiler: true,
        buttons: [
          { label: "Official Channel", url: "https://t.me/example", order: 0 },
        ],
      });

      let calledMethod: string | null = null;
      let passedTargetChatId: any = null;
      let passedFileId: any = null;
      let passedOptions: any = null;

      const mockApi = {
        sendVideo: async (chatId: any, fileId: any, options: any) => {
          calledMethod = "sendVideo";
          passedTargetChatId = chatId;
          passedFileId = fileId;
          passedOptions = options;
          return { message_id: 88812 };
        },
      };

      const result = await publishChannelPost(
        draft.id,
        botAId,
        adminUserId,
        mockApi
      );

      expect(result.success).toBe(true);
      expect(result.status).toBe("PUBLISHED");
      expect(result.messageId).toBe(88812);
      expect(calledMethod).toBe("sendVideo");
      expect(passedTargetChatId).toBe("@channel_a_test");
      expect(passedFileId).toContain("botA_file_id");
      expect(passedOptions.caption).toBe("Direct video dispatch test with button");
      expect(passedOptions.has_spoiler).toBe(true);
      expect(passedOptions.supports_streaming).toBe(true);
      expect(passedOptions.reply_markup).toBeDefined();

      const publishedInDb = await prisma.channelPost.findUnique({
        where: { id: draft.id },
      });
      expect(publishedInDb?.status).toBe("PUBLISHED");
      expect(publishedInDb?.telegramMessageId).toBe(88812);
    });

    it("should dispatch forwardMessage preserving source chat and message ID", async () => {
      const forwardDraft = await createDraftPost({
        botId: botAId,
        channelId: channelAId,
        postType: "TELEGRAM_VIDEO",
        content: "",
        telegramAssetId: assetAId,
        telegramReuseMethod: "FORWARD_MESSAGE",
        disableNotification: true,
      });

      let calledMethod: string | null = null;
      let passedTargetChatId: any = null;
      let passedFromChatId: any = null;
      let passedMessageId: any = null;
      let passedOptions: any = null;

      const mockApi = {
        forwardMessage: async (
          chatId: any,
          fromChatId: any,
          msgId: any,
          options: any
        ) => {
          calledMethod = "forwardMessage";
          passedTargetChatId = chatId;
          passedFromChatId = fromChatId;
          passedMessageId = msgId;
          passedOptions = options;
          return { message_id: 88815 };
        },
      };

      const result = await publishChannelPost(
        forwardDraft.id,
        botAId,
        adminUserId,
        mockApi
      );

      expect(result.success).toBe(true);
      expect(result.status).toBe("PUBLISHED");
      expect(result.messageId).toBe(88815);
      expect(calledMethod).toBe("forwardMessage");
      expect(passedTargetChatId).toBe("@channel_a_test");
      expect(passedFromChatId).toBe("-1001234567890");
      expect(passedMessageId).toBe(1042);
      expect(passedOptions.disable_notification).toBe(true);
    });
  });

  describe("5. Clean Error Handling & Safeguards", () => {
    let assetAId: string;

    beforeAll(async () => {
      const assets = await getTelegramMediaAssets(botAId);
      assetAId = assets[0].id;
    });

    it("should translate 'wrong file identifier' into a helpful isolation error", async () => {
      const post = await createDraftPost({
        botId: botAId,
        channelId: channelAId,
        postType: "TELEGRAM_VIDEO",
        content: "Testing invalid file identifier",
        telegramAssetId: assetAId,
        telegramReuseMethod: "SEND_VIDEO",
      });

      const mockApi = {
        sendVideo: async () => {
          throw new Error("Bad Request: wrong file identifier/HTTP URL specified");
        },
      };

      const result = await publishChannelPost(post.id, botAId, adminUserId, mockApi);
      expect(result.success).toBe(false);
      expect(result.status).toBe("FAILED");
      expect(result.error).toContain("Videos can only be reused by the exact bot that received them");
    });

    it("should translate 'protected content' forwarding errors cleanly", async () => {
      const post = await createDraftPost({
        botId: botAId,
        channelId: channelAId,
        postType: "TELEGRAM_VIDEO",
        content: "",
        telegramAssetId: assetAId,
        telegramReuseMethod: "FORWARD_MESSAGE",
      });

      const mockApi = {
        forwardMessage: async () => {
          throw new Error("Bad Request: chat's content is protected and can't be forwarded");
        },
      };

      const result = await publishChannelPost(post.id, botAId, adminUserId, mockApi);
      expect(result.success).toBe(false);
      expect(result.status).toBe("FAILED");
      expect(result.error).toContain("Content protection is enabled on the source chat");
    });

    it("should translate 'message to forward not found' cleanly", async () => {
      const post = await createDraftPost({
        botId: botAId,
        channelId: channelAId,
        postType: "TELEGRAM_VIDEO",
        content: "",
        telegramAssetId: assetAId,
        telegramReuseMethod: "FORWARD_MESSAGE",
      });

      const mockApi = {
        forwardMessage: async () => {
          throw new Error("Bad Request: message to forward not found");
        },
      };

      const result = await publishChannelPost(post.id, botAId, adminUserId, mockApi);
      expect(result.success).toBe(false);
      expect(result.status).toBe("FAILED");
      expect(result.error).toContain("The source message was deleted or is no longer accessible");
    });

    it("should treat network timeouts honestly as UNKNOWN without retrying", async () => {
      const post = await createDraftPost({
        botId: botAId,
        channelId: channelAId,
        postType: "TELEGRAM_VIDEO",
        content: "Timeout test",
        telegramAssetId: assetAId,
        telegramReuseMethod: "SEND_VIDEO",
      });

      const mockApi = {
        sendVideo: async () => {
          throw new Error("ETIMEDOUT: Connection timed out after 30000ms");
        },
      };

      const result = await publishChannelPost(post.id, botAId, adminUserId, mockApi);
      expect(result.success).toBe(false);
      expect(result.status).toBe("UNKNOWN");
      expect(result.error).toContain("Network connection timed out");

      const dbPost = await prisma.channelPost.findUnique({ where: { id: post.id } });
      expect(dbPost?.status).toBe("UNKNOWN");
    });
  });
});
