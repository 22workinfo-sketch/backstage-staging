import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { BotdeskLayout } from "@/components/BotdeskLayout";

export default async function ActivityPage() {
  const session = await getAdminSession();
  if (!session) {
    redirect("/login");
  }

  // Fetch real audit logs from PostgreSQL
  const logs = await prisma.auditLog.findMany({
    take: 50,
    orderBy: { createdAt: "desc" },
    include: {
      bot: { select: { name: true, username: true } },
      adminUser: { select: { email: true } },
    },
  });

  return (
    <BotdeskLayout
      userEmail={session.email}
      role={session.role}
      activeNav="activity"
      breadcrumb="Activity"
    >
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-[var(--text)]">
            Activity
          </h1>
          <p className="text-sm text-[var(--muted)] mt-1">
            Real timeline of bot configuration events, menu updates, and administrative changes.
          </p>
        </div>

        <div className="botdesk-card">
          <div className="card-header">
            <div>
              <h2 className="text-base font-bold text-[var(--text)]">
                Audit Log Timeline
              </h2>
              <p className="text-xs text-[var(--muted)]">
                Recorded automatically with timestamp, bot ID, and admin identity
              </p>
            </div>
            <span className="botdesk-badge blue font-mono text-xs">
              {logs.length} events
            </span>
          </div>

          <div className="card-body">
            {logs.length === 0 ? (
              <div className="py-12 text-center text-xs text-[var(--muted)]">
                No activity logged yet. Saving welcome messages or editing menu buttons will create audit entries here.
              </div>
            ) : (
              <div className="divide-y divide-[var(--border)]">
                {logs.map((entry) => {
                  const botName = entry.bot?.name || "General System";
                  const handle = entry.bot?.username ? `@${entry.bot.username}` : "";
                  const admin = entry.adminUser?.email || "Local Admin";

                  let detailSummary = "";
                  if (entry.details && typeof entry.details === "object") {
                    const d = entry.details as any;
                    if (d.updated) detailSummary = `Welcome text updated to: "${d.updated}"`;
                    else if (d.buttonCount !== undefined) detailSummary = `Updated menu (${d.buttonCount} buttons: ${d.labels?.join(", ") || ""})`;
                  }

                  return (
                    <div key={entry.id} className="py-3.5 space-y-1">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-xs">
                        <div className="flex items-center gap-2">
                          <strong className="text-[var(--text)] font-semibold">
                            {botName} {handle && `(${handle})`}
                          </strong>
                          <span className="botdesk-badge blue text-[11px] font-mono">
                            {entry.action}
                          </span>
                        </div>
                        <time className="text-[var(--muted)] font-mono text-[11px]">
                          {new Date(entry.createdAt).toLocaleString()}
                        </time>
                      </div>

                      {detailSummary && (
                        <p className="text-xs text-[var(--muted)] line-clamp-2">
                          {detailSummary}
                        </p>
                      )}

                      <div className="text-[11px] text-[var(--muted)]">
                        Triggered by: <span className="text-[var(--text)]">{admin}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </BotdeskLayout>
  );
}
