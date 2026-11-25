import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/auth";
import { getAllBots, getBotButtons } from "@/lib/bot-service";
import { getUserAssignedBotIds } from "@/lib/permissions";
import { BotdeskMenuPage, BotOption } from "@/components/BotdeskMenuPage";
import { BotButtonDTO } from "@/components/MenuBuilder";

export default async function MenuPage() {
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
    welcomeMessage: b.config?.welcomeMessage,
  }));

  const buttonsByBot: Record<string, BotButtonDTO[]> = {};
  await Promise.all(
    rawBots.map(async (bot) => {
      const rawButtons = await getBotButtons(bot.id);
      buttonsByBot[bot.id] = rawButtons.map((btn) => ({
        id: btn.id,
        label: btn.label,
        actionType: btn.actionType,
        replyText: btn.replyText,
        autoDeleteReply: btn.autoDeleteReply,
        deleteAfterSeconds: btn.deleteAfterSeconds,
        isEnabled: btn.isEnabled,
        order: btn.order,
      }));
    })
  );

  const initialBotId = rawBots[0].id;

  return (
    <BotdeskMenuPage
      bots={botsOptions}
      initialBotId={initialBotId}
      initialButtonsByBot={buttonsByBot}
    />
  );
}
