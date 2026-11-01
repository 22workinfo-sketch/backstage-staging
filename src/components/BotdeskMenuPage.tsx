"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { BotButtonDTO } from "./MenuBuilder";

export interface BotOption {
  id: string;
  name: string;
  username: string;
  welcomeMessage?: string;
}

interface BotdeskMenuPageProps {
  bots: BotOption[];
  initialBotId: string;
  initialButtonsByBot: Record<string, BotButtonDTO[]>;
}

export function BotdeskMenuPage({
  bots,
  initialBotId,
  initialButtonsByBot,
}: BotdeskMenuPageProps) {
  const router = useRouter();
  const [selectedBotId, setSelectedBotId] = useState<string>(initialBotId);
  const [buttonsByBot, setButtonsByBot] = useState<Record<string, BotButtonDTO[]>>(
    initialButtonsByBot
  );

  const activeBot = bots.find((b) => b.id === selectedBotId) || bots[0];
  const buttons = buttonsByBot[selectedBotId] || [];

  // Form states for Add / Edit
  const [showModal, setShowModal] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [formLabel, setFormLabel] = useState("");
  const [formAction, setFormAction] = useState<"SEND_TEXT" | "REQUEST_CONTACT">(
    "SEND_TEXT"
  );
  const [formReply, setFormReply] = useState("");
  const [formAutoDelete, setFormAutoDelete] = useState(false);
  const [formDeleteSeconds, setFormDeleteSeconds] = useState(30);
  const [formEnabled, setFormEnabled] = useState(true);
  const [formError, setFormError] = useState<string | null>(null);

  // Saving state
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  // Telegram Preview Chat state
  const [previewMessages, setPreviewMessages] = useState<
    Array<{ id: number; text: string; sender: "user" | "bot" | "note" }>
  >([]);

  useEffect(() => {
    resetPreviewChat();
  }, [selectedBotId]);

  const resetPreviewChat = () => {
    const welcome =
      activeBot?.welcomeMessage ||
      "Welcome! I am your test Telegram bot. Tap a button below to try a response.";
    setPreviewMessages([
      {
        id: 1,
        text: welcome,
        sender: "bot",
      },
    ]);
  };

  const handleOpenAdd = () => {
    setEditingIndex(null);
    setFormLabel("");
    setFormAction("SEND_TEXT");
    setFormReply("");
    setFormAutoDelete(false);
    setFormDeleteSeconds(30);
    setFormEnabled(true);
    setFormError(null);
    setShowModal(true);
  };

  const handleOpenEdit = (index: number) => {
    const b = buttons[index];
    setEditingIndex(index);
    setFormLabel(b.label);
    setFormAction(
      b.actionType === "REQUEST_CONTACT" ? "REQUEST_CONTACT" : "SEND_TEXT"
    );
    setFormReply(b.replyText || "");
    setFormAutoDelete(Boolean(b.autoDeleteReply));
    setFormDeleteSeconds(b.deleteAfterSeconds || 30);
    setFormEnabled(b.isEnabled);
    setFormError(null);
    setShowModal(true);
  };

  const handleSaveModal = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const trimmedLabel = formLabel.trim();
    if (!trimmedLabel) {
      setFormError("Button label is required.");
      return;
    }
    if (trimmedLabel.length > 64) {
      setFormError("Button label cannot exceed 64 characters.");
      return;
    }

    // Duplicate check
    const duplicate = buttons.some(
      (b, idx) =>
        idx !== editingIndex &&
        b.label.trim().toLowerCase() === trimmedLabel.toLowerCase()
    );
    if (duplicate) {
      setFormError(`A button with the label "${trimmedLabel}" already exists.`);
      return;
    }

    if (formAction === "SEND_TEXT") {
      const trimmedReply = formReply.trim();
      if (!trimmedReply) {
        setFormError("Reply text is required for Send text action.");
        return;
      }
      if (trimmedReply.length > 2000) {
        setFormError("Reply text cannot exceed 2000 characters.");
        return;
      }
      if (formAutoDelete) {
        const sec = Math.floor(formDeleteSeconds);
        if (isNaN(sec) || sec < 5 || sec > 86400) {
          setFormError(
            "Auto-delete delay must be between 5 and 86,400 seconds (24h)."
          );
          return;
        }
      }
    }

    const item: BotButtonDTO = {
      ...(editingIndex !== null ? { id: buttons[editingIndex].id } : {}),
      label: trimmedLabel,
      actionType: formAction,
      replyText: formAction === "SEND_TEXT" ? formReply.trim() : null,
      autoDeleteReply: formAction === "SEND_TEXT" ? formAutoDelete : false,
      deleteAfterSeconds:
        formAction === "SEND_TEXT" && formAutoDelete
          ? Math.floor(formDeleteSeconds)
          : 30,
      isEnabled: formEnabled,
      order: editingIndex !== null ? buttons[editingIndex].order : buttons.length,
    };

    let updatedList: BotButtonDTO[];
    if (editingIndex !== null) {
      updatedList = [...buttons];
      updatedList[editingIndex] = item;
    } else {
      if (buttons.length >= 12) {
        setFormError("Maximum limit of 12 buttons reached.");
        return;
      }
      updatedList = [...buttons, item];
    }

    setButtonsByBot({
      ...buttonsByBot,
      [selectedBotId]: updatedList,
    });
    setShowModal(false);
  };

  const handleMove = (index: number, direction: "up" | "down") => {
    const target = direction === "up" ? index - 1 : index + 1;
    if (target < 0 || target >= buttons.length) return;

    const copy = [...buttons];
    const temp = copy[index];
    copy[index] = copy[target];
    copy[target] = temp;
    const reordered = copy.map((b, i) => ({ ...b, order: i }));

    setButtonsByBot({
      ...buttonsByBot,
      [selectedBotId]: reordered,
    });
  };

  const handleToggle = (index: number) => {
    const copy = [...buttons];
    copy[index] = { ...copy[index], isEnabled: !copy[index].isEnabled };
    setButtonsByBot({
      ...buttonsByBot,
      [selectedBotId]: copy,
    });
  };

  const handleDelete = (index: number) => {
    const btn = buttons[index];
    if (!confirm(`Delete button "${btn.label}"?`)) return;

    const filtered = buttons
      .filter((_, i) => i !== index)
      .map((b, i) => ({ ...b, order: i }));
    setButtonsByBot({
      ...buttonsByBot,
      [selectedBotId]: filtered,
    });
  };

  const handleSaveAllToDatabase = async () => {
    setSaving(true);
    setSaveStatus(null);

    try {
      const res = await fetch(`/api/bots/${selectedBotId}/menu`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ buttons }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to save bot menu");
      }

      setButtonsByBot({
        ...buttonsByBot,
        [selectedBotId]: data.buttons || buttons,
      });

      setSaveStatus({
        type: "success",
        text: "Bot menu successfully saved to PostgreSQL! Live Telegram users receive this keyboard on next /start.",
      });
      router.refresh();
    } catch (err) {
      setSaveStatus({
        type: "error",
        text: err instanceof Error ? err.message : "Error saving bot menu",
      });
    } finally {
      setSaving(false);
    }
  };

  // Preview interactive button press with simulated auto-delete
  const handlePreviewButtonPress = (btn: BotButtonDTO) => {
    const userBubbleId = Date.now();
    const botBubbleId = userBubbleId + 1;

    let botReplyText = "";
    if (btn.actionType === "REQUEST_CONTACT") {
      botReplyText =
        "📱 [Telegram Native Contact Request Prompt]\n\n" +
        "Telegram prompts the user: 'Share your phone number with this bot?'\n" +
        "Bot Backstage verifies contact.user_id === sender.id before saving.";
    } else {
      botReplyText =
        btn.replyText || "This button has no configured reply text.";
    }

    setPreviewMessages((prev) => [
      ...prev,
      { id: userBubbleId, text: btn.label, sender: "user" },
      { id: botBubbleId, text: botReplyText, sender: "bot" },
    ]);

    // Simulated Auto-Delete if enabled
    if (btn.actionType === "SEND_TEXT" && btn.autoDeleteReply) {
      const delayMs = (btn.deleteAfterSeconds || 30) * 1000;
      setTimeout(() => {
        setPreviewMessages((prev) => prev.filter((m) => m.id !== botBubbleId));
      }, Math.min(delayMs, 5000)); // Cap simulation delay at 5s in UI for quick preview feedback
    }
  };

  return (
    <div className="space-y-6">
      {/* Screen Heading */}
      <div>
        <span className="botdesk-badge blue mb-2 inline-block">
          BOT CONFIGURATION
        </span>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-[var(--text)]">
          Bot menu builder
        </h1>
        <p className="text-sm text-[var(--muted)] mt-1">
          Configure reply keyboard buttons in PostgreSQL and test simulated Telegram replies.
        </p>
      </div>

      {saveStatus && (
        <div
          className={`p-3.5 rounded-lg text-sm border ${
            saveStatus.type === "success"
              ? "bg-[var(--greenbg)] border-[var(--green)] text-[var(--green)]"
              : "bg-[var(--redbg)] border-[var(--red)] text-[var(--red)]"
          }`}
        >
          {saveStatus.text}
        </div>
      )}

      {/* Two-Column Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Configured Buttons */}
        <div className="lg:col-span-7 botdesk-card">
          <div className="card-header">
            <div>
              <h2 className="text-base font-bold text-[var(--text)]">Buttons</h2>
              <p className="text-xs text-[var(--muted)]">
                Each bot has its own reply keyboard
              </p>
            </div>
            <button
              type="button"
              onClick={handleOpenAdd}
              disabled={buttons.length >= 12}
              className="botdesk-btn primary text-xs"
            >
              ＋ Add button
            </button>
          </div>

          <div className="card-body space-y-4">
            {/* Select Bot */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--muted)] mb-1">
                Select Bot
              </label>
              <select
                value={selectedBotId}
                onChange={(e) => setSelectedBotId(e.target.value)}
                className="botdesk-select text-xs"
              >
                {bots.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name} (@{b.username})
                  </option>
                ))}
              </select>
            </div>

            {/* Buttons List */}
            <div className="space-y-2.5">
              {buttons.length === 0 ? (
                <div className="py-8 text-center text-xs text-[var(--muted)] border border-dashed border-[var(--border)] rounded-lg">
                  No buttons configured yet. Click "＋ Add button" to begin.
                </div>
              ) : (
                buttons.map((btn, idx) => (
                  <div
                    key={idx}
                    className={`p-3 rounded-lg border flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition ${
                      btn.isEnabled
                        ? "bg-[var(--bg)] border-[var(--border)]"
                        : "bg-[var(--surface)] border-[var(--border)] opacity-60"
                    }`}
                  >
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <strong className="text-sm font-semibold text-[var(--text)]">
                          {btn.label}
                        </strong>
                        <span
                          className={`botdesk-badge text-[11px] ${
                            btn.actionType === "REQUEST_CONTACT"
                              ? "paused"
                              : "blue"
                          }`}
                        >
                          {btn.actionType === "REQUEST_CONTACT"
                            ? "Phone"
                            : "Text"}
                        </span>
                        {btn.actionType === "SEND_TEXT" &&
                          btn.autoDeleteReply && (
                            <span className="botdesk-badge text-[11px] paused">
                              Auto-delete {btn.deleteAfterSeconds || 30}s
                            </span>
                          )}
                        <span
                          className={`botdesk-badge text-[10px] ${
                            btn.isEnabled ? "enabled" : "paused"
                          }`}
                        >
                          {btn.isEnabled ? "Enabled" : "Disabled"}
                        </span>
                      </div>

                      {btn.actionType === "SEND_TEXT" && btn.replyText && (
                        <p className="text-xs text-[var(--muted)] mt-1 line-clamp-1 italic">
                          "{btn.replyText}"
                        </p>
                      )}
                    </div>

                    {/* Toolbar Controls */}
                    <div className="flex items-center gap-1.5 self-end sm:self-center flex-shrink-0">
                      <button
                        type="button"
                        disabled={idx === 0}
                        onClick={() => handleMove(idx, "up")}
                        className="botdesk-btn text-xs py-1 px-2 min-h-[30px]"
                        title="Move Up"
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        disabled={idx === buttons.length - 1}
                        onClick={() => handleMove(idx, "down")}
                        className="botdesk-btn text-xs py-1 px-2 min-h-[30px]"
                        title="Move Down"
                      >
                        ↓
                      </button>
                      <button
                        type="button"
                        onClick={() => handleToggle(idx)}
                        className="botdesk-btn text-xs py-1 px-2.5 min-h-[30px]"
                      >
                        {btn.isEnabled ? "Disable" : "Enable"}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleOpenEdit(idx)}
                        className="botdesk-btn text-xs py-1 px-2.5 min-h-[30px]"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(idx)}
                        className="botdesk-btn danger text-xs py-1 px-2 min-h-[30px]"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Bottom Save Action */}
            <div className="pt-4 border-t border-[var(--border)] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <span className="text-xs text-[var(--muted)]">
                Phone sharing is optional. Auto-delete applies only to text replies.
              </span>
              <button
                type="button"
                onClick={handleSaveAllToDatabase}
                disabled={saving}
                className="botdesk-btn primary text-xs"
              >
                {saving ? "Saving Menu..." : "Save Menu Changes"}
              </button>
            </div>
          </div>
        </div>

        {/* Right Column: Telegram Live Preview */}
        <div className="lg:col-span-5 botdesk-card">
          <div className="card-header">
            <div>
              <h2 className="text-base font-bold text-[var(--text)]">
                Telegram preview
              </h2>
              <p className="text-xs text-[var(--muted)]">
                Try /start or tap a reply keyboard button
              </p>
            </div>
            <button
              type="button"
              onClick={resetPreviewChat}
              className="botdesk-btn text-xs py-1 px-2.5 min-h-[30px]"
            >
              Reset
            </button>
          </div>

          <div className="card-body space-y-4">
            {/* Chat Box */}
            <div className="chat-window min-h-[240px]">
              {previewMessages.map((msg) => (
                <div
                  key={msg.id}
                  className={`chat-bubble ${
                    msg.sender === "user" ? "user" : ""
                  }`}
                >
                  {msg.text}
                </div>
              ))}
            </div>

            {/* Telegram Reply Keyboard Button Tray */}
            <div>
              <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--muted)] mb-2 block">
                Telegram Reply Keyboard Tray
              </span>
              <div className="flex flex-wrap gap-2">
                {buttons.filter((b) => b.isEnabled).length === 0 ? (
                  <span className="text-xs text-[var(--muted)] italic">
                    No active buttons in keyboard tray.
                  </span>
                ) : (
                  buttons
                    .filter((b) => b.isEnabled)
                    .map((btn, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => handlePreviewButtonPress(btn)}
                        className="botdesk-btn text-xs py-1.5 px-3 bg-[var(--surface)] border-[var(--border)] text-[var(--text)] hover:bg-[var(--bluebg)] hover:text-[var(--accent)]"
                      >
                        {btn.label}
                      </button>
                    ))
                )}
              </div>
            </div>

            <p className="text-[11px] text-[var(--muted)] italic pt-2 border-t border-[var(--border)]">
              Simulated preview: Tapping a button tests the response and auto-delete countdown in the browser. Live Telegram bot uses PostgreSQL menu configuration.
            </p>
          </div>
        </div>
      </div>

      {/* Add / Edit Dialog */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-xl bg-[var(--panel)] border border-[var(--border)] p-6 shadow-2xl">
            <h2 className="text-lg font-bold text-[var(--text)] mb-1">
              {editingIndex !== null ? "Edit button" : "Add button"}
            </h2>
            <p className="text-xs text-[var(--muted)] mb-4">
              Configure button label, action type, and optional auto-delete.
            </p>

            {formError && (
              <div className="mb-4 p-2.5 rounded-lg bg-[var(--redbg)] border border-[var(--red)] text-xs text-[var(--red)]">
                {formError}
              </div>
            )}

            <form onSubmit={handleSaveModal} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--muted)] mb-1">
                  Button Label
                </label>
                <input
                  type="text"
                  required
                  maxLength={64}
                  value={formLabel}
                  onChange={(e) => setFormLabel(e.target.value)}
                  placeholder="e.g. 📢 Announcements"
                  className="botdesk-input text-xs"
                />
                <span className="text-[11px] text-[var(--muted)] text-right block mt-0.5">
                  {formLabel.length} / 64
                </span>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--muted)] mb-1">
                  Action
                </label>
                <select
                  value={formAction}
                  onChange={(e) =>
                    setFormAction(
                      e.target.value as "SEND_TEXT" | "REQUEST_CONTACT"
                    )
                  }
                  className="botdesk-select text-xs"
                >
                  <option value="SEND_TEXT">Send text</option>
                  <option value="REQUEST_CONTACT">Request phone number</option>
                </select>
              </div>

              {formAction === "SEND_TEXT" && (
                <>
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--muted)] mb-1">
                      Bot Reply Text
                    </label>
                    <textarea
                      rows={4}
                      required
                      maxLength={2000}
                      value={formReply}
                      onChange={(e) => setFormReply(e.target.value)}
                      placeholder="Type the reply..."
                      className="botdesk-textarea text-xs"
                    />
                    <span className="text-[11px] text-[var(--muted)] text-right block mt-0.5">
                      {formReply.length} / 2000
                    </span>
                  </div>

                  {/* Auto-Delete Option */}
                  <div className="p-3 rounded-lg border border-[var(--border)] bg-[var(--bg)] space-y-3">
                    <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-[var(--text)]">
                      <input
                        type="checkbox"
                        checked={formAutoDelete}
                        onChange={(e) => setFormAutoDelete(e.target.checked)}
                        className="accent-[var(--accent)]"
                      />
                      <span>Auto-delete bot reply</span>
                    </label>

                    {formAutoDelete && (
                      <div>
                        <label className="block text-[11px] font-medium text-[var(--muted)] mb-1">
                          Delete after (seconds)
                        </label>
                        <input
                          type="number"
                          min={5}
                          max={86400}
                          required
                          value={formDeleteSeconds}
                          onChange={(e) =>
                            setFormDeleteSeconds(parseInt(e.target.value) || 0)
                          }
                          className="botdesk-input text-xs w-32"
                        />
                        <span className="text-[11px] text-[var(--muted)] mt-1 block">
                          Delay between 5 and 86,400 seconds (24h).
                        </span>
                      </div>
                    )}
                  </div>
                </>
              )}

              <label className="flex items-center gap-2 cursor-pointer text-xs font-medium text-[var(--text)]">
                <input
                  type="checkbox"
                  checked={formEnabled}
                  onChange={(e) => setFormEnabled(e.target.checked)}
                  className="accent-[var(--accent)]"
                />
                <span>Enabled</span>
              </label>

              <div className="flex justify-end gap-2 pt-3 border-t border-[var(--border)]">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="botdesk-btn text-xs"
                >
                  Cancel
                </button>
                <button type="submit" className="botdesk-btn primary text-xs">
                  Save button
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
