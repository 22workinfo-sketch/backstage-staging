"use client";

import { createContext, useContext, useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  AnimatePresence,
  LayoutGroup,
  MotionConfig,
  motion,
} from "motion/react";
import { safeFetchJson } from "@/lib/api-client";
import type { SerializedActivityEvent } from "@/lib/activity-service";

export type NavId =
  | "bots"
  | "menus"
  | "channels"
  | "inbox"
  | "posts"
  | "marketing"
  | "staff"
  | "activity"
  | "workspace";

export interface BotdeskLayoutProps {
  userEmail?: string;
  role?: string;
  activeNav?: NavId;
  breadcrumb?: string;
  children: React.ReactNode;
}

interface BreadcrumbContextValue {
  setCustomBreadcrumb: (value: string | null) => void;
}

const BreadcrumbContext = createContext<BreadcrumbContextValue>({
  setCustomBreadcrumb: () => {},
});

/**
 * Allows nested Server/Client pages (such as /bots/[id]) to override
 * the persistent header breadcrumb without remounting BotdeskLayout.
 */
export function BotdeskBreadcrumb({ title }: { title: string }) {
  const { setCustomBreadcrumb } = useContext(BreadcrumbContext);
  useEffect(() => {
    setCustomBreadcrumb(title);
    return () => setCustomBreadcrumb(null);
  }, [title, setCustomBreadcrumb]);
  return null;
}

const SIDEBAR_SPRING = {
  type: "spring" as const,
  stiffness: 420,
  damping: 32,
  mass: 0.8,
};

function resolveRouteInfo(pathname: string): { nav: NavId; breadcrumb: string } {
  if (pathname.startsWith("/inbox")) {
    return { nav: "inbox", breadcrumb: "Support inbox" };
  }
  if (pathname.startsWith("/menu")) {
    return { nav: "menus", breadcrumb: "Bot menu" };
  }
  if (pathname.startsWith("/channels")) {
    return { nav: "channels", breadcrumb: "Channels" };
  }
  if (pathname.startsWith("/posts")) {
    return { nav: "posts", breadcrumb: "Channel posts" };
  }
  if (pathname.startsWith("/marketing")) {
    return { nav: "marketing", breadcrumb: "Marketing Intelligence" };
  }
  if (pathname.startsWith("/staff")) {
    return { nav: "staff", breadcrumb: "Users & access" };
  }
  if (pathname.startsWith("/activity")) {
    return { nav: "activity", breadcrumb: "Channel Activity" };
  }
  if (pathname.startsWith("/workspace")) {
    return { nav: "workspace", breadcrumb: "Workspace" };
  }
  if (pathname.startsWith("/bots/")) {
    return { nav: "bots", breadcrumb: "Bot Details" };
  }
  return { nav: "bots", breadcrumb: "Bots" };
}

