"use client";
import { useState } from "react";
import { Avatar, timeLabel } from "./presentation";
import { Conversation } from "./Conversation";
import { requestJson, useInboxSnapshot } from "./useInboxSnapshot";

type Bot = { id: string; name: string; username: string; supportInboxEnabled: boolean };
type ThreadList = { items: { id: string; name: string; username: string | null; preview: string; lastActivityAt: string }[]; hasMore: boolean };

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
  const bot = bots.find(b => b.id === botId);
  const url = "/api/inbox/" + encodeURIComponent(botId);
  const query = new URLSearchParams({ filter, page: String(page), q });
  const list = useInboxSnapshot<ThreadList>(bot?.supportInboxEnabled ? url + "?" + query : null, revision);
  function refresh() { setRevision(v => v + 1); }
  function chooseBot(id: string) {
    setBotId(id); setSelected(""); setQ(""); setFilter("all"); setPage(0); setError("");
  }
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
      <h1>Support inbox</h1>
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
          <div className="inbox-filters">{[["all","Open"],["mine","Mine"],["resolved","Resolved"]].map(([key, label]) =>
            <button key={key} aria-pressed={filter === key} onClick={() => { setFilter(key); setPage(0); }}>{label}</button>
          )}</div>
        </div>
        {list?.error && <p className="inbox-warning" role="status">{list.error}</p>}
        <div className="inbox-list-scroll">
          {list?.data?.items.map(t => <button className="inbox-row" aria-current={selected === t.id} key={t.id} onClick={() => setSelected(t.id)}>
            <Avatar name={t.name} /><span className="inbox-row-text"><strong>{t.name}</strong><small>{t.preview}</small></span>
            <time dateTime={t.lastActivityAt}>{timeLabel(t.lastActivityAt)}</time>
          </button>)}
          {!list?.data?.items.length && !list?.error && <p className="inbox-list-empty">{list?.data ? "No conversations here." : "Loading conversations…"}</p>}
        </div>
        {(page > 0 || list?.data?.hasMore) && <div className="inbox-pager"><button disabled={!page} onClick={() => setPage(p => p - 1)}>Previous</button>
          <span>{page + 1}</span><button disabled={!list?.data?.hasMore} onClick={() => setPage(p => p + 1)}>Next</button></div>}
      </aside>
      {selected ? <Conversation key={botId + "/" + selected} url={url + "/" + encodeURIComponent(selected)} userId={userId}
        supervisor={role !== "SUPPORT_AGENT"} onBack={() => setSelected("")} onChange={refresh} /> :
        <div className="inbox-empty inbox-placeholder"><h2>Select a conversation</h2><p>Choose a chat to read its history and reply as {bot.name}.</p></div>}
    </div>}
  </section>;
}
