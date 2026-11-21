import type { Prisma } from "@prisma/client";
import type { AdminSession } from "../auth";
import { prisma } from "../prisma";

export class InboxError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export function inboxBotScope(user: AdminSession): Prisma.BotWhereInput {
  if (user.mustChangePassword) throw new InboxError(403, "Change your initial password first.");
  if (user.role === "SUPER_ADMIN") return { isActive: true };
  if (user.role === "ADMIN" || user.role === "SUPPORT_AGENT") {
    return { isActive: true, supportInboxEnabled: true, staffAssignments: { some: { userId: user.id } } };
  }
  throw new InboxError(403, "Support inbox access is required.");
}

export async function requireInboxBot(user: AdminSession, botId: string) {
  const bot = await prisma.bot.findFirst({
    where: { ...inboxBotScope(user), id: botId, supportInboxEnabled: true }, select: { id: true },
  });
  if (!bot) throw new InboxError(404, "Inbox unavailable.");
}

export function listInboxBots(user: AdminSession) {
  return prisma.bot.findMany({
    where: inboxBotScope(user), select: { id: true, name: true, username: true, supportInboxEnabled: true },
    orderBy: { name: "asc" },
  });
}