export function BotdeskLayout({
  userEmail = "admin@local.test",
  role = "SUPER_ADMIN",
  activeNav: activeNavProp,
  breadcrumb: breadcrumbProp,
  children,
}: BotdeskLayoutProps) {
  const router = useRouter();
  const pathname = usePathname() || "/dashboard";
  const [customBreadcrumb, setCustomBreadcrumb] = useState<string | null>(null);
  const [showAddBotModal, setShowAddBotModal] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifLoading, setNotifLoading] = useState(false);
  const [notifError, setNotifError] = useState<string | null>(null);
  const [notifEvents, setNotifEvents] = useState<SerializedActivityEvent[]>([]);
  const [notifLoadedOnce, setNotifLoadedOnce] = useState(false);
  const notifContainerRef = useRef<HTMLDivElement>(null);

  const loadNotifications = useCallback(async () => {
    setNotifLoading(true);
    setNotifError(null);
    const { ok, data, error } = await safeFetchJson<{
      events?: SerializedActivityEvent[];
    }>("/api/activity?limit=6");
    if (ok && data) {
      setNotifEvents(data.events || []);
      setNotifLoadedOnce(true);
    } else {
      setNotifError(error || "Unable to load recent activity.");
    }
    setNotifLoading(false);
  }, []);

  const routeInfo = resolveRouteInfo(pathname);
  const activeNav = activeNavProp ?? routeInfo.nav;
  const breadcrumb = breadcrumbProp ?? customBreadcrumb ?? routeInfo.breadcrumb;

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

  // Close mobile drawer & notification popover on route change
  useEffect(() => {
    setIsMobileOpen(false);
    setNotifOpen(false);
  }, [pathname]);

  // Keyboard accessibility: Close mobile drawer & notifications on Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (isMobileOpen) setIsMobileOpen(false);
        if (notifOpen) setNotifOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isMobileOpen, notifOpen]);

  // Close notification popover on outside click
  useEffect(() => {
    if (!notifOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (
        notifContainerRef.current &&
        !notifContainerRef.current.contains(e.target as Node)
      ) {
        setNotifOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [notifOpen]);

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

  type NavItem = {
    id: NavId;
    label: string;
    href: string;
    icon: React.ReactNode;
  };

  const allNavLinks: NavItem[] = [
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
      id: "inbox",
      label: "Support inbox",
      href: "/inbox",
      icon: (
        <svg className="w-5 h-5 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" aria-hidden="true">
          <path d="M4 4h16v12H9l-5 4V4Z" /><path d="M8 8h8m-8 4h5" />
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

  const navLinks = allNavLinks.filter((item) => {
    if (role === "SUPPORT_AGENT") return item.id === "inbox";
    return item.id !== "inbox" || role === "SUPER_ADMIN" || role === "ADMIN";
  });

  const isInbox = activeNav === "inbox";

  return (
    <MotionConfig reducedMotion="user">
      <BreadcrumbContext.Provider value={{ setCustomBreadcrumb }}>
        <div className={`app-shell ${isCollapsed ? "sidebar-collapsed" : ""}`}>
          {/* Botdesk Desktop Sidebar */}
          <aside
            className={`sidebar-panel hidden md:flex ${isCollapsed ? "collapsed" : ""}`}
            aria-label="Sidebar navigation"
          >
            <div className="flex items-center justify-between px-1 flex-shrink-0">
              <Link
                href={role === "SUPPORT_AGENT" ? "/inbox" : "/dashboard"}
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

            <LayoutGroup id="desktop-sidebar">
              <nav className="nav-group pt-4" aria-label="Main navigation">
                {navLinks.map((item) => {
                  const isActive = activeNav === item.id;
                  return (
                    <Link
                      key={item.id}
                      href={item.href}
                      className={`nav-link group relative rounded-xl px-3.5 py-2.5 flex items-center gap-3 text-sm font-medium ${
                        isActive
                          ? "active text-white font-semibold"
                          : "text-slate-400 hover:text-white"
                      }`}
                      title={item.label}
                      aria-label={item.label}
                    >
                      {isActive && (
                        <>
                          <motion.span
                            layoutId="sidebar-active-pill"
                            transition={SIDEBAR_SPRING}
                            className="absolute inset-0 rounded-xl bg-gradient-to-r from-[#0f2c42] to-[#0a1d2d] border border-sky-400/25 shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_4px_14px_rgba(14,165,233,0.12)]"
                            aria-hidden="true"
                          />
                          <motion.span
                            layoutId="sidebar-active-bar"
                            transition={SIDEBAR_SPRING}
                            className={`absolute top-2 bottom-2 w-[3px] rounded-r-full bg-[#38bdf8] shadow-[0_0_12px_rgba(56,189,248,0.8)] ${
                              isCollapsed ? "left-0.5" : "left-0"
                            }`}
                            aria-hidden="true"
                          />
                        </>
                      )}
                      <span
                        className={`nav-icon relative z-10 transition-colors duration-150 ${
                          isActive ? "text-[#38bdf8]" : "text-slate-400 group-hover:text-slate-200"
                        }`}
                        aria-hidden="true"
                      >
                        {item.icon}
                      </span>
                      <span className="nav-link-label relative z-10">{item.label}</span>
                    </Link>
                  );
                })}
              </nav>
            </LayoutGroup>

            <footer className="sidebar-footer mt-auto flex-shrink-0 text-xs text-slate-500 leading-relaxed pt-4 border-t border-white/10">
              One control center.
              <br />
              Independent bots.
            </footer>
          </aside>

          {/* Mobile Drawer Backdrop & Panel */}
          <AnimatePresence>
            {isMobileOpen && (
              <>
                <motion.div
                  key="mobile-backdrop"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm md:hidden"
                  onClick={() => setIsMobileOpen(false)}
                  aria-hidden="true"
                />

                <motion.div
                  key="mobile-drawer"
                  initial={{ x: "-100%" }}
                  animate={{ x: 0 }}
                  exit={{ x: "-100%" }}
                  transition={{ type: "spring", stiffness: 360, damping: 34 }}
                  className="fixed inset-y-0 left-0 z-50 w-72 bg-[#111315] border-r border-white/10 p-6 shadow-2xl flex flex-col gap-6 md:hidden will-change-transform"
                  role="dialog"
                  aria-modal={true}
                  aria-label="Navigation drawer"
                >
                  <div className="flex items-center justify-between flex-shrink-0">
                    <Link
                      href={role === "SUPPORT_AGENT" ? "/inbox" : "/dashboard"}
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

                  <LayoutGroup id="mobile-sidebar">
                    <nav className="nav-group mobile-nav-group flex-1 overflow-y-auto pr-1" aria-label="Mobile navigation">
                      {navLinks.map((item) => {
                        const isActive = activeNav === item.id;
                        return (
                          <Link
                            key={item.id}
                            href={item.href}
                            className={`nav-link relative rounded-xl px-3.5 py-2.5 flex items-center gap-3 text-sm font-medium ${
                              isActive
                                ? "active text-white font-semibold"
                                : "text-slate-400 hover:text-white"
                            }`}
                            onClick={() => setIsMobileOpen(false)}
                          >
                            {isActive && (
                              <motion.span
                                layoutId="mobile-active-pill"
                                transition={SIDEBAR_SPRING}
                                className="absolute inset-0 rounded-xl bg-gradient-to-r from-[#0f2c42] to-[#0a1d2d] border border-sky-400/25 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]"
                                aria-hidden="true"
                              />
                            )}
                            <span
                              className={`nav-icon relative z-10 ${
                                isActive ? "text-[#38bdf8]" : "text-slate-400"
                              }`}
                              aria-hidden="true"
                            >
                              {item.icon}
                            </span>
                            <span className="relative z-10">{item.label}</span>
                          </Link>
                        );
                      })}
                    </nav>
                  </LayoutGroup>

                  <footer className="mt-auto flex-shrink-0 text-xs text-slate-400 pt-4 border-t border-white/10">
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
                </motion.div>
              </>
            )}
          </AnimatePresence>

          {/* Main Work Area */}
          <main className={`main-content dashboard-main-theme bg-[#080b12] text-white ${isInbox ? "inbox-main" : ""}`}>
            {/* Topline Bar */}
            <header className="topline-bar flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                {/* Mobile Hamburger Button */}
                <button
                  type="button"
                  onClick={() => setIsMobileOpen(true)}
                  className="md:hidden inline-flex items-center justify-center w-9 h-9 rounded-xl border bg-[#121826] border-white/[0.08] text-slate-200 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] hover:bg-slate-800 hover:border-sky-400/30 transition"
                  title="Open Navigation Menu"
                  aria-label="Open Navigation Menu"
                >
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="3" y1="12" x2="21" y2="12" />
                    <line x1="3" y1="6" x2="21" y2="6" />
                    <line x1="3" y1="18" x2="21" y2="18" />
                  </svg>
                </button>

                <span className="text-xs text-slate-400">
                  Workspace / <strong className="text-white font-semibold">{breadcrumb}</strong>
                </span>
              </div>

              <div className="flex items-center gap-3">
                {role !== "SUPPORT_AGENT" && (
                  <>
                    {/* Notification Bell with Popover */}
                    <div ref={notifContainerRef} className="relative">
                      <button
                        type="button"
                        onClick={() => {
                          const next = !notifOpen;
                          setNotifOpen(next);
                          if (next && !notifLoadedOnce) {
                            void loadNotifications();
                          }
                        }}
                        className={`relative w-9 h-9 rounded-xl border flex items-center justify-center transition shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] cursor-pointer ${
                          notifOpen
                            ? "bg-[#0c2538] border-sky-400/40 text-[#38bdf8]"
                            : "bg-[#121826] border-white/[0.08] text-slate-300 hover:text-white hover:bg-slate-800 hover:border-sky-400/30"
                        }`}
                        title="Notifications"
                        aria-label="Notifications"
                        aria-expanded={notifOpen}
                        aria-haspopup="dialog"
                      >
                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                        </svg>
                        <span className="w-2 h-2 rounded-full bg-[#38bdf8] absolute top-1.5 right-1.5 ring-2 ring-[#080b12] shadow-[0_0_8px_rgba(56,189,248,0.8)]" />
                      </button>

                      <AnimatePresence>
                        {notifOpen && (
                          <motion.div
                            key="notif-popover"
                            initial={{ opacity: 0, y: 8, scale: 0.96 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: 6, scale: 0.96 }}
                            transition={{ type: "spring", stiffness: 420, damping: 30 }}
                            role="dialog"
                            aria-label="Recent notifications"
                            className="absolute right-0 mt-2.5 w-80 sm:w-96 rounded-2xl bg-[#0d131f]/98 backdrop-blur-xl border border-white/[0.1] shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_24px_48px_rgba(0,0,0,0.7)] overflow-hidden z-50"
                          >
                            <div className="px-4 py-3 border-b border-white/[0.08] flex items-center justify-between">
                              <div>
                                <h3 className="text-xs font-bold text-white">
                                  Recent Activity
                                </h3>
                                <p className="text-[10px] text-slate-400">
                                  Latest events across assigned bots
                                </p>
                              </div>
                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => void loadNotifications()}
                                  disabled={notifLoading}
                                  className="text-[11px] font-medium text-slate-400 hover:text-white px-2 py-1 rounded-lg bg-white/[0.04] border border-white/[0.07] cursor-pointer disabled:opacity-50 transition"
                                >
                                  {notifLoading ? "..." : "Refresh"}
                                </button>
                                <Link
                                  href="/activity"
                                  onClick={() => setNotifOpen(false)}
                                  className="text-[11px] font-semibold text-[#38bdf8] hover:underline"
                                >
                                  View all ›
                                </Link>
                              </div>
                            </div>

                            <div className="max-h-80 overflow-y-auto divide-y divide-white/[0.05]">
                              {notifLoading && notifEvents.length === 0 ? (
                                <div className="p-4 space-y-2.5">
                                  {[0, 1, 2].map((i) => (
                                    <div key={i} className="botdesk-skeleton h-10 w-full rounded-xl" />
                                  ))}
                                </div>
                              ) : notifError ? (
                                <div className="p-4 text-xs text-rose-300">
                                  {notifError}
                                </div>
                              ) : notifEvents.length === 0 ? (
                                <div className="p-6 text-center text-xs text-slate-400">
                                  No recent channel or bot events yet.
                                </div>
                              ) : (
                                notifEvents.map((ev) => {
                                  const badgeStyle =
                                    ev.eventType === "JOINED"
                                      ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/30"
                                      : ev.eventType === "LEFT"
                                      ? "bg-rose-500/15 text-rose-300 border-rose-500/30"
                                      : "bg-sky-500/15 text-[#38bdf8] border-sky-500/30";
                                  return (
                                    <div
                                      key={ev.id}
                                      className="px-4 py-2.5 hover:bg-white/[0.03] transition-colors flex items-start justify-between gap-3"
                                    >
                                      <div className="min-w-0 flex-1">
                                        <div className="flex items-center gap-1.5 flex-wrap">
                                          <span
                                            className={`font-mono text-[9px] font-bold px-1.5 py-0.5 rounded border uppercase ${badgeStyle}`}
                                          >
                                            {ev.eventType === "MEMBERSHIP_CHECK"
                                              ? "CHECK"
                                              : ev.eventType === "CHANNEL_SELECTED"
                                              ? "SELECT"
                                              : ev.eventType}
                                          </span>
                                          <span className="text-xs font-semibold text-white truncate">
                                            {ev.userDisplayName}
                                          </span>
                                        </div>
                                        <p className="text-[11px] text-slate-400 truncate mt-0.5">
                                          {ev.channelName || ev.channelTitle || "Channel"} · {ev.botName || "Bot"}
                                        </p>
                                      </div>
                                      <time className="text-[10px] font-mono text-slate-500 whitespace-nowrap tabular-nums pt-0.5">
                                        {new Date(ev.createdAt).toLocaleTimeString(undefined, {
                                          hour: "2-digit",
                                          minute: "2-digit",
                                        })}
                                      </time>
                                    </div>
                                  );
                                })
                              )}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>

                    {/* Vertical Divider */}
                    <div className="h-5 w-[1px] bg-white/[0.08]" />
                  </>
                )}

                {/* User Profile Avatar with dropdown details */}
                <div className="flex items-center gap-2 group relative">
                  <div
                    className="w-9 h-9 rounded-full bg-gradient-to-tr from-sky-950 via-slate-800 to-slate-700 text-white flex items-center justify-center font-bold text-xs ring-1 ring-white/15 overflow-hidden shadow-xs cursor-pointer"
                    title={`${userEmail} (${role})`}
                  >
                    {userEmail.charAt(0).toUpperCase()}
                  </div>

                  <div className="hidden sm:flex flex-col text-left">
                    <span className="text-xs font-semibold leading-tight text-white">
                      {userEmail.split("@")[0]}
                    </span>
                    <span className="text-[10px] text-slate-400 font-mono">
                      {role === "SUPER_ADMIN" ? "Admin" : role}
                    </span>
                  </div>

                  {/* Sign out button */}
                  <button
                    onClick={handleLogout}
                    className="text-xs py-1.5 px-2.5 rounded-lg border transition ml-1 bg-[#121826] border-white/[0.08] text-slate-300 hover:text-rose-400 hover:border-rose-500/40 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] cursor-pointer"
                    title="Sign out of backstage"
                  >
                    Sign out
                  </button>
                </div>
              </div>
            </header>

            {/* Independent Scroll Container */}
            <div className="main-scroll-viewport" id="main-scroll-container">
              {/* Content Body with smooth GPU page entry transition */}
              <motion.div
                key={pathname}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
                className="page-transition-wrapper"
              >
                {children}
              </motion.div>
            </div>
          </main>

          {/* Add Bot Entry Point Dialog (Safe Honest Notice) */}
          <AnimatePresence>
            {showAddBotModal && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.16 }}
                className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
              >
                <motion.div
                  initial={{ opacity: 0, scale: 0.96, y: 6 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.96, y: 6 }}
                  transition={{ type: "spring", stiffness: 420, damping: 32 }}
                  className="w-full max-w-md rounded-xl bg-[var(--panel)] border border-[var(--border)] p-6 shadow-2xl"
                >
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
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </BreadcrumbContext.Provider>
    </MotionConfig>
  );
}
