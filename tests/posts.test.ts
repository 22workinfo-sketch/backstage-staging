import { describe, it, expect, beforeAll, afterAll } from "vitest";
import path from "path";
import fs from "fs";
import { prisma } from "../src/lib/prisma";
import {
  validatePostContent,
  validateInlineUrlButtons,
  validateImageUpload,
  createDraftPost,
  updateDraftPost,
  deletePost,
  getChannelPosts,
  publishChannelPost,
  checkBotChannelPermissions,
  UPLOADS_POSTS_DIR,
} from "../src/lib/post-service";
import {
  GET as channelPostsGET,
  POST as channelPostsPOST,
} from "../src/app/api/bots/[id]/channels/[channelId]/posts/route";
import {
  PUT as postPUT,
} from "../src/app/api/posts/[id]/route";
import {
  POST as publishPOST,
} from "../src/app/api/posts/[id]/publish/route";
import {
  POST as uploadPOST,
} from "../src/app/api/posts/upload/route";
import {
  GET as mediaGET,
} from "../src/app/api/media/posts/[filename]/route";
import { NextRequest } from "next/server";

describe("Channel Post Manager & Publishing Engine", () => {
  const testBotAId = "99999999-post-1111-1111-111111111111";
  const testBotBId = "99999999-post-2222-2222-222222222222";
  const testChannelAId = "88888888-chan-aaaa-aaaa-aaaaaaaaaaaa";
  const testChannelBId = "88888888-chan-bbbb-bbbb-bbbbbbbbbbbb";
  const testImagePath = path.join(UPLOADS_POSTS_DIR, "test-fixture-image.jpg");

  beforeAll(async () => {
    // 1. Setup isolated test bots and channels in PostgreSQL
    await prisma.bot.upsert({
      where: { id: testBotAId },
      create: {
        id: testBotAId,
        name: "Test Posts Bot A",
        username: "test_posts_bot_a",
      },
      update: {},
    });

    await prisma.bot.upsert({
      where: { id: testBotBId },
      create: {
        id: testBotBId,
        name: "Test Posts Bot B",
        username: "test_posts_bot_b",
      },
      update: {},
    });

    await prisma.botChannel.upsert({
      where: { id: testChannelAId },
      create: {
        id: testChannelAId,
        botId: testBotAId,
        name: "Bot A Channel",
        telegramChatId: "@bot_a_channel",
        inviteLink: "https://t.me/bot_a_channel",
        buttonLabel: "Join A",
        isRequired: true,
        isEnabled: true,
        order: 0,
      },
      update: {},
    });

    await prisma.botChannel.upsert({
      where: { id: testChannelBId },
      create: {
        id: testChannelBId,
        botId: testBotBId,
        name: "Bot B Channel",
        telegramChatId: "@bot_b_channel",
        inviteLink: "https://t.me/bot_b_channel",
        buttonLabel: "Join B",
        isRequired: true,
        isEnabled: true,
        order: 0,
      },
      update: {},
    });

    // Create uploads directory and a dummy test image fixture
    if (!fs.existsSync(UPLOADS_POSTS_DIR)) {
      fs.mkdirSync(UPLOADS_POSTS_DIR, { recursive: true });
    }
    fs.writeFileSync(testImagePath, Buffer.from("fake-jpeg-binary-content"));
  });

  afterAll(async () => {
    // Clean up isolated test bot records and fixtures
    const testBotIds = [testBotAId, testBotBId];
    await prisma.channelPost.deleteMany({ where: { botId: { in: testBotIds } } });
    await prisma.botChannel.deleteMany({ where: { botId: { in: testBotIds } } });
    await prisma.auditLog.deleteMany({ where: { botId: { in: testBotIds } } });
    await prisma.bot.deleteMany({ where: { id: { in: testBotIds } } });

    if (fs.existsSync(testImagePath)) {
      try {
        fs.unlinkSync(testImagePath);
      } catch {
        // Ignore
      }
    }
    await prisma.$disconnect();
  });

  describe("Validation Logic", () => {
    it("validates text content within Telegram limits", () => {
      expect(validatePostContent("TEXT", "Hello Telegram Channel!")).toBe("Hello Telegram Channel!");
      expect(() => validatePostContent("TEXT", "")).toThrow("Post text content is required");
      expect(() => validatePostContent("TEXT", "   ")).toThrow("Post text content is required");
      expect(() => validatePostContent("TEXT", "a".repeat(4097))).toThrow("exceeds Telegram limit of 4096");
    });

    it("validates image caption limits", () => {
      expect(validatePostContent("IMAGE", "Photo Caption")).toBe("Photo Caption");
      expect(validatePostContent("IMAGE", "")).toBe("");
      expect(() => validatePostContent("IMAGE", "a".repeat(1025))).toThrow("exceeds Telegram limit of 1024");
    });

    it("validates inline URL buttons and rejects unsafe schemes", () => {
      const valid = [
        { label: "Website", url: "https://example.com/news", order: 1 },
        { label: "Community", url: "tg://resolve?domain=mychannel", order: 0 },
      ];
      const res = validateInlineUrlButtons(valid);
      expect(res).toHaveLength(2);
      expect(res[0].label).toBe("Community"); // Sorted by order
      expect(res[1].label).toBe("Website");

      expect(() => validateInlineUrlButtons([{ label: "", url: "https://example.com", order: 0 }])).toThrow("must have a non-empty label");
      expect(() => validateInlineUrlButtons([{ label: "A".repeat(65), url: "https://example.com", order: 0 }])).toThrow("exceeds the maximum length of 64 characters");
      expect(() => validateInlineUrlButtons([{ label: "Bad", url: "javascript:alert(1)", order: 0 }])).toThrow("must be a secure HTTPS link or Telegram link");
      expect(() => validateInlineUrlButtons([{ label: "Bad", url: "data:text/html,bad", order: 0 }])).toThrow("must be a secure HTTPS link or Telegram link");
    });

    it("validates image upload file types and size limits", () => {
      expect(() => validateImageUpload("image/jpeg", 1024 * 1024)).not.toThrow();
      expect(() => validateImageUpload("image/png", 2 * 1024 * 1024)).not.toThrow();
      expect(() => validateImageUpload("image/webp", 500 * 1024)).not.toThrow();

      expect(() => validateImageUpload("application/pdf", 1000)).toThrow("Unsupported image type");
      expect(() => validateImageUpload("image/gif", 1000)).toThrow("Unsupported image type");
      expect(() => validateImageUpload("image/png", 6 * 1024 * 1024)).toThrow("exceeds the local MVP limit of 5 MB");
    });
  });

  describe("Draft Creation & Bot Scoping", () => {
    it("creates a draft text post with inline buttons scoped to bot and channel", async () => {
      const post = await createDraftPost({
        botId: testBotAId,
        channelId: testChannelAId,
        postType: "TEXT",
        content: "Announcing our new feature!",
        buttons: [{ label: "Read More", url: "https://example.com/feature", order: 0 }],
      });

      expect(post.id).toBeDefined();
      expect(post.botId).toBe(testBotAId);
      expect(post.channelId).toBe(testChannelAId);
      expect(post.status).toBe("DRAFT");
      expect(post.content).toBe("Announcing our new feature!");
      expect(post.buttonsConfig).toHaveLength(1);

      // Verify in database
      const fetched = await getChannelPosts(testBotAId, testChannelAId);
      expect(fetched.some((p) => p.id === post.id)).toBe(true);

      // Verify Bot B cannot see Bot A's post
      const botBPosts = await getChannelPosts(testBotBId);
      expect(botBPosts.some((p) => p.id === post.id)).toBe(false);
    });

    it("rejects creating a post for Bot A targeting Bot B's channel", async () => {
      await expect(
        createDraftPost({
          botId: testBotAId,
          channelId: testChannelBId, // Channel belongs to Bot B
          postType: "TEXT",
          content: "Cross-bot attempt",
        })
      ).rejects.toThrow("does not belong to bot");
    });

    it("updates and deletes a draft post cleanly", async () => {
      const draft = await createDraftPost({
        botId: testBotAId,
        channelId: testChannelAId,
        postType: "TEXT",
        content: "Draft to be modified",
      });

      const updated = await updateDraftPost({
        id: draft.id,
        botId: testBotAId,
        channelId: testChannelAId,
        postType: "TEXT",
        content: "Draft has been updated!",
      });

      expect(updated.content).toBe("Draft has been updated!");

      // Delete draft
      const del = await deletePost(draft.id, testBotAId);
      expect(del.success).toBe(true);

      const check = await prisma.channelPost.findUnique({ where: { id: draft.id } });
      expect(check).toBeNull();
    });

    it("creates a single-image draft with local media reference", async () => {
      const draft = await createDraftPost({
        botId: testBotAId,
        channelId: testChannelAId,
        postType: "IMAGE",
        content: "Caption for test photo",
        mediaPath: "test-fixture-image.jpg",
        mediaOriginalName: "test-fixture-image.jpg",
        mediaMimeType: "image/jpeg",
        mediaSizeBytes: 26,
      });

      expect(draft.postType).toBe("IMAGE");
      expect(draft.mediaPath).toBe("test-fixture-image.jpg");
      expect(draft.content).toBe("Caption for test photo");

      await deletePost(draft.id, testBotAId);
    });
  });

  describe("Publishing Engine & Telegram Dispatch (Mocked Telegram API)", () => {
    it("publishes text post with inline buttons and records messageId", async () => {
      const post = await createDraftPost({
        botId: testBotAId,
        channelId: testChannelAId,
        postType: "TEXT",
        content: "Official Telegram announcement!",
        buttons: [{ label: "Visit Site", url: "https://example.com", order: 0 }],
      });

      let sentChatId = "";
      let sentText = "";
      let sentMarkup: any = null;

      const mockApi = {
        sendMessage: async (chatId: string, text: string, options: any) => {
          sentChatId = chatId;
          sentText = text;
          sentMarkup = options?.reply_markup;
          return { message_id: 12345 };
        },
      };

      const result = await publishChannelPost(post.id, testBotAId, undefined, mockApi);

      expect(result.success).toBe(true);
      expect(result.status).toBe("PUBLISHED");
      expect(result.messageId).toBe(12345);
      expect(sentChatId).toBe("@bot_a_channel");
      expect(sentText).toBe("Official Telegram announcement!");
      expect(sentMarkup).toBeDefined();

      const refreshed = await prisma.channelPost.findUnique({ where: { id: post.id } });
      expect(refreshed?.status).toBe("PUBLISHED");
      expect(refreshed?.telegramMessageId).toBe(12345);
      expect(refreshed?.sentAt).toBeDefined();
    });

    it("prevents duplicate concurrent publishing (Double-submission Guard)", async () => {
      const post = await createDraftPost({
        botId: testBotAId,
        channelId: testChannelAId,
        postType: "TEXT",
        content: "Concurrent test message",
      });

      // Simulate first worker claiming the post
      await prisma.channelPost.update({
        where: { id: post.id },
        data: { status: "SENDING" },
      });

      // Second publish attempt must be rejected
      const mockApi = {
        sendMessage: async () => ({ message_id: 99999 }),
      };

      await expect(
        publishChannelPost(post.id, testBotAId, undefined, mockApi)
      ).rejects.toThrow("already in 'SENDING' status, already 'PUBLISHED'");
    });

    it("records FAILED status on definitive Telegram API errors", async () => {
      const post = await createDraftPost({
        botId: testBotAId,
        channelId: testChannelAId,
        postType: "TEXT",
        content: "Failing test post",
      });

      const mockApi = {
        sendMessage: async () => {
          throw new Error("400 Bad Request: need administrator rights in the channel to post messages");
        },
      };

      const result = await publishChannelPost(post.id, testBotAId, undefined, mockApi);
      expect(result.success).toBe(false);
      expect(result.status).toBe("FAILED");
      expect(result.error).toContain("administrator rights");

      const refreshed = await prisma.channelPost.findUnique({ where: { id: post.id } });
      expect(refreshed?.status).toBe("FAILED");
      expect(refreshed?.lastError).toContain("administrator rights");
    });

    it("records UNKNOWN status on network timeout and does NOT auto-retry", async () => {
      const post = await createDraftPost({
        botId: testBotAId,
        channelId: testChannelAId,
        postType: "TEXT",
        content: "Timeout test post",
      });

      const mockApi = {
        sendMessage: async () => {
          throw new Error("ETIMEDOUT: connect timed out after dispatch");
        },
      };

      const result = await publishChannelPost(post.id, testBotAId, undefined, mockApi);
      expect(result.success).toBe(false);
      expect(result.status).toBe("UNKNOWN");
      expect(result.error).toContain("Network connection timed out");

      const refreshed = await prisma.channelPost.findUnique({ where: { id: post.id } });
      expect(refreshed?.status).toBe("UNKNOWN");
      expect(refreshed?.lastError).toContain("check the channel manually");
    });
  });

  describe("Telegram Channel Permission Check", () => {
    it("reports CAN_POST when bot is administrator with can_post_messages", async () => {
      const mockApi = {
        getChat: async () => ({ title: "Test Chat", username: "testchat" }),
        getMe: async () => ({ id: 111111 }),
        getChatMember: async () => ({
          status: "administrator",
          can_post_messages: true,
        }),
      };

      const result = await checkBotChannelPermissions(testBotAId, testChannelAId, mockApi);
      expect(result.status).toBe("CAN_POST");
      expect(result.canPost).toBe(true);
      expect(result.message).toContain("Post Messages");
    });

    it("reports CANNOT_POST when bot is administrator but can_post_messages is false", async () => {
      const mockApi = {
        getChat: async () => ({ title: "Test Chat", username: "testchat" }),
        getMe: async () => ({ id: 111111 }),
        getChatMember: async () => ({
          status: "administrator",
          can_post_messages: false,
        }),
      };

      const result = await checkBotChannelPermissions(testBotAId, testChannelAId, mockApi);
      expect(result.status).toBe("CANNOT_POST");
      expect(result.canPost).toBe(false);
      expect(result.message).toContain("Disabled");
    });

    it("reports UNKNOWN when Telegram API throws an unexpected network error", async () => {
      const mockApi = {
        getChat: async () => {
          throw new Error("502 Bad Gateway");
        },
        getMe: async () => ({ id: 111111 }),
      };

      const result = await checkBotChannelPermissions(testBotAId, testChannelAId, mockApi);
      expect(result.status).toBe("UNKNOWN");
      expect(result.canPost).toBe(false);
      expect(result.message).toContain("Unknown");
    });
  });

  describe("API Security Guards", () => {
    it("GET /api/bots/[id]/channels/[channelId]/posts rejects unauthenticated requests with 401", async () => {
      const req = new NextRequest("http://127.0.0.1:3000/api/bots/fake/channels/fake/posts");
      const res = await channelPostsGET(req, { params: { id: "fake", channelId: "fake" } });
      expect(res.status).toBe(401);
    });

    it("POST /api/bots/[id]/channels/[channelId]/posts rejects unauthenticated requests with 401", async () => {
      const req = new NextRequest("http://127.0.0.1:3000/api/bots/fake/channels/fake/posts", {
        method: "POST",
        body: JSON.stringify({ content: "test" }),
      });
      const res = await channelPostsPOST(req, { params: { id: "fake", channelId: "fake" } });
      expect(res.status).toBe(401);
    });

    it("PUT /api/posts/[id] rejects unauthenticated requests with 401", async () => {
      const req = new NextRequest("http://127.0.0.1:3000/api/posts/fake", {
        method: "PUT",
        body: JSON.stringify({ content: "test" }),
      });
      const res = await postPUT(req, { params: { id: "fake" } });
      expect(res.status).toBe(401);
    });

    it("POST /api/posts/[id]/publish rejects unauthenticated requests with 401", async () => {
      const req = new NextRequest("http://127.0.0.1:3000/api/posts/fake/publish", {
        method: "POST",
      });
      const res = await publishPOST(req, { params: { id: "fake" } });
      expect(res.status).toBe(401);
    });

    it("POST /api/posts/upload rejects unauthenticated requests with 401", async () => {
      const req = new NextRequest("http://127.0.0.1:3000/api/posts/upload", {
        method: "POST",
      });
      const res = await uploadPOST(req);
      expect(res.status).toBe(401);
    });

    it("GET /api/media/posts/[filename] rejects unauthenticated requests with 401", async () => {
      const req = new NextRequest("http://127.0.0.1:3000/api/media/posts/test.jpg");
      const res = await mediaGET(req, { params: { filename: "test.jpg" } });
      expect(res.status).toBe(401);
    });
  });
});
