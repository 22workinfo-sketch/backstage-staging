import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/auth";
import { getAllBots } from "@/lib/bot-service";
import { getBotChannels } from "@/lib/channel-service";
import { getChannelPosts } from "@/lib/post-service";
import { getUserAssignedBotIds } from "@/lib/permissions";
import { runSchedulerCycle } from "@/worker/scheduler-worker";
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

  if (session.mustChangePassword) {
    redirect("/login?changePassword=true");
  }

  const [assignedIds, allBots] = await Promise.all([
    getUserAssignedBotIds(session),
    getAllBots(),
  ]);
  const rawBots = allBots.filter((b) => assignedIds.includes(b.id));

  if (rawBots.length === 0) {
    redirect("/dashboard");
  }

  const botsOptions: BotOption[] = rawBots.map((b) => ({
    id: b.id,
    name: b.name,
    username: b.username,
  }));

  const channelsByBot: Record<string, ChannelOption[]> = {};
  const initialBotId = rawBots[0].id;

  // Trigger opportunistic scheduler check & load channels in parallel
  const [, rawPosts] = await Promise.all([
    Promise.all(
      rawBots.map(async (bot) => {
        const rawChannels = await getBotChannels(bot.id);
        channelsByBot[bot.id] = rawChannels.map((c) => ({
          id: c.id,
          botId: c.botId,
          name: c.name,
          telegramChatId: c.telegramChatId,
        }));
      })
    ),
    runSchedulerCycle()
      .catch(() => {})
      .then(() => getChannelPosts(initialBotId)),
  ]);

  const initialPosts: PostItemDTO[] = rawPosts.map((p) => ({
    id: p.id,
    botId: p.botId,
    channelId: p.channelId,
    channelName: p.channel?.name,
    channelChatId: p.channel?.telegramChatId,
    postType: p.postType as "TEXT" | "IMAGE" | "VIDEO" | "ALBUM" | "TELEGRAM_VIDEO",
    content: p.content,
    mediaPath: p.mediaPath,
    mediaOriginalName: p.mediaOriginalName,
    mediaMimeType: p.mediaMimeType,
    mediaSizeBytes: p.mediaSizeBytes != null ? Number(p.mediaSizeBytes) : null,
    albumItems: (p.albumItems || []).map((item) => ({
      id: item.id,
      mediaType: item.mediaType as "IMAGE" | "VIDEO",
      filePath: item.filePath,
      originalName: item.originalName,
      mimeType: item.mimeType,
      sizeBytes: item.sizeBytes != null ? Number(item.sizeBytes) : null,
      order: item.order,
      hasSpoiler: item.hasSpoiler,
    })),
    buttonsConfig: (p.buttonsConfig as any) || [],
    disableNotification: p.disableNotification,
    hasSpoiler: p.hasSpoiler,
    sendAsDocument: p.sendAsDocument,
    status: p.status as
      | "DRAFT"
      | "SCHEDULED"
      | "SENDING"
      | "PUBLISHED"
      | "FAILED"
      | "UNKNOWN"
      | "PARTIAL",
    scheduledAt: p.scheduledAt ? p.scheduledAt.toISOString() : null,
    scheduledTimezone: p.scheduledTimezone || null,
    scheduledByUserId: p.scheduledByUserId || null,
    telegramMessageId: p.telegramMessageId,
    albumMessageIds: (p.albumMessageIds as number[]) || null,
    buttonMessageId: p.buttonMessageId,
    lastError: p.lastError,
    sentAt: p.sentAt ? p.sentAt.toISOString() : null,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  }));

  return (
    <BotdeskPostsPage
      bots={botsOptions}
      initialBotId={initialBotId}
      channelsByBot={channelsByBot}
      initialPosts={initialPosts}
    />
  );
}
