"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export interface BotData {
  id: string;
  name: string;
  username: string;
  isActive: boolean;
  tokenEnvVar: string;
  createdAt: string | Date;
  config?: {
    welcomeMessage: string;
  } | null;
  _count: {
    users: number;
  };
}

export interface TelegramUserData {
  id: string;
  telegramId: string;
  firstName: string | null;
  lastName: string | null;
  username: string | null;
  telegramPhNo: string | null;
  firstSeenAt: string | Date;
  lastSeenAt: string | Date;
}

interface BotdeskDashboardProps {
  bots: BotData[];
  initialUsersByBot: Record<string, TelegramUserData[]>;
}

export function BotdeskDashboard({
  bots,
  initialUsersByBot,
}: BotdeskDashboardProps) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    new Set(bots.length > 0 ? [bots[0].id] : [])
  );
  const [activeBotId, setActiveBotId] = useState<string>(
    bots.length > 0 ? bots[0].id : ""
  );
  const [activeTab, setActiveTab] = useState<"settings" | "users">("settings");
  const [showAddModal, setShowAddModal] = useState(false);

  // Active bot welcome message edit state
  const activeBot = bots.find((b) => b.id === activeBotId) || bots[0];
  const [welcomeText, setWelcomeText] = useState(
    activeBot?.config?.welcomeMessage ||
      "Hello! Welcome to the bot. Tap the button below to get started."
  );
  const [savingWelcome, setSavingWelcome] = useState(false);
  const [saveStatus, setSaveStatus] = useState<string | null>(null);

  // Chat simulator state
  const [chatMessages, setChatMessages] = useState<
    Array<{ id: number; text: string; sender: "user" | "bot" | "note" }>
  >([
    {
      id: 1,
      text: "Draft preview — send /start to test a response.",
      sender: "note",
    },
  ]);
  const [chatInput, setChatInput] = useState("");

  const filteredBots = bots.filter((b) =>
    (b.name + " " + b.username).toLowerCase().includes(search.toLowerCase())
  );

  const handleSelectBot = (id: string) => {
    setActiveBotId(id);
    const bot = bots.find((b) => b.id === id);
    if (bot) {
      setWelcomeText(
        bot.config?.welcomeMessage ||
          "Hello! Welcome to the bot. Tap the button below to get started."
      );
      setSaveStatus(null);
      setChatMessages([
        {
          id: Date.now(),
          text: `Now viewing ${bot.name} (@${bot.username}). Send /start to test.`,
          sender: "note",
        },
      ]);
    }
  };

  const handleSaveWelcome = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeBot) return;
    setSavingWelcome(true);
    setSaveStatus(null);

    try {
      const res = await fetch(`/api/bots/${activeBot.id}/config`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ welcomeMessage: welcomeText }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to save welcome message");
      }

      setSaveStatus("Welcome response saved! New /start in Telegram will use this greeting.");
      router.refresh();
    } catch (err) {
      setSaveStatus(
        err instanceof Error ? `Error: ${err.message}` : "Failed to save message."
      );
    } finally {
      setSavingWelcome(false);
    }
  };

  const handleSendChatMessage = (e: React.FormEvent) => {
    e.preventDefault();
    const text = chatInput.trim();
    if (!text) return;

    const userMsgId = Date.now();
    const newMsgs = [
      ...chatMessages,
      { id: userMsgId, text, sender: "user" as const },
    ];
    setChatInput("");

    if (text.toLowerCase() === "/start") {
      newMsgs.push({
        id: userMsgId + 1,
        text: welcomeText,
        sender: "bot" as const,
      });
    } else {
      newMsgs.push({
        id: userMsgId + 1,
        text: `Demo reply: You sent "${text}". To test menu buttons, visit the Bot Menu builder.`,
        sender: "bot" as const,
      });
    }

    setChatMessages(newMsgs);
  };

  const resetChat = () => {
    setChatMessages([
      {
        id: Date.now(),
        text: "Draft preview — send /start to test a response.",
        sender: "note",
      },
    ]);
  };

  const activeBotUsers = initialUsersByBot[activeBotId] || [];

  return (
    <div className="space-y-6">
      {/* Heading */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-[var(--text)]">
            Your bots, in sync.
          </h1>
          <p className="text-sm text-[var(--muted)] mt-1">
            Manage one, a few, or all. Keep every bot independent.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setShowAddModal(true)}
          className="botdesk-btn primary self-start sm:self-auto"
        >
          ＋ Add bot
        </button>
      </div>

      {/* Summary Metrics */}
      <div className="summary-grid">
        <div className="metric-box">
          <span>Connected bots</span>
          <strong>{bots.length}</strong>
        </div>
        <div className="metric-box">
          <span>Automation enabled</span>
          <strong className="text-[var(--green)]">
            {bots.filter((b) => b.isActive).length}
          </strong>
        </div>
        <div className="metric-box">
          <span>Total registered users</span>
          <strong className="text-[var(--accent)]">
            {bots.reduce((acc, b) => acc + (b._count?.users || 0), 0)}
          </strong>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <input
          type="search"
          placeholder="Search bots…"
          aria-label="Search bots"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="botdesk-input sm:max-w-xs text-sm"
        />
        <span className="text-xs text-[var(--muted)]">
          Scope:{" "}
          <strong className="text-[var(--text)]">
            {selectedIds.size === 0
              ? "No bots selected"
              : selectedIds.size === bots.length
              ? "All bots"
              : `${selectedIds.size} selected`}
          </strong>
        </span>
      </div>

      {/* Bots Table */}
      <div className="botdesk-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm border-collapse">
            <thead>
              <tr className="border-b border-[var(--border)] bg-[var(--surface)] text-[var(--muted)] text-xs uppercase font-medium">
                <th className="py-2.5 px-3 w-10 text-center">
                  <input
                    type="checkbox"
                    checked={
                      filteredBots.length > 0 &&
                      filteredBots.every((b) => selectedIds.has(b.id))
                    }
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedIds(new Set(filteredBots.map((b) => b.id)));
                      } else {
                        setSelectedIds(new Set());
                      }
                    }}
                    className="accent-[var(--accent)] cursor-pointer"
                  />
                </th>
                <th className="py-2.5 px-4">Bot</th>
                <th className="py-2.5 px-4">Automation</th>
                <th className="py-2.5 px-4">Connection</th>
                <th className="py-2.5 px-4">Users</th>
                <th className="py-2.5 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {filteredBots.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-[var(--muted)]">
                    No bots found matching "{search}".
                  </td>
                </tr>
              ) : (
                filteredBots.map((b) => {
                  const isViewing = b.id === activeBotId;
                  const isChecked = selectedIds.has(b.id);

                  return (
                    <tr
                      key={b.id}
                      className={`hover:bg-[var(--surface)] transition ${
                        isChecked ? "bg-[var(--bluebg)]/40" : ""
                      }`}
                    >
                      <td className="py-3 px-3 text-center">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={(e) => {
                            const next = new Set(selectedIds);
                            e.target.checked ? next.add(b.id) : next.delete(b.id);
                            setSelectedIds(next);
                          }}
                          className="accent-[var(--accent)] cursor-pointer"
                        />
                      </td>

                      <td className="py-3 px-4">
                        <button
                          type="button"
                          onClick={() => handleSelectBot(b.id)}
                          className="flex items-center gap-3 text-left w-full group"
                        >
                          <span className="w-8 h-8 rounded-lg bg-[var(--surface)] border border-[var(--border)] grid place-items-center font-bold text-sm text-[var(--accent)] flex-shrink-0">
                            {b.name.charAt(0).toUpperCase()}
                          </span>
                          <div>
                            <div className="font-semibold text-sm text-[var(--text)] group-hover:text-[var(--accent)] flex items-center gap-1.5">
                              {b.name}
                              {isViewing && (
                                <span className="text-[11px] font-normal text-[var(--accent)] bg-[var(--bluebg)] px-1.5 py-0.2 rounded">
                                  Viewing
                                </span>
                              )}
                            </div>
                            <div className="text-xs text-[var(--muted)]">
                              @{b.username}
                            </div>
                          </div>
                        </button>
                      </td>

                      <td className="py-3 px-4">
                        <span
                          className={`botdesk-badge ${
                            b.isActive ? "enabled" : "paused"
                          }`}
                        >
                          {b.isActive ? "Enabled" : "Paused"}
                        </span>
                      </td>

                      <td className="py-3 px-4">
                        <span className="botdesk-badge healthy">
                          Healthy (Long Polling)
                        </span>
                      </td>

                      <td className="py-3 px-4 font-mono text-xs text-[var(--text)]">
                        {b._count?.users || 0}
                      </td>

                      <td className="py-3 px-4 text-right">
                        <Link
                          href="/menu"
                          className="text-xs font-semibold text-[var(--accent)] hover:underline inline-flex items-center gap-1"
                        >
                          Bot Menu →
                        </Link>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Details Split View for Active Bot */}
      {activeBot && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 mt-6">
          {/* Left Card: Bot Configuration */}
          <section className="lg:col-span-7 botdesk-card">
            <div className="card-header">
              <div>
                <h2 className="text-base font-bold text-[var(--text)]">
                  {activeBot.name}
                </h2>
                <p className="text-xs text-[var(--muted)]">
                  @{activeBot.username} · ID: {activeBot.id}
                </p>
              </div>
              <span className="text-xs text-[var(--muted)] font-mono border border-[var(--border)] px-2 py-0.5 rounded">
                Individual Bot
              </span>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-[var(--border)] px-4 gap-2 bg-[var(--surface)]">
              <button
                type="button"
                onClick={() => setActiveTab("settings")}
                className={`py-2.5 px-3 text-xs font-semibold border-b-2 transition ${
                  activeTab === "settings"
                    ? "border-[var(--accent)] text-[var(--accent)]"
                    : "border-transparent text-[var(--muted)] hover:text-[var(--text)]"
                }`}
              >
                Settings (Welcome Response)
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("users")}
                className={`py-2.5 px-3 text-xs font-semibold border-b-2 transition ${
                  activeTab === "users"
                    ? "border-[var(--accent)] text-[var(--accent)]"
                    : "border-transparent text-[var(--muted)] hover:text-[var(--text)]"
                }`}
              >
                Registered Users ({activeBotUsers.length})
              </button>
            </div>

            <div className="card-body">
              {activeTab === "settings" ? (
                <form onSubmit={handleSaveWelcome} className="space-y-4">
                  {saveStatus && (
                    <div
                      className={`p-3 rounded-lg text-xs border ${
                        saveStatus.startsWith("Welcome")
                          ? "bg-[var(--greenbg)] border-[var(--green)] text-[var(--green)]"
                          : "bg-[var(--redbg)] border-[var(--red)] text-[var(--red)]"
                      }`}
                    >
                      {saveStatus}
                    </div>
                  )}

                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--muted)] mb-1">
                      Display Name
                    </label>
                    <input
                      type="text"
                      disabled
                      value={activeBot.name}
                      className="botdesk-input text-xs opacity-70 cursor-not-allowed"
                    />
                    <span className="text-[11px] text-[var(--muted)] mt-0.5 block">
                      Configured in database seed / bot record.
                    </span>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--muted)] mb-1">
                      Welcome Response Text
                    </label>
                    <textarea
                      rows={5}
                      required
                      value={welcomeText}
                      onChange={(e) => setWelcomeText(e.target.value)}
                      maxLength={400}
                      className="botdesk-textarea text-xs"
                      placeholder="Welcome greeting sent on Telegram /start..."
                    />
                    <div className="mt-1 flex items-center justify-between text-[11px] text-[var(--muted)]">
                      <span>Saved directly to PostgreSQL bot_configs.</span>
                      <span>{welcomeText.length} / 400</span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-[var(--border)]">
                    <Link
                      href="/menu"
                      className="text-xs text-[var(--accent)] hover:underline"
                    >
                      Manage Bot Menu Keyboard →
                    </Link>

                    <button
                      type="submit"
                      disabled={savingWelcome}
                      className="botdesk-btn primary text-xs"
                    >
                      {savingWelcome ? "Saving..." : "Save Welcome Message"}
                    </button>
                  </div>
                </form>
              ) : (
                /* Registered Users List */
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-xs text-[var(--muted)] pb-2 border-b border-[var(--border)]">
                    <span>
                      Users who interacted with this bot instance (/start or contact sharing).
                    </span>
                    <span className="font-mono">{activeBotUsers.length} total</span>
                  </div>

                  {activeBotUsers.length === 0 ? (
                    <div className="py-8 text-center text-xs text-[var(--muted)] italic">
                      No users recorded for this bot yet. Send /start in Telegram to see your profile here.
                    </div>
                  ) : (
                    <div className="overflow-x-auto max-h-[300px]">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-[var(--surface)] text-[var(--muted)] uppercase font-medium">
                          <tr>
                            <th className="py-2 px-2.5">Telegram ID</th>
                            <th className="py-2 px-2.5">Name</th>
                            <th className="py-2 px-2.5">Username</th>
                            <th className="py-2 px-2.5">Phone</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[var(--border)]">
                          {activeBotUsers.map((u) => {
                            const name = [u.firstName, u.lastName]
                              .filter(Boolean)
                              .join(" ");

                            return (
                              <tr key={u.id} className="hover:bg-[var(--surface)]">
                                <td className="py-2 px-2.5 font-mono text-[var(--text)]">
                                  {u.telegramId}
                                </td>
                                <td className="py-2 px-2.5 font-medium text-[var(--text)]">
                                  {name || "—"}
                                </td>
                                <td className="py-2 px-2.5 text-[var(--accent)]">
                                  {u.username ? `@${u.username}` : "—"}
                                </td>
                                <td className="py-2 px-2.5">
                                  {u.telegramPhNo ? (
                                    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono bg-[var(--greenbg)] text-[var(--green)]">
                                      📞 {u.telegramPhNo}
                                    </span>
                                  ) : (
                                    <span className="text-[var(--muted)] italic">
                                      Not shared
                                    </span>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </div>
          </section>

          {/* Right Card: Interactive Chat Simulator */}
          <section className="lg:col-span-5 botdesk-card">
            <div className="card-header">
              <div>
                <h2 className="text-base font-bold text-[var(--text)]">
                  Try a conversation
                </h2>
                <p className="text-xs text-[var(--muted)]">
                  {activeBot.name} · draft preview
                </p>
              </div>
              <button
                type="button"
                onClick={resetChat}
                className="botdesk-btn text-xs py-1 px-2.5 min-h-[30px]"
              >
                Reset
              </button>
            </div>

            <div className="card-body space-y-3">
              {/* Chat Log */}
              <div className="chat-window">
                {chatMessages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`chat-bubble ${
                      msg.sender === "user"
                        ? "user"
                        : msg.sender === "note"
                        ? "note"
                        : ""
                    }`}
                  >
                    {msg.text}
                  </div>
                ))}
              </div>

              {/* Composer */}
              <form onSubmit={handleSendChatMessage} className="flex gap-2">
                <input
                  type="text"
                  placeholder="Send /start or test a message..."
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  className="botdesk-input text-xs"
                />
                <button type="submit" className="botdesk-btn primary text-xs">
                  Send
                </button>
              </form>

              <p className="text-[11px] text-[var(--muted)] italic">
                Local simulation only. Live messages are processed in real time by your running long polling bot runner.
              </p>
            </div>
          </section>
        </div>
      )}

      {/* Safe Add Bot Dialog */}
      {showAddModal && (
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
                Dynamic multi-bot onboarding with runtime token management is planned for Phase 2.
              </p>
              <div className="p-3 rounded-lg bg-[var(--bluebg)] text-[var(--accent)] text-xs border border-[var(--border)]">
                <strong>Current Scope:</strong> Your backstage is actively running in single-bot local mode. It connects securely to the test bot specified in your local <code className="font-mono font-bold">.env</code> file (<code className="font-mono">TELEGRAM_BOT_TOKEN</code>).
              </div>
              <p className="text-xs text-[var(--text)]">
                To test or edit your bot, use the existing bot record in your dashboard.
              </p>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-[var(--border)]">
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="botdesk-btn primary text-xs"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
