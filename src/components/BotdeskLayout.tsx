"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export interface BotdeskLayoutProps {
  userEmail?: string;
  role?: string;
  activeNav: "bots" | "menus" | "channels" | "staff" | "activity" | "workspace";
  breadcrumb: string;
  children: React.ReactNode;
}

export function BotdeskLayout({
  userEmail = "admin@local.test",
  role = "SUPER_ADMIN",
  activeNav,
  breadcrumb,
  children,
}: BotdeskLayoutProps) {
  const router = useRouter();
  const [showAddBotModal, setShowAddBotModal] = useState(false);

  const handleLogout = async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {
      // Ignore network errors on logout
    }
    router.push("/login");
    router.refresh();
  };

  return (
    <div className="app-shell">
      {/* Botdesk Sidebar */}
      <aside className="sidebar-panel">
        <Link href="/dashboard" className="brand-title">
          <span className="brand-mark" aria-hidden="true">
            ↗
          </span>
          <span>botdesk</span>
        </Link>

        <div className="workspace-box">
          <strong className="text-sm font-semibold block text-[var(--text)]">
            My workspace
          </strong>
          <span className="text-xs text-[var(--muted)]">Telegram management</span>
        </div>

        <nav className="nav-group" aria-label="Main navigation">
          <Link
            href="/dashboard"
            className={`nav-link ${activeNav === "bots" ? "active" : ""}`}
          >
            <span className="nav-icon" aria-hidden="true">
              ▦
            </span>
            <span>Bots</span>
          </Link>

          <Link
            href="/menu"
            className={`nav-link ${activeNav === "menus" ? "active" : ""}`}
          >
            <span className="nav-icon" aria-hidden="true">
              ▦
            </span>
            <span>Bot menu</span>
          </Link>

          <Link
            href="/channels"
            className={`nav-link ${activeNav === "channels" ? "active" : ""}`}
          >
            <span className="nav-icon" aria-hidden="true">
              📢
            </span>
            <span>Channels</span>
          </Link>

          <Link
            href="/staff"
            className={`nav-link ${activeNav === "staff" ? "active" : ""}`}
          >
            <span className="nav-icon" aria-hidden="true">
              ♙
            </span>
            <span>Staff & access</span>
          </Link>

          <Link
            href="/activity"
            className={`nav-link ${activeNav === "activity" ? "active" : ""}`}
          >
            <span className="nav-icon" aria-hidden="true">
              ≡
            </span>
            <span>Activity</span>
          </Link>

          <Link
            href="/workspace"
            className={`nav-link ${activeNav === "workspace" ? "active" : ""}`}
          >
            <span className="nav-icon" aria-hidden="true">
              ⚙
            </span>
            <span>Workspace</span>
          </Link>
        </nav>

        <footer className="sidebar-footer mt-auto text-xs text-[var(--muted)] leading-relaxed pt-4 border-t border-[var(--border)]">
          One control center.
          <br />
          Independent bots.
        </footer>
      </aside>

      {/* Main Work Area */}
      <main className="main-content">
        {/* Topline Bar */}
        <header className="topline-bar">
          <div className="flex items-center gap-3">
            <span className="crumb-label">
              Workspace / <strong className="text-[var(--text)]">{breadcrumb}</strong>
            </span>
            <span className="demo-pill font-mono">Local MVP</span>
          </div>

          <div className="flex items-center gap-4">
            <div className="text-right hidden sm:block">
              <span className="text-xs font-semibold text-[var(--text)] block">
                {userEmail}
              </span>
              <span className="text-[11px] text-[var(--muted)] font-mono">
                {role}
              </span>
            </div>

            <button
              onClick={handleLogout}
              className="botdesk-btn text-xs py-1.5 px-3 min-h-[34px] hover:text-[var(--red)]"
            >
              Sign out
            </button>
          </div>
        </header>

        {/* Content Body */}
        {children}
      </main>

      {/* Add Bot Entry Point Dialog (Safe Honest Notice) */}
      {showAddBotModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-xl bg-[var(--panel)] border border-[var(--border)] p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-bold text-[var(--text)]">
                Add a Bot (Multi-Bot Onboarding)
              </h2>
              <span className="botdesk-badge paused">Coming Soon</span>
            </div>

            <div className="space-y-3 text-sm text-[var(--muted)] mb-6">
              <p>
                Dynamic multi-bot onboarding with runtime token management is planned for the next expansion phase.
              </p>
              <div className="p-3 rounded-lg bg-[var(--bluebg)] text-[var(--accent)] text-xs border border-[var(--border)]">
                <strong>Current Scope:</strong> Your backstage is currently running in local MVP mode managing <strong>one test Telegram bot</strong> configured securely via your local <code className="font-mono font-bold">.env</code> file.
              </div>
              <p className="text-xs text-[var(--text)]">
                To test your bot or adjust its settings, select your existing connected bot from the list.
              </p>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-[var(--border)]">
              <button
                type="button"
                onClick={() => setShowAddBotModal(false)}
                className="botdesk-btn primary"
              >
                Understood
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
