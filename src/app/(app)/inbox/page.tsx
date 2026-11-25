import { redirect } from "next/navigation";
import { SupportInbox } from "@/components/inbox/SupportInbox";
import { getStaffSession } from "@/lib/auth";
import { listInboxBots } from "@/lib/inbox/access";
import "./inbox.css";

export const dynamic = "force-dynamic";

export default async function InboxPage() {
  const user = await getStaffSession();
  if (!user) redirect("/login");
  if (user.mustChangePassword) redirect("/login?changePassword=true");
  if (!["SUPER_ADMIN", "ADMIN", "SUPPORT_AGENT"].includes(user.role)) redirect("/dashboard");
  const bots = await listInboxBots(user);
  return <SupportInbox initialBots={bots} userId={user.id} role={user.role} />;
}
