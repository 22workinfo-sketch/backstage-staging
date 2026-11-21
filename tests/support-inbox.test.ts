import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { prisma } from "../src/lib/prisma";
import { COOKIE_NAME, createSessionToken, type AdminSession } from "../src/lib/auth";
import { POST as receiveWebhook } from "../src/app/api/telegram/webhook/[botId]/route";
import * as telegram from "../src/lib/telegram-client";
import { createTelegramBot } from "../src/lib/bot-handlers";
import { splitReply } from "../src/lib/inbox/text";
import { receiveSupportUpdate } from "../src/lib/inbox/receive";
import { listInboxBots } from "../src/lib/inbox/access";
import { changeThread, listThreads, queueReply, readThread } from "../src/lib/inbox/threads";
import { deliverInboxReplies } from "../src/lib/inbox/delivery";
import { GET as management } from "../src/app/api/bots/route";
import { GET as inboxList, PUT as setMode } from "../src/app/api/inbox/[botId]/route";
import { GET as download } from "../src/app/api/inbox/[botId]/[threadId]/files/[id]/route";
import { POST as postReply } from "../src/app/api/inbox/[botId]/[threadId]/route";

function update(id: number, text: string, chat = 91) {
  return { update_id: id, message: { message_id: id, date: 1700000000 + id,
    chat: { id: chat, first_name: "Customer", type: "private" as const },
    from: { id: chat, first_name: "Customer", is_bot: false }, text } };
}
describe("Telegram support inbox", () => {
  let botId: string, otherId: string;
  let agent: AdminSession, colleague: AdminSession;
  const priorToken = process.env.INBOX_TEST_TOKEN;
  beforeEach(async () => {
    process.env.INBOX_TEST_TOKEN = "1234:inbox_test_only";
    const createBot = () => prisma.bot.create({ data: { name: "Support", username: randomUUID(), supportInboxEnabled: true, tokenEnvVar: "INBOX_TEST_TOKEN" } });
    [botId, otherId] = (await Promise.all([createBot(), createBot()])).map(b => b.id);
    const staff = () => prisma.adminUser.create({ data: { email: randomUUID() + "@local.test", passwordHash: "fixture", role: "SUPPORT_AGENT",
      staffAssignments: { create: { botId } } } });
    [agent, colleague] = await Promise.all([staff(), staff()]);
  });
  afterEach(async () => {
    await prisma.bot.deleteMany({ where: { id: { in: [botId, otherId] } } });
    await prisma.adminUser.deleteMany({ where: { id: { in: [agent.id, colleague.id] } } });
    if (priorToken === undefined) delete process.env.INBOX_TEST_TOKEN;
    else process.env.INBOX_TEST_TOKEN = priorToken;
  });
  async function openThread() {
    await receiveSupportUpdate(botId, update(1, "Hello _world*"));
    return (await listThreads(agent, botId, new URLSearchParams())).items[0].id;
  }
  async function req(user: AdminSession, method = "GET", payload?: object) {
    return new NextRequest("http://localhost:3000/api/inbox/" + botId, { method,
      headers: { cookie: COOKIE_NAME + "=" + await createSessionToken(user), host: "localhost:3000", origin: "http://localhost:3000", "content-type": "application/json" },
      body: payload ? JSON.stringify(payload) : undefined });
  }
  it("preserves Burmese, literal markup and joined emoji at the Telegram boundary", () => {
    const group = "👩🏽‍💻";
    const text = "x".repeat(4095) + group + "\nမင်္ဂလာပါ _email_* ".repeat(500);
    const parts = splitReply(text);
    expect(parts[1].startsWith(group)).toBe(true);
    expect(parts.join("")).toBe(text);
    expect(parts.every(p => p.length > 0 && p.length <= 4096)).toBe(true);
    expect(splitReply("x".repeat(4096))).toHaveLength(1);
    const pathological = "a" + "\u0301".repeat(5000);
    expect(splitReply(pathological).join("")).toBe(pathological);
  });
  it("captures only opted-in private chats, including /start before flow handlers", async () => {
    const bot = createTelegramBot("1234:fixture", botId);
    const unexpectedApi = vi.fn(async () => { throw new Error("Unexpected automatic reply"); });
    bot.api.config.use(unexpectedApi);
    await bot.handleUpdate(update(1, "/start"));
    expect(unexpectedApi).not.toHaveBeenCalled();
    expect((await listThreads(agent, botId, new URLSearchParams())).items[0].preview).toBe("/start");
    const group = { ...update(2, "group").message, chat: { id: -123, title: "Group", type: "group" as const } };
    expect(await receiveSupportUpdate(botId, { update_id: 2, message: group })).toBe(false);
    await prisma.bot.update({ where: { id: botId }, data: { supportInboxEnabled: false } });
    expect(await receiveSupportUpdate(botId, update(3, "normal flow"))).toBe(false);
  });
  it("deduplicates concurrent updates, orders edits, and isolates matching Telegram IDs across bots", async () => {
    await Promise.all([receiveSupportUpdate(botId, update(1, "old")), receiveSupportUpdate(botId, update(1, "old"))]);
    const edited = { ...update(1, "edited").message, edit_date: 1700000010 };
    await receiveSupportUpdate(botId, { update_id: 4, edited_message: edited });
    await receiveSupportUpdate(botId, { update_id: 3, edited_message: { ...edited, text: "stale" } });
    await receiveSupportUpdate(otherId, update(1, "private to another bot"));
    const { items } = await listThreads(agent, botId, new URLSearchParams());
    const thread = await readThread(agent, botId, items[0].id, null);
    expect(thread.messages.map(m => m.body)).toEqual(["edited"]);
    expect((await listInboxBots(agent)).map(b => b.id)).toEqual([botId]);
    await expect(readThread(agent, otherId, items[0].id, null)).rejects.toMatchObject({ status: 404 });
  });
  it("denies management, other bots, foreign attachments, cross-origin writes, and revoked staff", async () => {
    const id = await openThread();
    expect((await management(await req(agent))).status).toBe(401);
    expect((await inboxList(await req(agent), { params: { botId: otherId } })).status).toBe(404);
    expect((await setMode(await req(agent, "PUT", { enabled: true }), { params: { botId } })).status).toBe(403);
    expect((await download(await req(agent), { params: { botId: otherId, threadId: id, id: "1" } })).status).toBe(404);
    const forgedOrigin = await req(agent, "POST", { body: "hello", clientKey: randomUUID() });
    forgedOrigin.headers.set("origin", "https://foreign.invalid");
    expect((await postReply(forgedOrigin, { params: { botId, threadId: id } })).status).toBe(403);
    await prisma.adminUser.update({ where: { id: agent.id }, data: { mustChangePassword: true } });
    expect((await inboxList(await req(agent), { params: { botId } })).status).toBe(403);
    await prisma.adminUser.update({ where: { id: agent.id }, data: { isActive: false } });
    expect((await inboxList(await req(agent), { params: { botId } })).status).toBe(401);
  });
  it("accepts a Telegram webhook replay and delivers a staff reply as literal Bot API text", async () => {
    vi.stubEnv("TELEGRAM_MODE", "webhook");
    vi.stubEnv("TELEGRAM_WEBHOOK_SECRET", "local-inbox-webhook-secret");
    const webhook = () => new NextRequest("http://localhost:3000/api/telegram/webhook/" + botId, {
      method: "POST", headers: { "x-telegram-bot-api-secret-token": "local-inbox-webhook-secret" },
      body: JSON.stringify(update(41, "Can I use help_desk@example.test?")),
    });
    try {
      expect((await receiveWebhook(webhook(), { params: { botId } })).status).toBe(200);
      const duplicate = await receiveWebhook(webhook(), { params: { botId } });
      expect(await duplicate.json()).toMatchObject({ duplicate: true });
      const { items } = await listThreads(agent, botId, new URLSearchParams());
      const text = "မင်္ဂလာပါ _help_desk@example.test_*";
      const reply = await postReply(await req(agent, "POST", { body: text, clientKey: randomUUID() }),
        { params: { botId, threadId: items[0].id } });
      expect(reply.status).toBe(202);
      const api = telegram.createTelegramApi("1234:fixture");
      const send = vi.spyOn(api, "sendMessage").mockResolvedValue(update(42, text).message);
      vi.spyOn(telegram, "createTelegramApi").mockReturnValue(api);
      await deliverInboxReplies();
      expect(send).toHaveBeenCalledExactlyOnceWith("91", text);
      const thread = await readThread(agent, botId, items[0].id, null);
      expect(thread.messages.map(m => m.status)).toEqual(["RECEIVED", "SENT"]);
    } finally {
      vi.restoreAllMocks();
      vi.unstubAllEnvs();
      await prisma.telegramUpdateLog.deleteMany({ where: { botId } });
    }
  });
  it("atomically claims chats, reuses reply keys and releases ownership", async () => {
    const id = await openThread(), key = randomUUID();
    const pair = await Promise.all([queueReply(agent, botId, id, "Hello", key), queueReply(agent, botId, id, "Hello", key)]);
    expect(pair[0]).toEqual(pair[1]);
    await expect(queueReply(agent, botId, id, "Different", key)).rejects.toMatchObject({ status: 409 });
    await expect(queueReply(colleague, botId, id, "Hi", randomUUID())).rejects.toMatchObject({ status: 409 });
    await changeThread(agent, botId, id, "release");
    await queueReply(colleague, botId, id, "Hi", randomUUID());
    await changeThread(colleague, botId, id, "resolve");
    expect((await listThreads(agent, botId, new URLSearchParams())).items).toHaveLength(0);
    await receiveSupportUpdate(botId, update(2, "Still need help"));
    expect((await readThread(colleague, botId, id, null)).resolved).toBe(false);
  });
  it("sends plain parts in order and resumes at the unconfirmed part after a rate limit", async () => {
    const id = await openThread();
    const text = "မင်္ဂလာပါ _hello_* ".repeat(300);
    const { id: receipt } = await queueReply(agent, botId, id, text, randomUUID());
    await queueReply(agent, botId, id, "next", randomUUID());
    const parts = splitReply(text), delivered: string[] = [];
    let limited = true;
    const send = async (_token: string, _chat: string, part: string) => {
      if (delivered.length === 1 && limited) { limited = false; throw { error_code: 429, parameters: { retry_after: 3 } }; }
      delivered.push(part); return { message_id: delivered.length + 50 };
    };
    await Promise.all([deliverInboxReplies(send), deliverInboxReplies(send)]);
    expect(delivered).toEqual([parts[0]]);
    const where = { id: BigInt(receipt) };
    await prisma.supportMessage.update({ where, data: { availableAt: new Date(0) } });
    await deliverInboxReplies(send);
    const pending = await prisma.supportMessage.findUniqueOrThrow({ where });
    expect(pending.sentParts).toBe(1); expect(pending.availableAt.getTime()).toBeGreaterThan(Date.now());
    await prisma.supportMessage.update({ where, data: { availableAt: new Date(0) } });
    await deliverInboxReplies(send);
    expect(delivered).toEqual([...parts, "next"]);
    expect((await readThread(agent, botId, id, null)).messages.at(-1)?.status).toBe("SENT");
  });
  it("leaves ambiguous delivery for review, blocks later parts and permits explicit recovery", async () => {
    const id = await openThread();
    const first = await queueReply(agent, botId, id, "first", randomUUID());
    await queueReply(agent, botId, id, "second", randomUUID());
    const send = vi.fn(async () => { throw new Error("lost response"); });
    await deliverInboxReplies(send); await deliverInboxReplies(send);
    expect(send).toHaveBeenCalledTimes(1);
    expect((await readThread(agent, botId, id, null)).messages[1].status).toBe("UNCERTAIN");
    await changeThread(agent, botId, id, "cancel", first.id);
    const ok = vi.fn(async () => ({ message_id: 82 }));
    await deliverInboxReplies(ok); expect(ok.mock.calls).toHaveLength(1);
  }, 60000);
  it("recovers an expired claim and rechecks staff access before dispatch", async () => {
    const id = await openThread();
    const receipt = await queueReply(agent, botId, id, "hello", randomUUID());
    await prisma.supportMessage.update({ where: { id: BigInt(receipt.id) }, data: { status: "SENDING", availableAt: new Date(0) } });
    const send = vi.fn(async () => ({ message_id: 31 }));
    await deliverInboxReplies(send);
    await changeThread(agent, botId, id, "retry", receipt.id);
    await prisma.staffBotAssignment.deleteMany({ where: { userId: agent.id, botId } });
    await deliverInboxReplies(send); expect(send).not.toHaveBeenCalled();
    expect((await readThread(colleague, botId, id, null)).messages.at(-1)?.status).toBe("CANCELLED");
  });
  it("pages earlier history after reconnect, including attachment metadata", async () => {
    const id = await openThread();
    for (let i = 2; i <= 42; i++) await receiveSupportUpdate(botId, update(i, "message " + i));
    const { text: _unused, ...msg } = update(43, "").message;
    await receiveSupportUpdate(botId, { update_id: 43, message: { ...msg, document: {
      file_id: "private-fixture", file_unique_id: "fixture", file_name: "receipt.pdf" } } });
    const recent = await readThread(agent, botId, id, null);
    expect(recent.hasOlder).toBe(true);
    expect(recent.messages.at(-1)?.attachmentName).toBe("receipt.pdf");
    const older = await readThread(agent, botId, id, recent.messages[0].id);
    expect(older.messages).toHaveLength(3);
    expect(JSON.stringify(recent)).not.toContain("private-fixture");
  }, 60000);
});
