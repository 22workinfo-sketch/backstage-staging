"use client";
import { useEffect, useRef, useState } from "react";
import { MAX_REPLY_LENGTH } from "@/lib/inbox/text";
import { Avatar, timeLabel } from "./presentation";
import { requestJson, useInboxSnapshot } from "./useInboxSnapshot";

type Message = { id: string; body: string; status: string; attachmentName: string | null; lastError: string | null;
  sentParts: number; createdAt: string; sender: { email: string } | null };
type Thread = { id: string; name: string; username: string | null; owner: { id: string; email: string } | null;
  resolved: boolean; messages: Message[]; hasOlder: boolean };
const statuses: Record<string, string> = { QUEUED: "Queued", SENDING: "Sending", SENT: "Sent to Telegram",
  FAILED: "Failed", UNCERTAIN: "Delivery unconfirmed", CANCELLED: "Stopped" };
type Draft = { text: string; key: string; attempted: boolean };

function readDraft(storageKey: string): Draft {
  try {
    const saved = JSON.parse(sessionStorage.getItem(storageKey) || "null");
    if (typeof saved?.text === "string" && typeof saved?.key === "string") return saved;
  } catch { /* A private browser can disable storage. */ }
  return { text: "", key: "", attempted: false };
}

export function Conversation({ url, userId, supervisor, onBack, onChange }: {
  url: string; userId: string; supervisor: boolean; onBack: () => void; onChange: () => void;
}) {
  const storageKey = "botdesk.reply." + userId + "." + url;
  const [draft, setDraft] = useState(() => readDraft(storageKey));
  const [history, setHistory] = useState<string[]>([]);
  const [revision, setRevision] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const cursor = history.at(-1);
  const snapshot = useInboxSnapshot<Thread>(cursor ? url + "?before=" + cursor : url, revision);
  const thread = snapshot?.data;
  const scroll = useRef<HTMLDivElement>(null);
  const atBottom = useRef(true);
  const locked = useRef(false);
  const latest = thread?.messages.at(-1)?.id;
  const peerOwned = Boolean(thread?.owner && thread.owner.id !== userId);
  useEffect(() => {
    if (!cursor && atBottom.current && scroll.current) scroll.current.scrollTop = scroll.current.scrollHeight;
  }, [latest, cursor]);
  function saveDraft(value: Draft) {
    setDraft(value);
    try {
      if (value.text) sessionStorage.setItem(storageKey, JSON.stringify(value));
      else sessionStorage.removeItem(storageKey);
    } catch { /* The in-memory draft still works. */ }
  }
  async function mutate(method: "POST" | "PATCH", payload: Record<string, unknown>) {
    if (locked.current) return false;
    locked.current = true; setBusy(true); setError("");
    try {
      await requestJson(url, { method, body: payload, signal: AbortSignal.timeout(15000) });
      setRevision(r => r + 1); onChange(); return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Connection interrupted. Try again."); return false;
    } finally { locked.current = false; setBusy(false); }
  }
  async function reply() {
    if (locked.current || !draft.text.trim() || !thread || thread.resolved || peerOwned) return;
    const key = draft.key || crypto.randomUUID();
    saveDraft({ ...draft, key, attempted: true });
    if (await mutate("POST", { body: draft.text, clientKey: key })) {
      saveDraft({ text: "", key: "", attempted: false }); setHistory([]); atBottom.current = true;
    }
  }
  function change(action: string, message?: Message) {
    if (action === "retry" && message?.status === "UNCERTAIN" &&
      !window.confirm("Telegram may already have sent the unconfirmed part. Resend this part and continue?")) return;
    if (action === "cancel" && !window.confirm("Stop sending the remaining parts of this reply?")) return;
    void mutate("PATCH", { action, messageId: message?.id });
  }
  return <article className="inbox-thread" aria-label="Customer conversation">
    <header className="inbox-thread-head">
      <button className="inbox-back" onClick={onBack} aria-label="Back to conversations">‹</button>
      <Avatar name={thread?.name || "…"} />
      <div className="inbox-person"><h2>{thread?.name || "Conversation"}</h2>
        <small>{thread?.username ? "@" + thread.username + " · " : ""}{thread?.owner?.email || "Unassigned"}</small></div>
      {thread && <div className="inbox-thread-actions">
        {(!peerOwned || supervisor) && <button disabled={busy} onClick={() => change(thread.owner?.id === userId ? "release" : "claim")}>
          {thread.owner?.id === userId ? "Release" : peerOwned ? "Take over" : "Claim"}</button>}
        {(!peerOwned || supervisor) && <button disabled={busy} onClick={() => change(thread.resolved ? "reopen" : "resolve")}>
          {thread.resolved ? "Reopen" : "Resolve"}</button>}
      </div>}
    </header>
    {(snapshot?.error || error) && <p className="inbox-warning" role="status">{error || snapshot?.error}</p>}
    <div className="inbox-messages" ref={scroll} onScroll={e => {
      const box = e.currentTarget; atBottom.current = box.scrollHeight - box.scrollTop - box.clientHeight < 80;
    }}>
      {(thread?.hasOlder || cursor) && <div className="inbox-pager">
        {thread?.hasOlder && <button onClick={() => setHistory(h => [...h, thread.messages[0].id])}>Older messages</button>}
        {cursor && <button onClick={() => setHistory(h => h.slice(0, -1))}>Newer messages</button>}
        {history.length > 1 && <button onClick={() => { atBottom.current = true; setHistory([]); }}>Latest</button>}
      </div>}
      {thread?.messages.map(m => <div key={m.id} className={"inbox-message " + (m.status === "RECEIVED" ? "incoming" : "outgoing")}>
        <div className="inbox-message-meta"><strong>{m.status === "RECEIVED" ? thread.name : m.sender?.email || "Support team"}</strong>
          <time dateTime={m.createdAt} title={new Date(m.createdAt).toLocaleString()}>{timeLabel(m.createdAt)}</time></div>
        {m.body && <p dir="auto">{m.body}</p>}
        {m.attachmentName && <a href={url + "/files/" + m.id} target="_blank" rel="noreferrer">↓ {m.attachmentName}</a>}
        {m.status !== "RECEIVED" && <small className="inbox-delivery">{statuses[m.status]}{m.status !== "SENT" && m.sentParts > 0 ? ` · ${m.sentParts} part(s) sent` : ""}</small>}
        {m.lastError && <small className="inbox-problem">{m.lastError}</small>}
        {["FAILED", "UNCERTAIN"].includes(m.status) && (!peerOwned || supervisor) && <div className="inbox-recovery">
          <button disabled={busy} onClick={() => change("retry", m)}>Retry remaining</button>
          <button disabled={busy} onClick={() => change("cancel", m)}>Stop remainder</button>
        </div>}
      </div>)}
    </div>
    <form className="inbox-composer" onSubmit={e => { e.preventDefault(); void reply(); }}>
      <textarea aria-label="Reply to customer" placeholder={thread?.resolved ? "Reopen this conversation to reply" : peerOwned ? "Another agent owns this chat" : "Write a reply…"}
        disabled={busy || !thread || thread.resolved || peerOwned} maxLength={MAX_REPLY_LENGTH} value={draft.text} dir="auto"
        onChange={e => saveDraft({ text: e.target.value, key: "", attempted: false })}
        onKeyDown={e => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && !e.nativeEvent.isComposing) { e.preventDefault(); void reply(); } }} />
      <div><small>{draft.attempted && !busy ? "Retry safely with the same reply." : draft.text.length > 4096 ? "Long reply · sent in ordered parts" : "Plain text · Ctrl / ⌘ + Enter to send"}</small>
        <button className="inbox-primary" disabled={!thread || thread.resolved || peerOwned || !draft.text.trim() || busy}>{busy ? "Working…" : draft.attempted ? "Retry reply" : "Send reply"}</button></div>
    </form>
  </article>;
}
