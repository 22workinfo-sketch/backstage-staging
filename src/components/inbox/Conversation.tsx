"use client";
import { useEffect, useRef, useState } from "react";
import { MAX_REPLY_LENGTH } from "@/lib/inbox/text";
import { Avatar, timeLabel } from "./presentation";
import { requestJson, useInboxSnapshot } from "./useInboxSnapshot";

type Reaction = { emoji: string; count: number; byStaff?: boolean; byCustomer?: boolean };
type Message = { id: string; body: string; status: string; attachmentName: string | null; lastError: string | null;
  sentParts: number; createdAt: string; sender: { email: string } | null;
  replyToId?: string | null; replyToText?: string | null; replyToSender?: string | null;
  reactions?: Reaction[]; };
type Thread = { id: string; name: string; username: string | null; owner: { id: string; email: string } | null;
  resolved: boolean; messages: Message[]; hasOlder: boolean };
const statuses: Record<string, string> = { QUEUED: "Queued", SENDING: "Sending", SENT: "Sent to Telegram",
  FAILED: "Failed", UNCERTAIN: "Delivery unconfirmed", CANCELLED: "Stopped" };
type Draft = { text: string; key: string; attempted: boolean };

const EMOJI_LIST = [
  "👍", "❤️", "🥰", "😊", "😂", "🤣", "🙏", "👏", "🔥", "✨",
  "😀", "😃", "😄", "😁", "😉", "😍", "🤩", "😘", "😋", "😜",
  "😎", "🥳", "😇", "🤝", "🙌", "💪", "✌️", "👌", "🫶", "💖",
  "🤔", "🤫", "😮", "🥺", "😢", "😭", "😱", "😬", "😴", "🫡",
  "✅", "❌", "⚠️", "ℹ️", "💯", "🎉", "⭐", "🌟", "💡", "📦",
  "💰", "💵", "💳", "📞", "📩", "📍", "🕒", "🚀", "🏷️", "🛒",
];

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
  const [replyingTo, setReplyingTo] = useState<{ id: string; text: string; sender: string } | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const cursor = history.at(-1);
  const snapshot = useInboxSnapshot<Thread>(cursor ? url + "?before=" + cursor : url, revision);
  const thread = snapshot?.data;
  const scroll = useRef<HTMLDivElement>(null);
  const atBottom = useRef(true);
  const locked = useRef(false);
  const latest = thread?.messages.at(-1)?.id;
  const peerOwned = Boolean(thread?.owner && thread.owner.id !== userId);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (showEmojiPicker) {
        const target = e.target as HTMLElement;
        if (!target.closest(".inbox-emoji-wrapper")) {
          setShowEmojiPicker(false);
        }
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showEmojiPicker]);

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
      if (file.type.startsWith("image/") || file.type.startsWith("audio/") || /\.(jpe?g|png|webp|gif|pdf|mp3|ogg|oga|opus|wav|m4a)$/i.test(file.name)) {
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
    if (!file.type.startsWith("image/") && !file.type.startsWith("audio/") && !/\.(jpe?g|png|webp|pdf|mp3|ogg|oga|opus|wav|m4a)$/i.test(file.name)) {
      setError("Please drop an image (JPG, PNG, WebP), audio (MP3, OGG, WAV, M4A) or PDF file.");
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
  async function handleCopy(text: string, msgId: string) {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(msgId);
      setTimeout(() => setCopiedId(null), 1500);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      setCopiedId(msgId);
      setTimeout(() => setCopiedId(null), 1500);
    }
  }
  function handleStartReply(msg: Message) {
    const sender = msg.status === "RECEIVED" ? (thread?.name || "Customer") : (msg.sender?.email || "Support team");
    const text = msg.body || (msg.attachmentName ? `[${msg.attachmentName}]` : "Message");
    setReplyingTo({ id: msg.id, text, sender });
    setTimeout(() => {
      const textarea = document.querySelector<HTMLTextAreaElement>(".inbox-composer textarea");
      textarea?.focus();
    }, 50);
  }
  async function handleToggleReaction(messageId: string, emoji: string) {
    if (busy || locked.current) return;
    await mutate("PATCH", { action: "react", messageId, emoji });
  }
  function handleInsertEmoji(emoji: string) {
    const textarea = textareaRef.current || document.querySelector<HTMLTextAreaElement>(".inbox-composer textarea");
    if (!textarea) {
      saveDraft({ text: draft.text + emoji, key: "", attempted: false });
      return;
    }
    const start = textarea.selectionStart ?? draft.text.length;
    const end = textarea.selectionEnd ?? draft.text.length;
    const nextText = draft.text.slice(0, start) + emoji + draft.text.slice(end);
    saveDraft({ text: nextText, key: "", attempted: false });
    setTimeout(() => {
      textarea.focus();
      const newPos = start + emoji.length;
      textarea.setSelectionRange(newPos, newPos);
    }, 10);
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
      if (replyingTo) {
        fd.append("replyToId", replyingTo.id);
        fd.append("replyToText", replyingTo.text);
        fd.append("replyToSender", replyingTo.sender);
      }
      success = await mutate("POST", fd);
    } else {
      success = await mutate("POST", {
        body: draft.text,
        clientKey: key,
        ...(replyingTo ? {
          replyToId: replyingTo.id,
          replyToText: replyingTo.text,
          replyToSender: replyingTo.sender,
        } : {}),
      });
    }
    if (success) {
      saveDraft({ text: "", key: "", attempted: false });
      setSelectedFile(null);
      setReplyingTo(null);
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
              onKeyDown={e => { if (e.key === "Escape") setIsEditingName(false); }}
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
        <button disabled={busy} onClick={() => change(thread.owner?.id === userId ? "release" : "claim")}>
          {thread.owner?.id === userId ? "Release" : peerOwned ? "Take over" : "Claim"}
        </button>
        <button disabled={busy} onClick={() => change(thread.resolved ? "reopen" : "resolve")}>
          {thread.resolved ? "Reopen" : "Resolve"}
        </button>
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
      {thread?.messages.map(m => (
        <div key={m.id} id={"msg-" + m.id} className={"inbox-message " + (m.status === "RECEIVED" ? "incoming" : "outgoing")}>
          <div className="inbox-msg-actions">
            <div className="inbox-msg-reactions-quick">
              {["❤️", "👍", "😮", "🔥", "👎", "🥰"].map(emoji => (
                <button
                  key={emoji}
                  type="button"
                  className={`inbox-msg-react-quick-btn ${m.reactions?.some(r => r.emoji === emoji && r.byStaff) ? "active" : ""}`}
                  title={`React ${emoji}`}
                  onClick={() => handleToggleReaction(m.id, emoji)}
                >
                  {emoji}
                </button>
              ))}
            </div>
            <div className="inbox-msg-actions-divider" />
            <button
              type="button"
              className="inbox-msg-action-btn"
              title="Reply to this message"
              onClick={() => handleStartReply(m)}
            >
              ↩ Reply
            </button>
            {m.body && (
              <button
                type="button"
                className="inbox-msg-action-btn"
                title="Copy text"
                onClick={() => handleCopy(m.body, m.id)}
              >
                {copiedId === m.id ? "✓ Copied" : "📋 Copy"}
              </button>
            )}
          </div>
          {m.replyToText && (
            <div
              className="inbox-quote-box"
              onClick={() => {
                if (m.replyToId) {
                  const el = document.getElementById("msg-" + m.replyToId);
                  if (el) {
                    el.scrollIntoView({ behavior: "smooth", block: "center" });
                    el.classList.add("inbox-msg-flash");
                    setTimeout(() => el.classList.remove("inbox-msg-flash"), 1500);
                  }
                }
              }}
              title="Jump to quoted message"
            >
              <div className="inbox-quote-bar" />
              <div className="inbox-quote-content">
                <strong>{m.replyToSender || "Replied message"}</strong>
                <p>{m.replyToText}</p>
              </div>
            </div>
          )}
          <div className="inbox-message-meta"><strong>{m.status === "RECEIVED" ? thread.name : m.sender?.email || "Support team"}</strong>
            <time dateTime={m.createdAt} title={new Date(m.createdAt).toLocaleString()}>{timeLabel(m.createdAt)}</time></div>
        {m.body && <p dir="auto">{m.body}</p>}
        {m.attachmentName && (
          <div className="inbox-attachment">
            {m.attachmentName === "Photo" || m.attachmentName === "Image" || /\.(jpe?g|png|webp|gif)$/i.test(m.attachmentName) ? (
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
            ) : m.attachmentName === "Video" || /\.(mp4|webm|mov)$/i.test(m.attachmentName) ? (
              <div className="inbox-media-preview">
                <video src={url + "/files/" + m.id} controls className="inbox-chat-img" />
                <a href={url + "/files/" + m.id} target="_blank" rel="noreferrer" className="inbox-file-download">
                  ↓ {m.attachmentName}
                </a>
              </div>
            ) : m.attachmentName === "Audio" || m.attachmentName === "Voice message" || /voice/i.test(m.attachmentName) || /\.(mp3|ogg|oga|opus|wav|m4a|aac|flac|weba)$/i.test(m.attachmentName) ? (
              <div className="inbox-media-preview inbox-audio-preview">
                <audio src={url + "/files/" + m.id} controls preload="metadata" />
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
        {m.reactions && m.reactions.length > 0 && (
          <div className="inbox-reactions-pills">
            {m.reactions.map(r => (
              <button
                key={r.emoji}
                type="button"
                className={`inbox-reaction-pill ${r.byStaff ? "reacted" : ""}`}
                onClick={() => handleToggleReaction(m.id, r.emoji)}
                title={r.byStaff ? `You reacted with ${r.emoji} (click to remove)` : `Click to react with ${r.emoji}`}
              >
                <span>{r.emoji}</span>
                {r.count > 1 && <span className="inbox-reaction-count">{r.count}</span>}
              </button>
            ))}
          </div>
        )}
        {m.status !== "RECEIVED" && <small className="inbox-delivery">{statuses[m.status]}{m.status !== "SENT" && m.sentParts > 0 ? ` · ${m.sentParts} part(s) sent` : ""}</small>}
        {m.lastError && <small className="inbox-problem">{m.lastError}</small>}
        {["FAILED", "UNCERTAIN"].includes(m.status) && (!peerOwned || supervisor) && <div className="inbox-recovery">
          <button disabled={busy} onClick={() => change("retry", m)}>Retry remaining</button>
          <button disabled={busy} onClick={() => change("cancel", m)}>Stop remainder</button>
        </div>}
      </div>))}
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
        accept=".pdf,image/jpeg,image/png,image/webp,image/jpg,audio/*,.mp3,.ogg,.oga,.opus,.wav,.m4a"
        onChange={handleFileSelect}
      />
      {replyingTo && (
        <div className="inbox-replying-banner">
          <div className="inbox-replying-bar" />
          <div className="inbox-replying-content">
            <span className="inbox-replying-to">
              Replying to <strong>{replyingTo.sender}</strong>
            </span>
            <p className="inbox-replying-snippet">{replyingTo.text}</p>
          </div>
          <button
            type="button"
            className="inbox-replying-cancel"
            onClick={() => setReplyingTo(null)}
            title="Cancel reply"
          >
            ✕
          </button>
        </div>
      )}
      <textarea
        ref={textareaRef}
        aria-label="Reply to customer"
        placeholder={thread?.resolved ? "Click 'Reopen' above to reply" : peerOwned ? "Click 'Take over' above to reply" : "Write a reply or paste image (Ctrl+V)…"}
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
          <div className="inbox-emoji-wrapper">
            <button
              type="button"
              className="inbox-emoji-toggle-btn"
              title="Choose emoji"
              disabled={busy || !thread || thread.resolved || peerOwned}
              onClick={() => setShowEmojiPicker(!showEmojiPicker)}
            >
              😊 Emoji
            </button>
            {showEmojiPicker && (
              <div className="inbox-emoji-picker-popover">
                <div className="inbox-emoji-picker-header">
                  <span>Insert emoji</span>
                  <button
                    type="button"
                    className="inbox-emoji-picker-close"
                    onClick={() => setShowEmojiPicker(false)}
                  >
                    ✕
                  </button>
                </div>
                <div className="inbox-emoji-picker-grid">
                  {EMOJI_LIST.map(emoji => (
                    <button
                      key={emoji}
                      type="button"
                      className="inbox-emoji-picker-item"
                      onClick={() => handleInsertEmoji(emoji)}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
          <button
            type="button"
            className="inbox-attach-btn"
            title="Attach JPG, PNG, PDF or Audio (max 20 MB)"
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
