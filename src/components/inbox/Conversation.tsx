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
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [history, setHistory] = useState<string[]>([]);
  const [revision, setRevision] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [isEditingName, setIsEditingName] = useState(false);
  const [editingNameValue, setEditingNameValue] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
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
  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) {
      setError("File exceeds maximum size of 20 MB.");
      e.target.value = "";
      return;
    }
    setSelectedFile(file);
    setError("");
  }
  function handlePaste(e: React.ClipboardEvent) {
    if (busy || !thread || thread.resolved || peerOwned) return;
    const items = e.clipboardData?.items;
    if (items) {
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.kind === "file" && item.type.startsWith("image/")) {
          const file = item.getAsFile();
          if (file) {
            e.preventDefault();
            if (file.size > 20 * 1024 * 1024) {
              setError("Pasted image exceeds maximum size of 20 MB.");
              return;
            }
            const ext = file.type.split("/")[1] || "jpeg";
            const safeExt = ext.toLowerCase().includes("png") ? "png" : "jpg";
            const filename = (file.name && file.name !== "image.png")
              ? file.name
              : `telegram_image_${Date.now()}.${safeExt}`;
            const namedFile = new File([file], filename, { type: file.type || "image/jpeg" });
            setSelectedFile(namedFile);
            setError("");
            return;
          }
        }
      }
    }
    const files = e.clipboardData?.files;
    if (files && files.length > 0) {
      const file = files[0];
      if (file.type.startsWith("image/") || /\.(jpe?g|png|webp|gif|pdf)$/i.test(file.name)) {
        e.preventDefault();
        if (file.size > 20 * 1024 * 1024) {
          setError("Pasted file exceeds maximum size of 20 MB.");
          return;
        }
        setSelectedFile(file);
        setError("");
        return;
      }
    }
  }
  function handleDrop(e: React.DragEvent) {
    if (busy || !thread || thread.resolved || peerOwned) return;
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/") && !/\.(jpe?g|png|webp|pdf)$/i.test(file.name)) {
      setError("Please drop an image (JPG, PNG, WebP) or PDF file.");
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      setError("Dropped file exceeds maximum size of 20 MB.");
      return;
    }
    setSelectedFile(file);
    setError("");
  }
  async function mutate(method: "POST" | "PATCH", payload: Record<string, unknown> | FormData) {
    if (locked.current) return false;
    locked.current = true; setBusy(true); setError("");
    try {
      if (payload instanceof FormData) {
        const res = await fetch(url, {
          method,
          body: payload,
          signal: AbortSignal.timeout(60000),
        });
        if (!res.ok) {
          const errJson = await res.json().catch(() => ({}));
          throw new Error(errJson.error || `Upload failed with status ${res.status}`);
        }
      } else {
        await requestJson(url, { method, body: payload, signal: AbortSignal.timeout(15000) });
      }
      setRevision(r => r + 1); onChange(); return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Connection interrupted. Try again."); return false;
    } finally { locked.current = false; setBusy(false); }
  }
  async function reply() {
    if (locked.current || (!draft.text.trim() && !selectedFile) || !thread || thread.resolved || peerOwned) return;
    const key = draft.key || crypto.randomUUID();
    saveDraft({ ...draft, key, attempted: true });
    let success = false;
    if (selectedFile) {
      const fd = new FormData();
      fd.append("body", draft.text);
      fd.append("clientKey", key);
      fd.append("file", selectedFile);
      success = await mutate("POST", fd);
    } else {
      success = await mutate("POST", { body: draft.text, clientKey: key });
    }
    if (success) {
      saveDraft({ text: "", key: "", attempted: false });
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      setHistory([]);
      atBottom.current = true;
    }
  }
  function change(action: string, message?: Message) {
    if (action === "retry" && message?.status === "UNCERTAIN" &&
      !window.confirm("Telegram may already have sent the unconfirmed part. Resend this part and continue?")) return;
    if (action === "cancel" && !window.confirm("Stop sending the remaining parts of this reply?")) return;
    void mutate("PATCH", { action, messageId: message?.id });
  }
  async function handleSaveName(e: React.FormEvent) {
    e.preventDefault();
    if (!editingNameValue.trim() || busy) return;
    const ok = await mutate("PATCH", { action: "rename", name: editingNameValue.trim() });
    if (ok) setIsEditingName(false);
  }
  return <article className="inbox-thread" aria-label="Customer conversation">
    <header className="inbox-thread-head">
      <button className="inbox-back" onClick={onBack} aria-label="Back to conversations">‹</button>
      <Avatar name={thread?.name || "…"} />
      <div className="inbox-person">
        {isEditingName ? (
          <form className="inbox-name-form" onSubmit={handleSaveName}>
            <input
              type="text"
              value={editingNameValue}
              onChange={e => setEditingNameValue(e.target.value)}
              className="inbox-name-input"
              autoFocus
              maxLength={100}
              disabled={busy}
            />
            <button type="submit" className="inbox-name-btn inbox-name-save" disabled={busy} title="Save">✓</button>
            <button type="button" className="inbox-name-btn inbox-name-cancel" onClick={() => setIsEditingName(false)} title="Cancel">✕</button>
          </form>
        ) : (
          <div className="inbox-name-display">
            <h2>{thread?.name || "Conversation"}</h2>
            {thread && (
              <button
                type="button"
                className="inbox-name-edit-btn"
                onClick={() => {
                  setEditingNameValue(thread?.name || "");
                  setIsEditingName(true);
                }}
                title="Edit customer name"
              >
                ✏️
              </button>
            )}
          </div>
        )}
        <small>{thread?.username ? "@" + thread.username + " · " : ""}{thread?.owner?.email || "Unassigned"}</small>
      </div>
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
        {m.attachmentName && (
          <div className="inbox-attachment">
            {m.attachmentName === "Photo" || /\.(jpe?g|png|webp|gif)$/i.test(m.attachmentName) ? (
              <div className="inbox-media-preview">
                <a href={url + "/files/" + m.id} target="_blank" rel="noreferrer">
                  <img
                    src={url + "/files/" + m.id}
                    alt={m.attachmentName}
                    className="inbox-chat-img"
                    loading="lazy"
                  />
                </a>
                <a href={url + "/files/" + m.id} target="_blank" rel="noreferrer" className="inbox-file-download">
                  ↓ {m.attachmentName}
                </a>
              </div>
            ) : /\.pdf$/i.test(m.attachmentName) ? (
              <a href={url + "/files/" + m.id} target="_blank" rel="noreferrer" className="inbox-doc-link">
                <span className="inbox-doc-badge">PDF</span>
                <span className="inbox-doc-name">{m.attachmentName}</span>
                <span className="inbox-doc-dl">↓ Open</span>
              </a>
            ) : (
              <a href={url + "/files/" + m.id} target="_blank" rel="noreferrer" className="inbox-file-download">
                ↓ {m.attachmentName}
              </a>
            )}
          </div>
        )}
        {m.status !== "RECEIVED" && <small className="inbox-delivery">{statuses[m.status]}{m.status !== "SENT" && m.sentParts > 0 ? ` · ${m.sentParts} part(s) sent` : ""}</small>}
        {m.lastError && <small className="inbox-problem">{m.lastError}</small>}
        {["FAILED", "UNCERTAIN"].includes(m.status) && (!peerOwned || supervisor) && <div className="inbox-recovery">
          <button disabled={busy} onClick={() => change("retry", m)}>Retry remaining</button>
          <button disabled={busy} onClick={() => change("cancel", m)}>Stop remainder</button>
        </div>}
      </div>)}
    </div>
    <form
      className="inbox-composer"
      onSubmit={e => { e.preventDefault(); void reply(); }}
      onPaste={handlePaste}
      onDragOver={e => e.preventDefault()}
      onDrop={handleDrop}
    >
      {selectedFile && (
        <div className="inbox-file-chip">
          <span className="inbox-file-icon">
            {/\.(jpe?g|png|webp|gif)$/i.test(selectedFile.name) ? "🖼️" : "📄"}
          </span>
          <span className="inbox-file-name" title={selectedFile.name}>{selectedFile.name}</span>
          <span className="inbox-file-size">({(selectedFile.size / (1024 * 1024)).toFixed(1)} MB)</span>
          <button
            type="button"
            className="inbox-file-remove"
            title="Remove file"
            onClick={() => {
              setSelectedFile(null);
              if (fileInputRef.current) fileInputRef.current.value = "";
            }}
          >
            ✕
          </button>
        </div>
      )}
      <input
        type="file"
        ref={fileInputRef}
        style={{ display: "none" }}
        accept=".pdf,image/jpeg,image/png,image/webp,image/jpg"
        onChange={handleFileSelect}
      />
      <textarea
        aria-label="Reply to customer"
        placeholder={thread?.resolved ? "Reopen this conversation to reply" : peerOwned ? "Another agent owns this chat" : "Write a reply or paste image (Ctrl+V)…"}
        disabled={busy || !thread || thread.resolved || peerOwned}
        maxLength={MAX_REPLY_LENGTH}
        value={draft.text}
        dir="auto"
        onChange={e => saveDraft({ text: e.target.value, key: "", attempted: false })}
        onKeyDown={e => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && !e.nativeEvent.isComposing) { e.preventDefault(); void reply(); } }}
        onPaste={handlePaste}
      />
      <div>
        <small>{draft.attempted && !busy ? "Retry safely with the same reply." : selectedFile ? `Attached: ${selectedFile.name} · Enter to send` : draft.text.length > 4096 ? "Long reply · sent in ordered parts" : "Plain text · Ctrl / ⌘ + Enter to send"}</small>
        <div className="inbox-composer-actions">
          <button
            type="button"
            className="inbox-attach-btn"
            title="Attach JPG, PNG or PDF (max 20 MB)"
            disabled={busy || !thread || thread.resolved || peerOwned}
            onClick={() => fileInputRef.current?.click()}
          >
            📎 Attach
          </button>
          <button className="inbox-primary" disabled={!thread || thread.resolved || peerOwned || (!draft.text.trim() && !selectedFile) || busy}>{busy ? "Working…" : draft.attempted ? "Retry reply" : "Send reply"}</button>
        </div>
      </div>
    </form>
  </article>;
}
