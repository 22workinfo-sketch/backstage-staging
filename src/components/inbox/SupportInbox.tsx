"use client";
import { useEffect, useRef, useState } from "react";
import { LayoutGroup, motion } from "motion/react";
import { Avatar, timeLabel } from "./presentation";
import { Conversation } from "./Conversation";
import { requestJson, useInboxSnapshot } from "./useInboxSnapshot";
import {
  clearUnreadTitleAlert,
  getNotificationPermission,
  playNotificationChime,
  requestDesktopNotificationPermission,
  setUnreadTitleAlert,
  showDesktopNotification,
} from "./notifications";

type Bot = { id: string; name: string; username: string; supportInboxEnabled: boolean };
type ThreadItem = {
  id: string;
  name: string;
  username: string | null;
  preview: string;
  lastActivityAt: string;
  lastMessageId?: string | null;
  lastMessageStatus?: string | null;
};
type ThreadList = { items: ThreadItem[]; hasMore: boolean };

export function SupportInbox({ initialBots, role, userId }: { initialBots: Bot[]; role: string; userId: string }) {
  const [bots, setBots] = useState(initialBots);
  const [botId, setBotId] = useState(initialBots.find(b => b.supportInboxEnabled)?.id || initialBots[0]?.id || "");
  const [selected, setSelected] = useState("");
  const [filter, setFilter] = useState("all");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(0);
  const [revision, setRevision] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [soundEnabled, setSoundEnabled] = useState(() => {
    if (typeof window === "undefined") return true;
    return localStorage.getItem("botdesk.sound_enabled") !== "false";
  });
  const [desktopPermission, setDesktopPermission] = useState<NotificationPermission>(() => {
    return getNotificationPermission();
  });
  const seenMessageIds = useRef<Set<string>>(new Set());
  const initialLoadDone = useRef(false);

  const bot = bots.find(b => b.id === botId);
  const url = "/api/inbox/" + encodeURIComponent(botId);
  const query = new URLSearchParams({ filter, page: String(page), q });
  const list = useInboxSnapshot<ThreadList>(bot?.supportInboxEnabled ? url + "?" + query : null, revision);

  function refresh() { setRevision(v => v + 1); }
  function chooseBot(id: string) {
    setBotId(id); setSelected(""); setQ(""); setFilter("all"); setPage(0); setError("");
  }

  // Restore document title when user focuses the tab
  useEffect(() => {
    const onFocus = () => clearUnreadTitleAlert();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);

  // Monitor incoming messages for sound chime & desktop alerts
  useEffect(() => {
    const items = list?.data?.items;
    if (!items || items.length === 0) return;

    if (!initialLoadDone.current) {
      items.forEach(item => {
        if (item.lastMessageId) seenMessageIds.current.add(item.lastMessageId);
      });
      initialLoadDone.current = true;
      return;
    }

    let newIncomingItem: ThreadItem | null = null;
    for (const item of items) {
      if (
        item.lastMessageId &&
        item.lastMessageStatus === "RECEIVED" &&
        !seenMessageIds.current.has(item.lastMessageId)
      ) {
        seenMessageIds.current.add(item.lastMessageId);
        newIncomingItem = item;
      } else if (item.lastMessageId) {
        seenMessageIds.current.add(item.lastMessageId);
      }
    }

    if (newIncomingItem) {
      // 1. Audio chime
      if (soundEnabled) {
        playNotificationChime();
      }

      // 2. Desktop notification
      if (getNotificationPermission() === "granted") {
        showDesktopNotification({
          title: `💬 New message from ${newIncomingItem.name}`,
          body: newIncomingItem.preview || "Sent a message / file",
          tag: `chat-${newIncomingItem.id}`,
          onClick: () => {
            setSelected(newIncomingItem.id);
            clearUnreadTitleAlert();
          },
        });
      }

      // 3. Tab title alert if not currently viewing
      if (document.hidden || selected !== newIncomingItem.id) {
        setUnreadTitleAlert(1, newIncomingItem.name);
      }
    }
  }, [list?.data?.items, soundEnabled, selected]);

  async function setMode(enabled: boolean) {
    if (!bot || busy) return;
    if (!window.confirm(enabled
      ? `Use ${bot.name} for human support? Private chats will go to this inbox and skip its automated menus.`
      : `Turn off the support inbox for ${bot.name} and resume automated menus?`)) return;
    setBusy(true); setError("");
    try {
      await requestJson(url, { method: "PUT", body: { enabled } });
      setBots(items => items.map(b => b.id === botId ? { ...b, supportInboxEnabled: enabled } : b));
      setSelected(""); refresh();
    } catch (err) { setError(err instanceof Error ? err.message : "Could not change inbox mode."); }
    finally { setBusy(false); }
  }
  return <section className="inbox-app" aria-label="Telegram support inbox">
    <div className="inbox-titlebar">
      <div className="inbox-title-left">
        <h1>Support inbox</h1>
        <div className="inbox-notif-controls">
          <button
            type="button"
            className={"inbox-notif-btn" + (soundEnabled ? " active" : "")}
            title={soundEnabled ? "Mute notification sound" : "Enable notification sound"}
            onClick={() => {
              const next = !soundEnabled;
              setSoundEnabled(next);
              localStorage.setItem("botdesk.sound_enabled", String(next));
              if (next) playNotificationChime();
            }}
          >
            {soundEnabled ? "🔔 Sound On" : "🔕 Muted"}
          </button>

          {desktopPermission !== "granted" ? (
            <button
              type="button"
              className="inbox-notif-btn inbox-notif-request"
              title="Enable browser desktop notifications for incoming chats"
              onClick={async () => {
                const perm = await requestDesktopNotificationPermission();
                setDesktopPermission(perm);
                if (perm === "granted") {
                  showDesktopNotification({
                    title: "🔔 Notifications Enabled",
                    body: "You will be alerted when customers send messages.",
                  });
                }
              }}
            >
              Desktop Alerts
            </button>
          ) : (
            <span className="inbox-notif-badge" title="Desktop notifications active">
              ● Desktop Active
            </span>
          )}
        </div>
      </div>
      {bot && <label className="inbox-bot"><span>Telegram bot</span>
        <select aria-label="Telegram bot" value={botId} onChange={e => chooseBot(e.target.value)} disabled={busy}>
          {bots.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
      </label>}
    </div>
    {error && <p role="alert" className="inbox-warning">{error}</p>}
    {!bot || !bot.supportInboxEnabled ? <div className="inbox-empty inbox-panel">
      <h2>{bot ? "Enable private support chats" : "No support inbox assigned"}</h2>
      <p>{bot ? "Customer messages will arrive here for your team to answer. This bot’s private chats will use human support."
        : "A super admin can enable a support bot and assign it to your account in Users & access."}</p>
      {bot && role === "SUPER_ADMIN" && <button className="inbox-primary" disabled={busy} onClick={() => setMode(true)}>Enable support inbox</button>}
    </div> : <div className={"inbox-panes" + (selected ? " has-thread" : "")}>
      <aside className="inbox-list" aria-label="Conversations">
        <div className="inbox-list-tools">
          <div className="inbox-list-title"><h2>Conversations</h2>{role === "SUPER_ADMIN" &&
            <button className="inbox-quiet" disabled={busy} onClick={() => setMode(false)} title="Turn off support mode for this bot">Turn off inbox</button>}</div>
          <input type="search" placeholder="Search conversations" aria-label="Search conversations" value={q}
            onChange={e => { setQ(e.target.value); setPage(0); }} />
          <LayoutGroup id="inbox-filters">
            <div className="inbox-filters">{[["all","Open"],["mine","Mine"],["resolved","Resolved"]].map(([key, label]) => {
              const active = filter === key;
              return (
                <button key={key} aria-pressed={active} onClick={() => { setFilter(key); setPage(0); }}>
                  {active && (
                    <motion.span
                      layoutId="inbox-filter-pill"
                      transition={{ type: "spring", stiffness: 420, damping: 32 }}
                      className="absolute inset-0 rounded-[0.42rem] bg-[#0f2c42] border border-sky-400/30 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]"
                      aria-hidden="true"
                    />
                  )}
                  <span className="relative z-10">{label}</span>
                </button>
              );
            })}</div>
          </LayoutGroup>
        </div>
        {list?.error && <p className="inbox-warning" role="status">{list.error}</p>}
        <LayoutGroup id="inbox-threads">
          <div className="inbox-list-scroll">
            {list?.data?.items.map(t => {
              const isSelected = selected === t.id;
              return (
                <motion.button
                  layout="position"
                  transition={{ type: "spring", stiffness: 420, damping: 34 }}
                  className="inbox-row"
                  aria-current={isSelected}
                  key={t.id}
                  onClick={() => setSelected(t.id)}
                >
                  {isSelected && (
                    <motion.span
                      layoutId="inbox-active-thread-bar"
                      transition={{ type: "spring", stiffness: 420, damping: 32 }}
                      className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-r-full bg-[#38bdf8] shadow-[0_0_10px_rgba(56,189,248,0.85)]"
                      aria-hidden="true"
                    />
                  )}
                  <Avatar name={t.name} />
                  <span className="inbox-row-text"><strong>{t.name}</strong><small>{t.preview}</small></span>
                  <time className="tabular-nums" dateTime={t.lastActivityAt}>{timeLabel(t.lastActivityAt)}</time>
                </motion.button>
              );
            })}
            {!list?.data?.items.length && !list?.error && <p className="inbox-list-empty">{list?.data ? "No conversations here." : "Loading conversations…"}</p>}
          </div>
        </LayoutGroup>
        {(page > 0 || list?.data?.hasMore) && <div className="inbox-pager"><button disabled={!page} onClick={() => setPage(p => p - 1)}>Previous</button>
          <span>{page + 1}</span><button disabled={!list?.data?.hasMore} onClick={() => setPage(p => p + 1)}>Next</button></div>}
      </aside>
      {selected ? <Conversation key={botId + "/" + selected} url={url + "/" + encodeURIComponent(selected)} userId={userId}
        supervisor={role !== "SUPPORT_AGENT"} onBack={() => setSelected("")} onChange={refresh} /> :
        <div className="inbox-empty inbox-placeholder"><h2>Select a conversation</h2><p>Choose a chat to read its history and reply as {bot.name}.</p></div>}
    </div>}
  </section>;
}
