"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChannelInput } from "@/lib/channel-service";

export interface BotOption {
  id: string;
  name: string;
  username: string;
}

interface BotdeskChannelsPageProps {
  bots: BotOption[];
  initialBotId: string;
  initialChannelsByBot: Record<string, ChannelInput[]>;
}

export function BotdeskChannelsPage({
  bots,
  initialBotId,
  initialChannelsByBot,
}: BotdeskChannelsPageProps) {
  const router = useRouter();
  const [selectedBotId, setSelectedBotId] = useState<string>(initialBotId);
  const [channelsByBot, setChannelsByBot] = useState<
    Record<string, ChannelInput[]>
  >(initialChannelsByBot);

  const channels = channelsByBot[selectedBotId] || [];
  const activeBot = bots.find((b) => b.id === selectedBotId) || bots[0];

  // Modal State
  const [showModal, setShowModal] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [formName, setFormName] = useState("");
  const [formChatId, setFormChatId] = useState("");
  const [formInviteLink, setFormInviteLink] = useState("");
  const [formButtonLabel, setFormButtonLabel] = useState("");
  const [formIsRequired, setFormIsRequired] = useState(true);
  const [formIsEnabled, setFormIsEnabled] = useState(true);
  const [formError, setFormError] = useState<string | null>(null);

  // Saving state
  const [saving, setSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  const handleOpenAdd = () => {
    setEditingIndex(null);
    setFormName("");
    setFormChatId("");
    setFormInviteLink("");
    setFormButtonLabel("");
    setFormIsRequired(true);
    setFormIsEnabled(true);
    setFormError(null);
    setShowModal(true);
  };

  const handleOpenEdit = (index: number) => {
    const ch = channels[index];
    setEditingIndex(index);
    setFormName(ch.name);
    setFormChatId(ch.telegramChatId);
    setFormInviteLink(ch.inviteLink);
    setFormButtonLabel(ch.buttonLabel);
    setFormIsRequired(ch.isRequired);
    setFormIsEnabled(ch.isEnabled);
    setFormError(null);
    setShowModal(true);
  };

  const handleSaveModal = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const trimmedName = formName.trim();
    if (!trimmedName) {
      setFormError("Channel display name is required.");
      return;
    }

    const trimmedChatId = formChatId.trim();
    if (!trimmedChatId) {
      setFormError("Telegram chat ID or username is required.");
      return;
    }
    if (
      !trimmedChatId.startsWith("@") &&
      !/^-?\d{5,20}$/.test(trimmedChatId)
    ) {
      setFormError(
        "Chat target must be a channel username (e.g. '@mychannel') or a numeric ID (e.g. '-1001234567890')."
      );
      return;
    }

    const trimmedLink = formInviteLink.trim();
    if (!trimmedLink) {
      setFormError("Channel invite link is required.");
      return;
    }
    const lowerLink = trimmedLink.toLowerCase();
    if (
      !lowerLink.startsWith("https://t.me/") &&
      !lowerLink.startsWith("https://telegram.me/")
    ) {
      setFormError(
        "Invite link must be a valid Telegram URL (e.g. 'https://t.me/channel_name' or 'https://t.me/+hash')."
      );
      return;
    }

    const trimmedButtonLabel = formButtonLabel.trim();
    if (!trimmedButtonLabel) {
      setFormError("Inline button label is required.");
      return;
    }

    const newChannel: ChannelInput = {
      ...(editingIndex !== null ? { id: channels[editingIndex].id } : {}),
      name: trimmedName,
      telegramChatId: trimmedChatId,
      inviteLink: trimmedLink,
      buttonLabel: trimmedButtonLabel,
      isRequired: formIsRequired,
      isEnabled: formIsEnabled,
      order: editingIndex !== null ? channels[editingIndex].order : channels.length,
    };

    let updatedList: ChannelInput[];
    if (editingIndex !== null) {
      updatedList = [...channels];
      updatedList[editingIndex] = newChannel;
    } else {
      if (channels.length >= 20) {
        setFormError("Maximum limit of 20 channels reached.");
        return;
      }
      updatedList = [...channels, newChannel];
    }

    setChannelsByBot({
      ...channelsByBot,
      [selectedBotId]: updatedList,
    });
    setShowModal(false);
  };

  const handleMove = (index: number, direction: "up" | "down") => {
    const target = direction === "up" ? index - 1 : index + 1;
    if (target < 0 || target >= channels.length) return;

    const copy = [...channels];
    const temp = copy[index];
    copy[index] = copy[target];
    copy[target] = temp;
    const reordered = copy.map((c, i) => ({ ...c, order: i }));

    setChannelsByBot({
      ...channelsByBot,
      [selectedBotId]: reordered,
    });
  };

  const handleToggle = (index: number) => {
    const copy = [...channels];
    copy[index] = { ...copy[index], isEnabled: !copy[index].isEnabled };
    setChannelsByBot({
      ...channelsByBot,
      [selectedBotId]: copy,
    });
  };

  const handleDelete = (index: number) => {
    const ch = channels[index];
    if (!confirm(`Delete channel "${ch.name}"?`)) return;

    const filtered = channels
      .filter((_, i) => i !== index)
      .map((c, i) => ({ ...c, order: i }));
    setChannelsByBot({
      ...channelsByBot,
      [selectedBotId]: filtered,
    });
  };

  const handleSaveAllToDatabase = async () => {
    setSaving(true);
    setStatusMessage(null);

    try {
      const res = await fetch(`/api/bots/${selectedBotId}/channels`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channels }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to save channels");
      }

      setChannelsByBot({
        ...channelsByBot,
        [selectedBotId]: data.channels || channels,
      });

      setStatusMessage({
        type: "success",
        text: "Channels saved successfully in PostgreSQL! Users will see these channels when requesting access in Telegram.",
      });
      router.refresh();
    } catch (err) {
      setStatusMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Error saving channels",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Screen Heading */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider bg-sky-500/10 text-[#38bdf8] border border-sky-500/25 mb-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-[#38bdf8] animate-pulse" /> Community & Membership
          </span>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white">
            Telegram Channels & Communities
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Configure official channels for membership verification, gating, and voluntary user subscription.
          </p>
        </div>
      </div>

      {/* Administrator Setup Advice Banner */}
      <div className="p-4 sm:p-5 rounded-2xl bg-[#0f172a]/60 border border-slate-800/80 text-xs text-slate-300 leading-relaxed space-y-3 shadow-lg backdrop-blur-sm">
        <div className="flex items-center gap-2 text-[#38bdf8] font-semibold text-xs">
          <span className="text-base">ℹ️</span>
          <span>Administrator Setup Guide for Channel Verification</span>
        </div>
        <p className="text-[11px] text-slate-400">
          For reliable membership verification via the Telegram Bot API, ensure your bot (<code className="font-semibold text-[#38bdf8] font-mono bg-[#090d16] px-1.5 py-0.5 rounded border border-slate-800">@{activeBot?.username || "your_bot"}</code>) is added as an <strong className="text-white font-semibold">Administrator</strong> in each channel or supergroup.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1 border-t border-slate-800/80 text-[11px]">
          <div className="p-3 rounded-xl bg-[#0b0f19] border border-slate-800/80 hover:border-slate-700 transition">
            <span className="font-semibold text-white block mb-0.5">📢 Public Channels</span>
            <span className="text-slate-400 font-mono text-[10px]">@mychannel</span>
          </div>
          <div className="p-3 rounded-xl bg-[#0b0f19] border border-slate-800/80 hover:border-slate-700 transition">
            <span className="font-semibold text-white block mb-0.5">🔒 Private Channels</span>
            <span className="text-slate-400 font-mono text-[10px]">-1001234567890</span>
          </div>
          <div className="p-3 rounded-xl bg-[#0b0f19] border border-slate-800/80 hover:border-slate-700 transition">
            <span className="font-semibold text-white block mb-0.5">🛡️ Voluntary Opt-In</span>
            <span className="text-slate-400 text-[10px]">Users tap &quot;Check Joined&quot;</span>
          </div>
        </div>
      </div>

      {statusMessage && (
        <div
          className={`p-4 rounded-xl text-xs border flex items-center justify-between gap-3 shadow-md ${
            statusMessage.type === "success"
              ? "bg-emerald-950/40 border-emerald-800/60 text-emerald-200"
              : "bg-rose-950/40 border-rose-800/60 text-rose-200"
          }`}
        >
          <div className="flex items-center gap-2">
            <span>{statusMessage.type === "success" ? "✅" : "⚠️"}</span>
            <span className="font-medium">{statusMessage.text}</span>
          </div>
          <button
            type="button"
            onClick={() => setStatusMessage(null)}
            className="text-xs opacity-70 hover:opacity-100 p-1 cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}

      {/* Main Channels Card */}
      <div className="p-5 sm:p-6 rounded-2xl border border-slate-800/80 bg-[#0f1420] shadow-xl space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-5 border-b border-slate-800/80">
          <div>
            <div className="flex items-center gap-2.5">
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <span>📢</span>
                <span>Configured Channels</span>
              </h2>
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-mono font-semibold bg-[#0c2538] text-[#38bdf8] border border-sky-500/30">
                {channels.length} / 20
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Channels attached to <span className="font-semibold text-white">{activeBot?.name}</span> (@{activeBot?.username})
            </p>
          </div>

          <div className="flex items-center gap-2.5 flex-wrap">
            <div className="flex items-center gap-2">
              <label className="text-[11px] text-slate-400 font-semibold uppercase tracking-wider hidden sm:inline">
                Bot:
              </label>
              <select
                value={selectedBotId}
                onChange={(e) => setSelectedBotId(e.target.value)}
                className="text-xs min-h-[38px] py-1.5 px-3 rounded-xl bg-[#0d121c] border border-slate-800 text-white font-medium focus:outline-none focus:border-[#38bdf8] focus:ring-1 focus:ring-sky-500/40 transition cursor-pointer"
              >
                {bots.map((b) => (
                  <option key={b.id} value={b.id} className="bg-[#0f1420] text-white">
                    {b.name} (@{b.username})
                  </option>
                ))}
              </select>
            </div>

            <button
              type="button"
              onClick={handleOpenAdd}
              disabled={channels.length >= 20}
              className="inline-flex items-center gap-1.5 text-xs py-2 px-4 rounded-xl font-bold bg-[#38bdf8] text-slate-950 hover:bg-[#20b3f7] active:scale-[0.98] transition shadow-sm cursor-pointer disabled:opacity-50 disabled:pointer-events-none"
            >
              <span>＋ Add Channel</span>
            </button>
          </div>
        </div>

        <div className="space-y-4">
          {channels.length === 0 ? (
            <div className="py-14 text-center text-xs text-slate-400 border border-dashed border-slate-800/80 rounded-2xl bg-[#0b0f19]/40 space-y-2">
              <div className="text-2xl">📢</div>
              <p>No channels configured yet for this bot.</p>
              <p className="text-[11px] text-slate-500">Click &quot;＋ Add Channel&quot; to configure your first Telegram channel.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {channels.map((ch, idx) => (
                <div
                  key={idx}
                  className={`p-4 sm:p-5 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-all shadow-sm ${
                    ch.isEnabled
                      ? "bg-[#131926] border-slate-800/80 hover:border-sky-500/40 hover:shadow-md"
                      : "bg-[#131926]/40 border-slate-800/40 opacity-60"
                  }`}
                >
                  <div className="space-y-2 min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-[#090d16] text-slate-400 border border-slate-800 font-mono">
                        #{idx + 1}
                      </span>
                      <strong className="text-sm sm:text-base font-bold text-white">
                        {ch.name}
                      </strong>

                      <span
                        className={`text-[10px] px-2.5 py-0.5 rounded-full inline-flex items-center gap-1.5 font-bold uppercase tracking-wider border ${
                          ch.isRequired
                            ? "bg-amber-500/10 text-amber-400 border-amber-500/25"
                            : "bg-sky-500/10 text-[#38bdf8] border-sky-500/25"
                        }`}
                      >
                        <span className={`w-1.5 h-1.5 rounded-full ${ch.isRequired ? "bg-amber-400" : "bg-[#38bdf8]"}`} />
                        {ch.isRequired ? "REQUIRED GATE" : "OPTIONAL GATE"}
                      </span>

                      <span
                        className={`text-[10px] px-2.5 py-0.5 rounded-full inline-flex items-center gap-1.5 font-bold uppercase tracking-wider border ${
                          ch.isEnabled
                            ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/25"
                            : "bg-slate-800/50 text-slate-400 border-slate-700/50"
                        }`}
                      >
                        <span className={`w-1.5 h-1.5 rounded-full ${ch.isEnabled ? "bg-emerald-400" : "bg-slate-500"}`} />
                        {ch.isEnabled ? "ENABLED" : "DISABLED"}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-x-4 gap-y-1.5 text-xs text-slate-400 pt-1">
                      <div className="flex items-center gap-1.5 truncate">
                        <span className="text-slate-500 font-semibold">🎯 Target:</span>
                        <span className="font-mono text-slate-200 bg-[#090d16] px-2 py-0.5 rounded border border-slate-800 text-[11px] truncate">
                          {ch.telegramChatId}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 truncate">
                        <span className="text-slate-500 font-semibold">🔘 Button:</span>
                        <span className="text-slate-200 font-medium truncate">&quot;{ch.buttonLabel}&quot;</span>
                      </div>
                      <div className="flex items-center gap-1.5 truncate">
                        <span className="text-slate-500 font-semibold">🔗 Link:</span>
                        <a
                          href={ch.inviteLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[#38bdf8] hover:underline truncate font-mono text-[11px] flex items-center gap-1"
                          title={ch.inviteLink}
                        >
                          {ch.inviteLink.replace(/^https:\/\/t\.me\/\+?.{4}/, "https://t.me/...")} ↗
                        </a>
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1.5 self-end sm:self-center flex-shrink-0">
                    <button
                      type="button"
                      disabled={idx === 0}
                      onClick={() => handleMove(idx, "up")}
                      className="bg-[#0d121c] border border-slate-800 hover:border-slate-700 text-slate-300 hover:text-white text-xs py-1 px-2.5 min-h-[30px] rounded-lg disabled:opacity-30 disabled:pointer-events-none transition cursor-pointer"
                      title="Move Up"
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      disabled={idx === channels.length - 1}
                      onClick={() => handleMove(idx, "down")}
                      className="bg-[#0d121c] border border-slate-800 hover:border-slate-700 text-slate-300 hover:text-white text-xs py-1 px-2.5 min-h-[30px] rounded-lg disabled:opacity-30 disabled:pointer-events-none transition cursor-pointer"
                      title="Move Down"
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      onClick={() => handleToggle(idx)}
                      className={`bg-[#0d121c] border border-slate-800 hover:border-slate-700 text-xs py-1 px-3 min-h-[30px] rounded-lg font-semibold transition cursor-pointer ${
                        ch.isEnabled
                          ? "text-slate-400 hover:text-white"
                          : "text-emerald-400 border-emerald-500/40 hover:bg-emerald-500/10"
                      }`}
                    >
                      {ch.isEnabled ? "Disable" : "Enable"}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleOpenEdit(idx)}
                      className="bg-[#0c2538] border border-sky-500/40 text-[#38bdf8] hover:bg-sky-950/60 text-xs py-1 px-3.5 min-h-[30px] rounded-lg font-semibold transition cursor-pointer shadow-sm"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(idx)}
                      className="bg-rose-950/30 border border-rose-900/40 text-rose-300 hover:bg-rose-900/40 text-xs py-1 px-2.5 min-h-[30px] rounded-lg font-semibold transition cursor-pointer"
                      title="Delete channel"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Bottom Action */}
          <div className="pt-5 border-t border-slate-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <span className="text-xs text-slate-400">
              Channels are ordered as inline verification buttons. Click &quot;Save Channels to Database&quot; to persist changes to PostgreSQL.
            </span>
            <button
              type="button"
              onClick={handleSaveAllToDatabase}
              disabled={saving}
              className="inline-flex items-center gap-2 text-xs py-2.5 px-5 rounded-xl font-bold bg-[#38bdf8] text-slate-950 hover:bg-[#20b3f7] active:scale-[0.98] transition shadow-lg shadow-sky-950/40 cursor-pointer disabled:opacity-50"
            >
              {saving ? (
                <>
                  <svg className="animate-spin h-3.5 w-3.5 text-slate-950" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  <span>Saving Channels...</span>
                </>
              ) : (
                <>
                  <span>💾</span>
                  <span>Save Channels to Database</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Add / Edit Channel Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-fade-in">
          <div className="w-full max-w-lg rounded-2xl bg-[#0f1420] border border-slate-800 p-6 shadow-2xl space-y-5 text-slate-200">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3.5">
              <div>
                <h2 className="text-base font-bold text-white flex items-center gap-2">
                  <span>📢</span>
                  <span>{editingIndex !== null ? "Edit Telegram Channel" : "Add Telegram Channel"}</span>
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Configure channel identifiers for voluntary joining and Telegram API verification.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="text-slate-400 hover:text-white text-base p-1 rounded-lg hover:bg-slate-800/50 transition cursor-pointer"
              >
                ✕
              </button>
            </div>

            {formError && (
              <div className="p-3.5 rounded-xl bg-rose-950/40 border border-rose-800/60 text-xs text-rose-200 flex items-center gap-2">
                <span>⚠️</span>
                <span>{formError}</span>
              </div>
            )}

            <form onSubmit={handleSaveModal} className="space-y-4 text-xs">
              <div className="space-y-1.5">
                <label className="block font-semibold uppercase tracking-wider text-slate-400 text-[11px]">
                  Display Name (e.g. Official Announcements)
                </label>
                <input
                  type="text"
                  required
                  maxLength={64}
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="Official Announcements"
                  className="w-full bg-[#0d121c] border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-[#38bdf8] focus:ring-1 focus:ring-sky-500/40 transition"
                />
              </div>

              <div className="space-y-1.5">
                <label className="block font-semibold uppercase tracking-wider text-slate-400 text-[11px]">
                  Telegram Username or Chat ID (for Verification)
                </label>
                <input
                  type="text"
                  required
                  value={formChatId}
                  onChange={(e) => setFormChatId(e.target.value)}
                  placeholder="@mychannel or -1001234567890"
                  className="w-full bg-[#0d121c] border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs font-mono text-white placeholder-slate-500 focus:outline-none focus:border-[#38bdf8] focus:ring-1 focus:ring-sky-500/40 transition"
                />
                <span className="text-[11px] text-slate-500 block">
                  Used by the bot to verify membership via <code className="font-mono bg-[#090d16] text-[#38bdf8] px-1.5 py-0.5 rounded border border-slate-800">getChatMember</code>.
                </span>
              </div>

              <div className="space-y-1.5">
                <label className="block font-semibold uppercase tracking-wider text-slate-400 text-[11px]">
                  Invite Link (Opened by User in Telegram)
                </label>
                <input
                  type="url"
                  required
                  value={formInviteLink}
                  onChange={(e) => setFormInviteLink(e.target.value)}
                  placeholder="https://t.me/mychannel or https://t.me/+hash"
                  className="w-full bg-[#0d121c] border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs font-mono text-white placeholder-slate-500 focus:outline-none focus:border-[#38bdf8] focus:ring-1 focus:ring-sky-500/40 transition"
                />
                <span className="text-[11px] text-slate-500 block">
                  Must be a valid Telegram URL. Private invite links are treated as sensitive operational data.
                </span>
              </div>

              <div className="space-y-1.5">
                <label className="block font-semibold uppercase tracking-wider text-slate-400 text-[11px]">
                  Inline Button Label
                </label>
                <input
                  type="text"
                  required
                  maxLength={64}
                  value={formButtonLabel}
                  onChange={(e) => setFormButtonLabel(e.target.value)}
                  placeholder="📢 Join Announcement Channel"
                  className="w-full bg-[#0d121c] border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-[#38bdf8] focus:ring-1 focus:ring-sky-500/40 transition"
                />
              </div>

              <div className="p-3.5 rounded-xl border border-slate-800 bg-[#090d16] space-y-2">
                <label className="flex items-center gap-2.5 cursor-pointer text-xs font-semibold text-white">
                  <input
                    type="checkbox"
                    checked={formIsRequired}
                    onChange={(e) => setFormIsRequired(e.target.checked)}
                    className="w-4 h-4 rounded border-slate-700 bg-[#0d121c] text-[#38bdf8] accent-[#38bdf8] focus:ring-0 cursor-pointer"
                  />
                  <span>Required for Membership Verification</span>
                </label>
                <p className="text-[11px] text-slate-400 pl-6.5">
                  When checked, users must join this channel to pass the &quot;Check Joined&quot; gate. Optional channels do not block verification.
                </p>
              </div>

              <label className="flex items-center gap-2.5 cursor-pointer text-xs font-medium text-slate-300 p-3 rounded-xl border border-slate-800 bg-[#090d16]">
                <input
                  type="checkbox"
                  checked={formIsEnabled}
                  onChange={(e) => setFormIsEnabled(e.target.checked)}
                  className="w-4 h-4 rounded border-slate-700 bg-[#0d121c] text-[#38bdf8] accent-[#38bdf8] focus:ring-0 cursor-pointer"
                />
                <span>Enabled immediately</span>
              </label>

              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 rounded-xl border border-slate-800 hover:bg-slate-800/60 text-slate-300 hover:text-white text-xs font-semibold transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-[#38bdf8] hover:bg-[#20b3f7] text-slate-950 text-xs font-bold transition shadow-sm cursor-pointer"
                >
                  Save Channel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
