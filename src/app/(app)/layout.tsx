import { redirect } from "next/navigation";
import { getStaffSession } from "@/lib/auth";
import { BotdeskLayout } from "@/components/BotdeskLayout";

export default async function AuthenticatedAppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getStaffSession();
  if (!session) {
    redirect("/login");
  }

  if (session.mustChangePassword) {
    redirect("/login?changePassword=true");
  }

  return (
    <BotdeskLayout userEmail={session.email} role={session.role}>
      {children}
    </BotdeskLayout>
  );
}
