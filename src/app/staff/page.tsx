import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/auth";
import { BotdeskLayout } from "@/components/BotdeskLayout";

export default async function StaffPage() {
  const session = await getAdminSession();
  if (!session) {
    redirect("/login");
  }

  return (
    <BotdeskLayout
      userEmail={session.email}
      role={session.role}
      activeNav="staff"
      breadcrumb="Staff & access"
    >
      <div className="space-y-6">
        {/* Screen Heading */}
        <div>
          <span className="botdesk-badge blue mb-2 inline-block">
            WORKSPACE MANAGEMENT
          </span>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-[var(--text)]">
            Staff & access
          </h1>
          <p className="text-sm text-[var(--muted)] mt-1">
            Plan who can manage each bot and what they can do.
          </p>
        </div>

        {/* Honest Architecture Callout */}
        <div className="p-4 rounded-lg bg-[var(--bluebg)] border border-[var(--border)] text-xs text-[var(--accent)] leading-relaxed">
          <strong>Local MVP Notice:</strong> Per-bot granular staff permissions, invitations, and multi-user delegation are planned for the upcoming Multi-User Phase. Currently, your backstage is securely authenticated using your master administrator account stored in PostgreSQL.
        </div>

        {/* Two-Column Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Team Members List */}
          <div className="lg:col-span-7 botdesk-card">
            <div className="card-header">
              <div>
                <h2 className="text-base font-bold text-[var(--text)]">
                  Team members
                </h2>
                <p className="text-xs text-[var(--muted)]">
                  Active administrator and authorized accounts
                </p>
              </div>

              <button
                type="button"
                disabled
                className="botdesk-btn primary text-xs"
                title="Multi-user staff invitation will be available in Phase 2"
              >
                ＋ Add staff (Coming Soon)
              </button>
            </div>

            <div className="card-body divide-y divide-[var(--border)]">
              {/* Real logged in Admin User */}
              <div className="py-3 flex items-center justify-between gap-4">
                <div>
                  <strong className="text-sm font-semibold text-[var(--text)] block">
                    {session.email}
                  </strong>
                  <span className="text-xs text-[var(--muted)]">
                    Primary Administrator · Assigned to All Bots
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <span className="botdesk-badge enabled">Active</span>
                  <span className="botdesk-badge blue font-mono text-xs">
                    {session.role}
                  </span>
                </div>
              </div>

              {/* Planned multi-role preview */}
              <div className="py-3 flex items-center justify-between gap-4 opacity-50">
                <div>
                  <strong className="text-sm font-semibold text-[var(--text)] block">
                    Support Staff Account
                  </strong>
                  <span className="text-xs text-[var(--muted)]">
                    Planned role · Assigned to individual test bot
                  </span>
                </div>
                <span className="botdesk-badge paused">Phase 2 Planned</span>
              </div>
            </div>
          </div>

          {/* Right Column: Roles & Login Architecture */}
          <div className="lg:col-span-5 space-y-6">
            {/* Role Permissions Card */}
            <div className="botdesk-card">
              <div className="card-header">
                <h2 className="text-base font-bold text-[var(--text)]">
                  Role permissions
                </h2>
              </div>

              <div className="card-body divide-y divide-[var(--border)]">
                <div className="py-3 flex items-center justify-between gap-3">
                  <div>
                    <strong className="text-sm font-semibold text-[var(--text)] block">
                      Owner / Super Admin
                    </strong>
                    <span className="text-xs text-[var(--muted)]">
                      All bots, welcome messages, menus, and system settings
                    </span>
                  </div>
                  <span className="botdesk-badge enabled">Full access</span>
                </div>

                <div className="py-3 flex items-center justify-between gap-3">
                  <div>
                    <strong className="text-sm font-semibold text-[var(--text)] block">
                      Admin
                    </strong>
                    <span className="text-xs text-[var(--muted)]">
                      Manage assigned bots, menus, and responses
                    </span>
                  </div>
                  <span className="botdesk-badge enabled">Manage</span>
                </div>

                <div className="py-3 flex items-center justify-between gap-3">
                  <div>
                    <strong className="text-sm font-semibold text-[var(--text)] block">
                      Staff / Viewer
                    </strong>
                    <span className="text-xs text-[var(--muted)]">
                      View assigned bot users, phone numbers, and activity
                    </span>
                  </div>
                  <span className="botdesk-badge paused">Limited</span>
                </div>
              </div>
            </div>

            {/* Login Experience Card */}
            <div className="botdesk-card">
              <div className="card-header">
                <h2 className="text-base font-bold text-[var(--text)]">
                  Login & Security Architecture
                </h2>
              </div>

              <div className="card-body space-y-3 text-xs text-[var(--muted)]">
                <div className="p-2.5 rounded bg-[var(--surface)] border border-[var(--border)]">
                  <strong className="text-[var(--text)] block mb-1">
                    Password Security
                  </strong>
                  Bcrypt hash with 12 salt rounds stored in PostgreSQL <code className="font-mono">admin_users</code>.
                </div>
                <div className="p-2.5 rounded bg-[var(--surface)] border border-[var(--border)]">
                  <strong className="text-[var(--text)] block mb-1">
                    Session Management
                  </strong>
                  HTTP-only, Secure SameSite JWT cookie validated on every protected API route and page.
                </div>
                <div className="p-2.5 rounded bg-[var(--surface)] border border-[var(--border)]">
                  <strong className="text-[var(--text)] block mb-1">
                    Network Isolation
                  </strong>
                  Strictly restricted to 127.0.0.1 loopback address in development mode.
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </BotdeskLayout>
  );
}
