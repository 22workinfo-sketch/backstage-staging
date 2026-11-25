import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getUserAssignedBotIds } from "@/lib/permissions";
import { getChannelActivityEvents } from "@/lib/activity-service";
import {
  ChannelActivityPage,
  BotOption,
  ChannelOption,
  AuditLogItem,
} from "@/components/ChannelActivityPage";

export default async function ActivityPage() {
  const session = await getAdminSession();
  if (!session) {
    redirect("/login");
  }

  if (session.mustChangePassword) {
    redirect("/login?changePassword=true");
  }

  const assignedIds = await getUserAssignedBotIds(session);
  const isSuper = session.role === "SUPER_ADMIN";

  const [botsData, channelsData, activityData, rawAuditLogs] = await Promise.all([
    prisma.bot.findMany({
      where: { id: { in: assignedIds }, isActive: true },
      select: { id: true, name: true, username: true },
      orderBy: { name: "asc" },
    }),
    prisma.botChannel.findMany({
      where: { botId: { in: assignedIds }, isEnabled: true },
      select: { id: true, botId: true, name: true, telegramChatId: true },
      orderBy: { name: "asc" },
    }),
    getChannelActivityEvents({
      botIds: assignedIds,
      page: 1,
      limit: 20,
    }),
    prisma.auditLog.findMany({
      where: isSuper
        ? undefined
        : {
            OR: [
              { botId: { in: assignedIds } },
              { adminUserId: session.id },
            ],
          },
      take: 50,
      orderBy: { createdAt: "desc" },
      include: {
        bot: { select: { name: true, username: true } },
        adminUser: { select: { email: true } },
      },
    }),
  ]);

  const bots: BotOption[] = botsData.map((b) => ({
    id: b.id,
    name: b.name,
    username: b.username,
  }));

  const channels: ChannelOption[] = channelsData.map((ch) => ({
    id: ch.id,
    botId: ch.botId,
    name: ch.name,
    telegramChatId: ch.telegramChatId,
  }));

  const auditLogs: AuditLogItem[] = rawAuditLogs.map((log) => ({
    id: log.id,
    action: log.action,
    botName: log.bot?.name || null,
    botUsername: log.bot?.username || null,
    adminEmail: log.adminUser?.email || null,
    createdAt: log.createdAt.toISOString(),
    details: log.details,
  }));

  return (
    <ChannelActivityPage
      bots={bots}
      channels={channels}
      initialEvents={activityData.events}
      initialTotal={activityData.total}
      initialTotalPages={activityData.totalPages}
      auditLogs={auditLogs}
      userRole={session.role}
    />
  );
}
