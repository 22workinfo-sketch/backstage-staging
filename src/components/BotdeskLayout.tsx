"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export interface BotdeskLayoutProps {
  userEmail?: string;
  role?: string;
  activeNav:
    | "bots"
    | "menus"
    | "channels"
    | "posts"
    | "marketing"
    | "staff"
    | "activity"
    | "workspace";
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
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isMobileOpen, setIsMobileOpen] = useState(false);

  // Restore sidebar collapse preference from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem("backstage_sidebar_collapsed");
      if (saved === "true") {
        setIsCollapsed(true);
      }
    } catch {
      // Ignore localStorage access issues
    }
  }, []);

  // Keyboard accessibility: Close mobile drawer on Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isMobileOpen) {
        setIsMobileOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isMobileOpen]);

  const toggleCollapse = () => {
    setIsCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem("backstage_sidebar_collapsed", String(next));
      } catch {}
      return next;
    });
  };

  const handleLogout = async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {
      // Ignore network errors on logout
    }
    router.push("/login");
    router.refresh();
  };

  const navLinks = [
    {
      id: "bots",
      label: "Bots",
      href: "/dashboard",
      icon: (
        <svg className="w-5 h-5 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M12 8V4H8" />
          <rect width="16" height="12" x="4" y="8" rx="2" />
          <path d="M2 14h2" />
          <path d="M20 14h2" />
          <path d="M15 13v2" />
          <path d="M9 13v2" />
        </svg>
      ),
    },
    {
      id: "menus",
      label: "Bot menu",
      href: "/menu",
      icon: (
        <svg className="w-5 h-5 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <polygon points="12 2 2 7 12 12 22 7 12 2" />
          <polyline points="2 17 12 22 22 17" />
          <polyline points="2 12 12 17 22 12" />
        </svg>
      ),
    },
    {
      id: "channels",
      label: "Channels",
      href: "/channels",
      icon: (
        <svg className="w-5 h-5 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="m3 11 18-5v12L3 14v-3z" />
          <path d="M11.6 16.8a3 3 0 1 1-5.8-1.6" />
        </svg>
      ),
    },
    {
      id: "posts",
      label: "Channel posts",
      href: "/posts",
      icon: (
        <svg className="w-5 h-5 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="16" y1="13" x2="8" y2="13" />
          <line x1="16" y1="17" x2="8" y2="17" />
          <line x1="10" y1="9" x2="8" y2="9" />
        </svg>
      ),
    },
    {
      id: "marketing",
      label: "Marketing",
      href: "/marketing",
      icon: (
        <svg className="w-5 h-5 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <line x1="18" y1="20" x2="18" y2="10" />
          <line x1="12" y1="20" x2="12" y2="4" />
          <line x1="6" y1="20" x2="6" y2="14" />
        </svg>
      ),
    },
    {
      id: "staff",
      label: "Users & access",
      href: "/staff",
      icon: (
        <svg className="w-5 h-5 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
      ),
    },
    {
      id: "activity",
      label: "Channel Activity",
      href: "/activity",
      icon: (
        <svg className="w-5 h-5 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
        </svg>
      ),
    },
    {
      id: "workspace",
      label: "Workspace",
      href: "/workspace",
      icon: (
        <svg className="w-5 h-5 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
      ),
    },
  ];

  const isDashboard = activeNav === "bots";

  return (
    <div className={`app-shell ${isCollapsed ? "sidebar-collapsed" : ""}`}>
      {/* Botdesk Desktop Sidebar */}
      <aside
        className={`sidebar-panel hidden md:flex ${isCollapsed ? "collapsed" : ""}`}
        aria-label="Sidebar navigation"
      >
        <div className="flex items-center justify-between px-1">
          <Link
            href="/dashboard"
            className="flex items-center gap-2 text-white font-bold text-xl tracking-tight text-decoration-none group"
            title="Botdesk Backstage"
            aria-label="Botdesk Home"
          >
            <span className="w-8 h-8 rounded-lg flex items-center justify-center text-[#38bdf8] flex-shrink-0 group-hover:scale-110 transition-transform" aria-hidden="true">
              <svg className="w-6 h-6 fill-current" viewBox="0 0 24 24">
                <path d="M13 2L3 14h8l-1 8 11-12h-8l1-8z" />
              </svg>
            </span>
            <span className="brand-label text-white font-bold tracking-tight text-lg">botdesk</span>
          </Link>

          <button
            type="button"
            onClick={toggleCollapse}
            className={`sidebar-collapse-toggle ${isCollapsed ? "is-collapsed" : ""}`}
            title={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-expanded={!isCollapsed}
          >
            <span className="toggle-chevron" aria-hidden="true">
              ‹
            </span>
          </button>
        </div>

        <nav className="nav-group pt-4" aria-label="Main navigation">
          {navLinks.map((item) => {
            const isActive = activeNav === item.id;
            return (
              <Link
                key={item.id}
                href={item.href}
                prefetch={false}
                className={`nav-link rounded-xl px-3.5 py-2.5 flex items-center gap-3 text-sm font-medium transition-all duration-150 ${
                  isActive
                    ? "bg-[#0c2538] text-white border border-sky-500/30 shadow-xs font-semibold"
                    : "text-slate-400 hover:text-white hover:bg-white/[0.05]"
                }`}
                title={item.label}
                aria-label={item.label}
              >
                <span
                  className={`nav-icon transition-colors ${
                    isActive ? "text-[#38bdf8]" : "text-slate-400 group-hover:text-slate-200"
                  }`}
                  aria-hidden="true"
                >
                  {item.icon}
                </span>
                <span className="nav-link-label">{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <footer className="sidebar-footer mt-auto text-xs text-slate-500 leading-relaxed pt-4 border-t border-white/10">
          One control center.
          <br />
          Independent bots.
        </footer>
      </aside>

      {/* Mobile Drawer Backdrop */}
      <div
        className={`fixed inset-0 z-40 bg-black/60 backdrop-blur-sm md:hidden transition-opacity duration-200 ease-out ${
          isMobileOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        }`}
        onClick={() => setIsMobileOpen(false)}
        aria-hidden="true"
      />

      {/* Mobile Drawer Panel */}
      <div
        className={`fixed inset-y-0 left-0 z-50 w-72 bg-[#111315] border-r border-white/10 p-6 shadow-2xl flex flex-col gap-6 md:hidden transform transition-transform duration-250 ease-out will-change-transform ${
          isMobileOpen ? "translate-x-0" : "-translate-x-full"
        }`}
        role="dialog"
        aria-modal={isMobileOpen}
        aria-hidden={!isMobileOpen}
        aria-label="Navigation drawer"
      >
        <div className="flex items-center justify-between">
          <Link
            href="/dashboard"
            className="flex items-center gap-2 text-white font-bold text-xl tracking-tight"
            onClick={() => setIsMobileOpen(false)}
          >
            <span className="w-8 h-8 rounded-lg flex items-center justify-center text-[#38bdf8]">
              <svg className="w-6 h-6 fill-current" viewBox="0 0 24 24">
                <path d="M13 2L3 14h8l-1 8 11-12h-8l1-8z" />
              </svg>
            </span>
            <span className="text-white font-bold tracking-tight">botdesk</span>
          </Link>
          <button
            type="button"
            onClick={() => setIsMobileOpen(false)}
            className="botdesk-btn text-sm py-1 px-2.5 min-h-[32px] text-slate-400 hover:text-white"
            aria-label="Close menu"
          >
            ✕
          </button>
        </div>

        <nav className="nav-group" aria-label="Mobile navigation">
          {navLinks.map((item) => {
            const isActive = activeNav === item.id;
            return (
              <Link
                key={item.id}
                href={item.href}
                prefetch={false}
                className={`nav-link rounded-xl px-3.5 py-2.5 flex items-center gap-3 text-sm font-medium transition-all ${
                  isActive
                    ? "bg-[#0c2538] text-white border border-sky-500/30 shadow-xs font-semibold"
                    : "text-slate-400 hover:text-white hover:bg-white/[0.05]"
                }`}
                onClick={() => setIsMobileOpen(false)}
              >
                <span
                  className={`nav-icon ${
                    isActive ? "text-[#38bdf8]" : "text-slate-400"
                  }`}
                  aria-hidden="true"
                >
                  {item.icon}
                </span>
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <footer className="mt-auto text-xs text-slate-400 pt-4 border-t border-white/10">
          <div className="mb-3">
            <span className="font-semibold text-white block truncate">
              {userEmail}
            </span>
            <span className="text-[11px] font-mono text-slate-400">
              {role}
            </span>
          </div>
          <button
            onClick={handleLogout}
            className="botdesk-btn text-xs w-full py-2 hover:text-[var(--red)] border-slate-700 bg-slate-800 text-slate-200"
          >
            Sign out
          </button>
        </footer>
      </div>

      {/* Main Work Area */}
      <main className={`main-content ${isDashboard ? "dashboard-main-theme bg-[#0b0f19] text-white" : ""}`}>
        {/* Topline Bar */}
        <header className="topline-bar flex items-center justify-between gap-4 mb-6">
          <div className="flex items-center gap-3">
            {/* Mobile Hamburger Button */}
            <button
              type="button"
              onClick={() => setIsMobileOpen(true)}
              className={`md:hidden inline-flex items-center justify-center w-9 h-9 rounded-xl border ${
                isDashboard
                  ? "bg-[#131926] border-slate-800 text-slate-200 shadow-xs hover:bg-slate-800"
                  : "bg-[var(--surface)] border-[var(--border)] text-[var(--text)]"
              }`}
              title="Open Navigation Menu"
              aria-label="Open Navigation Menu"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="3" y1="12" x2="21" y2="12" />
                <line x1="3" y1="6" x2="21" y2="6" />
                <line x1="3" y1="18" x2="21" y2="18" />
              </svg>
            </button>

            <span className={`text-xs ${isDashboard ? "text-slate-400" : "crumb-label"}`}>
              Workspace / <strong className={isDashboard ? "text-white font-semibold" : "text-[var(--text)]"}>{breadcrumb}</strong>
            </span>
          </div>

          <div className="flex items-center gap-3">
            {/* Notification Bell with Cyan Dot */}
            <button
              type="button"
              className={`relative w-9 h-9 rounded-xl border flex items-center justify-center transition shadow-xs ${
                isDashboard
                  ? "bg-[#131926] border-slate-800 text-slate-300 hover:text-white hover:bg-slate-800"
                  : "bg-[var(--surface)] border-[var(--border)] text-[var(--muted)] hover:text-[var(--text)]"
              }`}
              title="Notifications"
              aria-label="Notifications"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                <path d="M13.73 21a2 2 0 0 1-3.46 0" />
              </svg>
              {/* Cyan Notification Dot */}
              <span className="w-2 h-2 rounded-full bg-[#38bdf8] absolute top-1.5 right-1.5 ring-2 ring-[#0b0f19]" />
            </button>

            {/* Vertical Divider */}
            <div className={`h-5 w-[1px] ${isDashboard ? "bg-slate-800" : "bg-[var(--border)]"}`} />

            {/* User Profile Avatar with dropdown details */}
            <div className="flex items-center gap-2 group relative">
              <div
                className="w-9 h-9 rounded-full bg-gradient-to-tr from-sky-950 via-slate-800 to-slate-700 text-white flex items-center justify-center font-bold text-xs ring-1 ring-slate-700 overflow-hidden shadow-xs cursor-pointer"
                title={`${userEmail} (${role})`}
              >
                {userEmail.charAt(0).toUpperCase()}
              </div>

              <div className="hidden sm:flex flex-col text-left">
                <span className={`text-xs font-semibold leading-tight ${isDashboard ? "text-white" : "text-[var(--text)]"}`}>
                  {userEmail.split("@")[0]}
                </span>
                <span className={`text-[10px] ${isDashboard ? "text-slate-400" : "text-[var(--muted)]"} font-mono`}>
                  {role === "SUPER_ADMIN" ? "Admin" : role}
                </span>
              </div>

              {/* Sign out button */}
              <button
                onClick={handleLogout}
                className={`text-xs py-1 px-2.5 rounded-lg border transition ml-1 ${
                  isDashboard
                    ? "bg-[#131926] border-slate-800 text-slate-300 hover:text-rose-400 hover:border-rose-900/50 shadow-xs"
                    : "botdesk-btn text-xs py-1.5 px-3 min-h-[32px] hover:text-[var(--red)]"
                }`}
                title="Sign out of backstage"
              >
                Sign out
              </button>
            </div>
          </div>
        </header>

        {/* Content Body with smooth page entry transition */}
        <div key={activeNav} className="page-transition-wrapper">
          {children}
        </div>
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
                Dynamic multi-bot onboarding with runtime token management is supported.
              </p>
              <div className="p-3 rounded-lg bg-[var(--bluebg)] text-[var(--accent)] text-xs border border-[var(--border)]">
                <strong>Current Scope:</strong> Your backstage currently manages <strong>test Telegram bots</strong> configured securely via your local <code className="font-mono font-bold">.env</code> file or runtime encrypted tokens.
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
