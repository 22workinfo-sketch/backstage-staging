import { redirect } from "next/navigation";
import { getStaffSession } from "@/lib/auth";
import { getAllBots, getBotUsers } from "@/lib/bot-service";
import { getUserAssignedBotIds, canUserViewPhoneNumbers } from "@/lib/permissions";
import { BotdeskDashboard, BotData, TelegramUserData } from "@/components/BotdeskDashboard";

export default async function DashboardPage() {
  const session = await getStaffSession();
  if (!session) {
    redirect("/login");
  }

  if (session.mustChangePassword) {
    redirect("/login?changePassword=true");
  }

  if (session.role === "SUPPORT_AGENT") redirect("/inbox");

  // Filter bots strictly to assigned resources
  const [assignedBotIds, allBots] = await Promise.all([
    getUserAssignedBotIds(session),
    getAllBots(),
  ]);
  const rawBots = allBots.filter((b) => assignedBotIds.includes(b.id));

  // Prepare users for each assigned bot strictly isolated (in parallel)
  const usersByBot: Record<string, TelegramUserData[]> = {};
  await Promise.all(
    rawBots.map(async (bot) => {
      const [rawUsers, allowPhone] = await Promise.all([
        getBotUsers(bot.id),
        canUserViewPhoneNumbers(session, bot.id),
      ]);

      usersByBot[bot.id] = rawUsers.map((u) => ({
        id: u.id,
        telegramId: u.telegramId.toString(),
        firstName: u.firstName,
        lastName: u.lastName,
        username: u.username,
        telegramPhNo: allowPhone ? u.telegramPhNo : u.telegramPhNo ? "[REDACTED]" : null,
        firstSeenAt: u.firstSeenAt.toISOString(),
        lastSeenAt: u.lastSeenAt.toISOString(),
      }));
    })
  );

  const botsData: BotData[] = rawBots.map((b) => ({
    id: b.id,
    name: b.name,
    username: b.username,
    telegramBotId: b.telegramBotId != null ? b.telegramBotId.toString() : null,
    isActive: b.isActive,
    tokenEnvVar: b.tokenEnvVar,
    hasStoredToken: Boolean(b.encryptedToken),
    tokenLast4: b.tokenLast4 || (b.encryptedToken ? "••••" : null),
    description: b.description ?? null,
    connectionStatus: b.connectionStatus || (b.isActive ? "STANDBY" : "DISCONNECTED"),
    lastError: b.lastError ?? null,
    lastCheckedAt: b.lastCheckedAt ? b.lastCheckedAt.toISOString() : null,
    createdAt: b.createdAt.toISOString(),
    config: b.config
      ? {
          welcomeMessage: b.config.welcomeMessage,
        }
      : null,
    _count: {
      users: b._count.users,
    },
  }));

  return (
    <BotdeskDashboard
      bots={botsData}
      initialUsersByBot={usersByBot}
      isSuperAdmin={session.role === "SUPER_ADMIN"}
    />
  );
}
