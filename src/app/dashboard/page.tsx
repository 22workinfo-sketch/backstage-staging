import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/auth";
import { getAllBots, getBotUsers } from "@/lib/bot-service";
import { BotdeskLayout } from "@/components/BotdeskLayout";
import { BotdeskDashboard, BotData, TelegramUserData } from "@/components/BotdeskDashboard";

export default async function DashboardPage() {
  const session = await getAdminSession();
  if (!session) {
    redirect("/login");
  }

  const rawBots = await getAllBots();

  // Prepare users for each bot strictly isolated
  const usersByBot: Record<string, TelegramUserData[]> = {};
  for (const bot of rawBots) {
    const rawUsers = await getBotUsers(bot.id);
    usersByBot[bot.id] = rawUsers.map((u) => ({
      id: u.id,
      telegramId: u.telegramId.toString(),
      firstName: u.firstName,
      lastName: u.lastName,
      username: u.username,
      telegramPhNo: u.telegramPhNo,
      firstSeenAt: u.firstSeenAt.toISOString(),
      lastSeenAt: u.lastSeenAt.toISOString(),
    }));
  }

  const botsData: BotData[] = rawBots.map((b) => ({
    id: b.id,
    name: b.name,
    username: b.username,
    isActive: b.isActive,
    tokenEnvVar: b.tokenEnvVar,
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
    <BotdeskLayout
      userEmail={session.email}
      role={session.role}
      activeNav="bots"
      breadcrumb="Bots"
    >
      <BotdeskDashboard bots={botsData} initialUsersByBot={usersByBot} />
    </BotdeskLayout>
  );
}
