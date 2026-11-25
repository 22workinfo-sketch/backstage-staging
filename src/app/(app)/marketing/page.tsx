import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getUserAssignedBotIds } from "@/lib/permissions";
import {
  getMarketingOverviewMetrics,
  getAudienceList,
  getMarketingCampaigns,
} from "@/lib/marketing-service";
import {
  MarketingDashboard,
  BotOption,
  ChannelOption,
} from "@/components/marketing/MarketingDashboard";

export default async function MarketingPage() {
  const session = await getAdminSession();
  if (!session) {
    redirect("/login");
  }

  if (session.mustChangePassword) {
    redirect("/login?changePassword=true");
  }

  const assignedIds = await getUserAssignedBotIds(session);

  const [botsData, channelsData, initialMetrics, audienceData, initialCampaigns] =
    await Promise.all([
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
      getMarketingOverviewMetrics({
        botIds: assignedIds,
        dateRange: "all",
      }),
      getAudienceList({
        botIds: assignedIds,
        page: 1,
        limit: 20,
      }),
      getMarketingCampaigns(assignedIds),
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

  return (
    <MarketingDashboard
      bots={bots}
      channels={channels}
      initialMetrics={initialMetrics}
      initialAudience={audienceData.audience}
      initialAudienceTotal={audienceData.total}
      initialAudiencePages={audienceData.totalPages}
      initialCampaigns={initialCampaigns}
      userRole={session.role}
    />
  );
}
