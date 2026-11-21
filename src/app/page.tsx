import { redirect } from "next/navigation";
import { getStaffSession } from "@/lib/auth";

export default async function HomePage() {
  const session = await getStaffSession();
  if (session) {
    redirect(session.role === "SUPPORT_AGENT" ? "/inbox" : "/dashboard");
  } else {
    redirect("/login");
  }
}
