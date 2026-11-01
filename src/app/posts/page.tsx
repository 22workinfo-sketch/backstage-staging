import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/auth";
import { getAllBots } from "@/lib/bot-service";
import { getBotChannels } from "@/lib/channel-service";
import { getChannelPosts } from "@/lib/post-service";
import { BotdeskLayout } from "@/components/BotdeskLayout";
import {
  BotdeskPostsPage,
  BotOption,
  ChannelOption,
  PostItemDTO,
} from "@/components/BotdeskPostsPage";

export default async function ChannelPostsPage() {
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

  const channelsByBot: Record<string, ChannelOption[]> = {};
  for (const bot of rawBots) {
    const rawChannels = await getBotChannels(bot.id);
    channelsByBot[bot.id] = rawChannels.map((c) => ({
      id: c.id,
      botId: c.botId,
      name: c.name,
      telegramChatId: c.telegramChatId,
    }));
  }

  const initialBotId = rawBots[0].id;
  const rawPosts = await getChannelPosts(initialBotId);

  const initialPosts: PostItemDTO[] = rawPosts.map((p) => ({
    id: p.id,
    botId: p.botId,
    channelId: p.channelId,
    channelName: p.channel?.name,
    channelChatId: p.channel?.telegramChatId,
    postType: p.postType as "TEXT" | "IMAGE",
    content: p.content,
    mediaPath: p.mediaPath,
    mediaOriginalName: p.mediaOriginalName,
    mediaMimeType: p.mediaMimeType,
    mediaSizeBytes: p.mediaSizeBytes,
    buttonsConfig: (p.buttonsConfig as any) || [],
    status: p.status as "DRAFT" | "SENDING" | "PUBLISHED" | "FAILED" | "UNKNOWN",
    telegramMessageId: p.telegramMessageId,
    lastError: p.lastError,
    sentAt: p.sentAt ? p.sentAt.toISOString() : null,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  }));

  return (
    <BotdeskLayout
      userEmail={session.email}
      role={session.role}
      activeNav="posts"
      breadcrumb="Channel posts"
    >
      <BotdeskPostsPage
        bots={botsOptions}
        initialBotId={initialBotId}
        channelsByBot={channelsByBot}
        initialPosts={initialPosts}
      />
    </BotdeskLayout>
  );
}
