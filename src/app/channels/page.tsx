import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/auth";
import { getAllBots } from "@/lib/bot-service";
import { getBotChannels, ChannelInput } from "@/lib/channel-service";
import { BotdeskLayout } from "@/components/BotdeskLayout";
import { BotdeskChannelsPage, BotOption } from "@/components/BotdeskChannelsPage";

export default async function ChannelsPage() {
  const session = await getAdminSession();
  if (!session) {
    redirect("/login");
  }

  const rawBots = await getAllBots();
  if (rawBots.length === 0) {
    redirect("/dashboard");
  }

  const botsOptions: BotOption[] = rawBots.map((b) => ({
    id: b.id,
    name: b.name,
    username: b.username,
  }));

  const channelsByBot: Record<string, ChannelInput[]> = {};
  for (const bot of rawBots) {
    const rawChannels = await getBotChannels(bot.id);
    channelsByBot[bot.id] = rawChannels.map((ch) => ({
      id: ch.id,
      name: ch.name,
      telegramChatId: ch.telegramChatId,
      inviteLink: ch.inviteLink,
      buttonLabel: ch.buttonLabel,
      isRequired: ch.isRequired,
      isEnabled: ch.isEnabled,
      order: ch.order,
    }));
  }

  const initialBotId = rawBots[0].id;

  return (
    <BotdeskLayout
      userEmail={session.email}
      role={session.role}
      activeNav="channels"
      breadcrumb="Channels"
    >
      <BotdeskChannelsPage
        bots={botsOptions}
        initialBotId={initialBotId}
        initialChannelsByBot={channelsByBot}
      />
    </BotdeskLayout>
  );
}
