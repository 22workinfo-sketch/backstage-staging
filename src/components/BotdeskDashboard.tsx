"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "motion/react";
import { safeFetchJson } from "@/lib/api-client";

export interface BotData {
  id: string;
  name: string;
  username: string;
  telegramBotId?: string | null;
  isActive: boolean;
  tokenEnvVar: string;
  hasStoredToken?: boolean;
  tokenLast4?: string | null;
  description?: string | null;
  connectionStatus?: string;
  lastError?: string | null;
  lastCheckedAt?: string | null;
  createdAt: string | Date;
  config?: {
    welcomeMessage: string;
  } | null;
  _count?: {
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
  isSuperAdmin?: boolean;
}

export function BotdeskDashboard({
  bots: initialBots,
  initialUsersByBot,
  isSuperAdmin = true,
}: BotdeskDashboardProps) {
  const router = useRouter();
  const [bots, setBots] = useState<BotData[]>(initialBots);
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    new Set(initialBots.length > 0 ? [initialBots[0].id] : [])
  );
  const [activeBotId, setActiveBotId] = useState<string>(
    initialBots.length > 0 ? initialBots[0].id : ""
  );
  const [activeTab, setActiveTab] = useState<"settings" | "users">("settings");

  // Add Bot Modal State
  const [showAddModal, setShowAddModal] = useState(false);
  const [addName, setAddName] = useState("");
  const [addToken, setAddToken] = useState("");
  const [addDescription, setAddDescription] = useState("");
  const [showAddTokenText, setShowAddTokenText] = useState(false);
  const [addingBot, setAddingBot] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  // Edit / Replace Token Modal State
  const [editingBot, setEditingBot] = useState<BotData | null>(null);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editIsActive, setEditIsActive] = useState(true);
  const [editToken, setEditToken] = useState("");
  const [showEditTokenText, setShowEditTokenText] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  // Connection Testing State
  const [testingId, setTestingId] = useState<string | null>(null);
  const [globalNotice, setGlobalNotice] = useState<{
    type: "success" | "error" | "info";
    text: string;
  } | null>(null);

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
  const [simFlowStructure, setSimFlowStructure] = useState<any | null>(null);
  const [simCurrentMenuId, setSimCurrentMenuId] = useState<string>("root");
  const [simStack, setSimStack] = useState<string[]>([]);
  const [simActiveButtons, setSimActiveButtons] = useState<Array<{ id: string; label: string; actionType?: string }>>([]);

  useEffect(() => {
    // Load active bot's flow or menu structure
    const loadBotFlowForSimulator = async () => {
      try {
        const { ok, data } = await safeFetchJson<any>(`/api/bots/${activeBotId}/flow`);
        const struct = data?.published?.structure || data?.draft?.structure;
        if (ok && struct) {
          setSimFlowStructure(struct);
          setSimCurrentMenuId("root");
          setSimStack([]);
          const rootButtons = struct.rootMenu?.buttons?.filter((b: any) => b.isEnabled) || [];
          setSimActiveButtons(rootButtons);
        } else {
          // Fallback to classic menu buttons
          const menuRes = await safeFetchJson<any>(`/api/bots/${activeBotId}/menu`);
          if (menuRes.ok && Array.isArray(menuRes.data?.buttons)) {
            const btns = menuRes.data.buttons.filter((b: any) => b.isEnabled);
            setSimFlowStructure(null);
            setSimCurrentMenuId("root");
            setSimStack([]);
            setSimActiveButtons(btns);
          }
        }
      } catch {
        // Fallback gracefully
      }
    };

    loadBotFlowForSimulator();
  }, [activeBotId]);

  const filteredBots = bots.filter((b) =>
    (b.name + " " + b.username + " " + (b.description || "")).toLowerCase().includes(search.toLowerCase())
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

  // 1. Add Bot Handler
  const handleOpenAdd = () => {
    setAddName("");
    setAddToken("");
    setAddDescription("");
    setAddError(null);
    setShowAddTokenText(false);
    setShowAddModal(true);
  };

  const handleSaveAddBot = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddError(null);

    const name = addName.trim();
    const token = addToken.trim();

    if (!name) {
      setAddError("Bot display name is required.");
      return;
    }
    if (!token) {
      setAddError("Telegram bot token from @BotFather is required.");
      return;
    }

    setAddingBot(true);

    try {
      const res = await fetch("/api/bots", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          token,
          description: addDescription.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to add bot.");
      }

      const newBot: BotData = data.bot;
      setBots((prev) => [...prev, newBot]);
      setActiveBotId(newBot.id);
      setSelectedIds((prev) => new Set([...prev, newBot.id]));
      setShowAddModal(false);
      setAddToken(""); // Securely wipe token from memory

      setGlobalNotice({
        type: "success",
        text: `✅ Bot "${newBot.name}" (@${newBot.username}) successfully added and verified! If your background bot runner (npm run bot) is running, restart it to begin polling this new bot.`,
      });
      router.refresh();
    } catch (err: any) {
      setAddError(err.message || "Failed to add bot.");
    } finally {
      setAddingBot(false);
    }
  };

  // 2. Open Edit / Replace Token Modal
  const handleOpenEdit = (bot: BotData) => {
    setEditingBot(bot);
    setEditName(bot.name);
    setEditDescription(bot.description || "");
    setEditIsActive(bot.isActive);
    setEditToken("");
    setShowEditTokenText(false);
    setEditError(null);
  };

  const handleSaveEditBot = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingBot) return;

    setEditError(null);
    setSavingEdit(true);

    try {
      const payload: any = {
        name: editName.trim(),
        description: editDescription.trim(),
        isActive: editIsActive,
      };

      if (editToken.trim()) {
        payload.token = editToken.trim();
      }

      const res = await fetch(`/api/bots/${editingBot.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to update bot.");
      }

      const updatedBot: BotData = data.bot;
      setBots((prev) => prev.map((b) => (b.id === updatedBot.id ? updatedBot : b)));
      setEditingBot(null);
      setEditToken(""); // Securely wipe token

      setGlobalNotice({
        type: "success",
        text: `✅ Bot "${updatedBot.name}" updated successfully.`,
      });
      router.refresh();
    } catch (err: any) {
      setEditError(err.message || "Failed to update bot.");
    } finally {
      setSavingEdit(false);
    }
  };

  // 3. Quick Toggle Active/Paused
  const handleToggleActive = async (bot: BotData) => {
    const nextState = !bot.isActive;
    try {
      const res = await fetch(`/api/bots/${bot.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: nextState }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to toggle status");

      setBots((prev) =>
        prev.map((b) =>
          b.id === bot.id
            ? {
                ...b,
                isActive: nextState,
                connectionStatus: nextState ? "STANDBY" : "DISCONNECTED",
              }
            : b
        )
      );

      setGlobalNotice({
        type: "info",
        text: `Bot "${bot.name}" is now ${nextState ? "Enabled" : "Paused"}.`,
      });
    } catch (err: any) {
      setGlobalNotice({
        type: "error",
        text: `Failed to toggle status: ${err.message}`,
      });
    }
  };

  // 4. Live Test Connection
  const handleTestConnection = async (botId: string) => {
    setTestingId(botId);
    try {
      const res = await fetch(`/api/bots/${botId}/test-connection`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Connection test failed");

      const result = data.result;
      setBots((prev) =>
        prev.map((b) =>
          b.id === botId
            ? {
                ...b,
                connectionStatus: result.status,
                lastError: result.error || null,
              }
            : b
        )
      );

      if (result.ok) {
        setGlobalNotice({
          type: "success",
          text: `✅ Connected! Verified with Telegram as @${result.botInfo?.username} (ID: ${result.botInfo?.id}).`,
        });
      } else {
        setGlobalNotice({
          type: "error",
          text: `❌ Connection error: ${result.error || "Could not verify bot token with Telegram."}`,
        });
      }
    } catch (err: any) {
      setGlobalNotice({
        type: "error",
        text: `Connection test error: ${err.message}`,
      });
    } finally {
      setTestingId(null);
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

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Failed to update configuration");
      }

      setSaveStatus("Saved to PostgreSQL database successfully!");
      setBots((prev) =>
        prev.map((b) =>
          b.id === activeBot.id
            ? { ...b, config: { welcomeMessage: welcomeText } }
            : b
        )
      );
    } catch (error) {
      setSaveStatus(
        error instanceof Error ? error.message : "Error saving welcome message"
      );
    } finally {
      setSavingWelcome(false);
    }
  };

  const handleSimulateAction = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;

    const userMsgId = Date.now();
    const botMsgId = userMsgId + 1;

    if (trimmed.startsWith("/start")) {
      setSimCurrentMenuId("root");
      setSimStack([]);
      const rootButtons =
        simFlowStructure?.rootMenu?.buttons?.filter((b: any) => b.isEnabled) ||
        (Array.isArray(simActiveButtons) ? simActiveButtons : []);
      setSimActiveButtons(rootButtons);

      const prompt = simFlowStructure?.rootMenu?.promptText || welcomeText;
      setChatMessages((prev) => [
        ...prev,
        { id: userMsgId, text: trimmed, sender: "user" },
        { id: botMsgId, text: prompt, sender: "bot" },
      ]);
      return;
    }

    // Handle "◀ Back"
    if (trimmed === "◀ Back") {
      const prevId = simStack.length > 0 ? simStack[simStack.length - 1] : "root";
      const newStack = simStack.slice(0, -1);
      const submenus = simFlowStructure?.submenus || {};
      const targetMenu = prevId === "root" ? simFlowStructure?.rootMenu : submenus[prevId];
      setSimCurrentMenuId(prevId);
      setSimStack(newStack);

      const navButtons = targetMenu?.buttons?.filter((b: any) => b.isEnabled) || [];
      const updatedButtons =
        prevId === "root"
          ? navButtons
          : [...navButtons, { id: "back", label: "◀ Back" }, { id: "main", label: "🏠 Main Menu" }];
      setSimActiveButtons(updatedButtons);

      setChatMessages((prev) => [
        ...prev,
        { id: userMsgId, text: "◀ Back", sender: "user" },
        { id: botMsgId, text: targetMenu?.promptText || `📂 ${targetMenu?.title || "Menu"}`, sender: "bot" },
      ]);
      return;
    }

    // Handle "🏠 Main Menu"
    if (trimmed === "🏠 Main Menu") {
      setSimCurrentMenuId("root");
      setSimStack([]);
      const rootButtons = simFlowStructure?.rootMenu?.buttons?.filter((b: any) => b.isEnabled) || [];
      setSimActiveButtons(rootButtons);

      setChatMessages((prev) => [
        ...prev,
        { id: userMsgId, text: "🏠 Main Menu", sender: "user" },
        { id: botMsgId, text: simFlowStructure?.rootMenu?.promptText || welcomeText, sender: "bot" },
      ]);
      return;
    }

    // Match Button in simActiveButtons
    const matchedBtn = simActiveButtons.find((b) => b.label === trimmed);

    if (matchedBtn) {
      if (matchedBtn.actionType === "OPEN_SUBMENU" && simFlowStructure?.submenus) {
        const targetMenuId = (matchedBtn as any).targetMenuId;
        const targetMenu = simFlowStructure.submenus[targetMenuId];
        if (targetMenu) {
          setSimStack((prev) => [...prev, simCurrentMenuId]);
          setSimCurrentMenuId(targetMenuId);
          const subBtns = (targetMenu.buttons || []).filter((b: any) => b.isEnabled);
          setSimActiveButtons([...subBtns, { id: "back", label: "◀ Back" }, { id: "main", label: "🏠 Main Menu" }]);

          setChatMessages((prev) => [
            ...prev,
            { id: userMsgId, text: trimmed, sender: "user" },
            { id: botMsgId, text: targetMenu.promptText || `📂 ${targetMenu.title}`, sender: "bot" },
          ]);
          return;
        }
      }

      if (matchedBtn.actionType === "REQUEST_CONTACT") {
        setChatMessages((prev) => [
          ...prev,
          { id: userMsgId, text: trimmed, sender: "user" },
          { id: botMsgId, text: "📱 [Telegram Contact Prompt]\n\nTap 'Share Phone Number' to verify your contact with this bot.", sender: "bot" },
        ]);
        return;
      }

      if (matchedBtn.actionType === "JOIN_CHANNELS") {
        setChatMessages((prev) => [
          ...prev,
          { id: userMsgId, text: trimmed, sender: "user" },
          { id: botMsgId, text: (matchedBtn as any).replyText || "Please join our official channels below, then tap 'Check Joined' to verify your membership.", sender: "bot" },
        ]);
        return;
      }

      if (matchedBtn.actionType === "URL") {
        setChatMessages((prev) => [
          ...prev,
          { id: userMsgId, text: trimmed, sender: "user" },
          { id: botMsgId, text: `🔗 Link: ${(matchedBtn as any).url || "https://t.me"}`, sender: "bot" },
        ]);
        return;
      }

      // SEND_TEXT
      const reply = (matchedBtn as any).replyText || `Action response for "${trimmed}"`;
      setChatMessages((prev) => [
        ...prev,
        { id: userMsgId, text: trimmed, sender: "user" },
        { id: botMsgId, text: reply, sender: "bot" },
      ]);
      return;
    }

    // Default response
    setChatMessages((prev) => [
      ...prev,
      { id: userMsgId, text: trimmed, sender: "user" },
      { id: botMsgId, text: `Received: "${trimmed}". Tap one of the configured buttons or send /start.`, sender: "bot" },
    ]);
  };

  const handleSendChatMessage = (e: React.FormEvent) => {
    e.preventDefault();
    const text = chatInput.trim();
    if (!text) return;
    setChatInput("");
    handleSimulateAction(text);
  };

  const activeBotUsers = initialUsersByBot[activeBotId] || [];
  const totalBotsCount = bots.length;
  const activeBotsCount = bots.filter((b) => b.isActive).length;
  const standbyBotsCount = Math.max(0, totalBotsCount - activeBotsCount);
  const totalUsersCount = bots.reduce((acc, b) => acc + (b._count?.users || 0), 0);
  const activeFleetPercent =
    totalBotsCount > 0 ? Math.round((activeBotsCount / totalBotsCount) * 100) : 0;
  const healthyConnectionsCount = bots.filter(
    (b) => b.connectionStatus === "CONNECTED"
  ).length;

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* 1. Hero Header */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 pt-1">
        <div>
          <h1 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight flex items-baseline flex-wrap gap-x-2">
            <span>Your bots, in</span>
            <span className="relative inline-block text-white">
              sync.
              <svg
                className="absolute -bottom-1 left-0 w-full overflow-visible"
                height="8"
                viewBox="0 0 100 8"
                fill="none"
                preserveAspectRatio="none"
                aria-hidden="true"
              >
                <path
                  d="M1 5.5C25 1.5 75 1.5 99 5.5"
                  stroke="#38bdf8"
                  strokeWidth="3.5"
                  strokeLinecap="round"
                />
              </svg>
            </span>
          </h1>
          <p className="text-sm sm:text-base text-slate-400 mt-2 font-normal">
            Manage your Telegram bots in one place.
          </p>
        </div>

        {isSuperAdmin && (
          <button
            type="button"
            onClick={handleOpenAdd}
            className="self-start sm:self-auto bg-[#38bdf8] hover:bg-[#20b3f7] active:scale-[0.98] text-slate-950 font-bold text-sm px-5 py-2.5 rounded-xl shadow-xs transition flex items-center gap-2 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-400"
          >
            <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
              <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
            </svg>
            <span>Add Telegram Bot</span>
          </button>
        )}
      </div>

      {/* Global Notice Alert if active */}
      <AnimatePresence>
        {globalNotice && (
          <motion.div
            key="global-notice"
            initial={{ opacity: 0, y: -8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ type: "spring", stiffness: 420, damping: 32 }}
            className={`p-3.5 rounded-xl text-xs flex items-center justify-between border shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] ${
              globalNotice.type === "success"
                ? "bg-emerald-950/60 border-emerald-500/40 text-emerald-300"
                : globalNotice.type === "error"
                ? "bg-rose-950/60 border-rose-500/40 text-rose-300"
                : "bg-sky-950/60 border-sky-500/40 text-sky-300"
            }`}
          >
            <span>{globalNotice.text}</span>
            <button
              type="button"
              onClick={() => setGlobalNotice(null)}
              className="text-xs font-bold hover:underline ml-4 cursor-pointer"
            >
              Dismiss
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 2. Signature Hero Fleet Card (Hardware-grade Sky Cyan Glow) */}
      <section
        aria-label="Bot fleet overview"
        className="hw-hero-card rounded-2xl p-6 sm:p-7"
      >
        <div className="relative z-10 flex flex-col gap-5">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
            <div>
              <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-sky-400/90 block">
                Fleet Telemetry
              </span>
              <div className="flex items-baseline gap-2.5 mt-2 flex-wrap">
                <strong className="text-4xl sm:text-[44px] font-extrabold text-white tracking-tight leading-none tabular-nums">
                  {activeBotsCount}
                </strong>
                <span className="text-lg sm:text-xl font-medium text-slate-400 tabular-nums">
                  of {totalBotsCount} {totalBotsCount === 1 ? "bot" : "bots"} active
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2.5 self-start sm:self-end">
              <div className="px-3 py-1.5 rounded-xl bg-white/[0.04] border border-white/[0.08] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-[#38bdf8] shadow-[0_0_8px_rgba(56,189,248,0.8)]" />
                <span className="font-mono text-xs font-semibold text-slate-200 tabular-nums">
                  {activeFleetPercent}% active
                </span>
              </div>
              {healthyConnectionsCount > 0 && (
                <div className="px-3 py-1.5 rounded-xl bg-emerald-500/10 border border-emerald-500/25 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                  <span className="font-mono text-xs font-medium text-emerald-300 tabular-nums">
                    {healthyConnectionsCount} verified
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Animated Sky Cyan Capacity / Active Bar */}
          <div className="h-2.5 w-full rounded-full bg-slate-950/80 border border-white/[0.07] p-[2px] overflow-hidden shadow-inner">
            <motion.div
              initial={{ scaleX: 0 }}
              animate={{ scaleX: activeFleetPercent / 100 }}
              transition={{ type: "spring", stiffness: 220, damping: 28, mass: 0.9 }}
              style={{ transformOrigin: "left center" }}
              className="h-full w-full rounded-full bg-gradient-to-r from-sky-500 via-[#38bdf8] to-cyan-300 shadow-[0_0_16px_rgba(56,189,248,0.65)]"
            />
          </div>

          {/* Bottom Legend Strip */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-1 text-xs text-slate-400">
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
              <span className="inline-flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-[#38bdf8]" />
                <span>
                  Active{" "}
                  <strong className="font-mono text-slate-200 font-semibold tabular-nums">
                    {activeBotsCount}
                  </strong>
                </span>
              </span>
              <span className="inline-flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-amber-400" />
                <span>
                  Standby{" "}
                  <strong className="font-mono text-slate-200 font-semibold tabular-nums">
                    {standbyBotsCount}
                  </strong>
                </span>
              </span>
              <span className="inline-flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-400" />
                <span>
                  Audience{" "}
                  <strong className="font-mono text-slate-200 font-semibold tabular-nums">
                    {totalUsersCount.toLocaleString()}
                  </strong>
                </span>
              </span>
            </div>

            {activeBot && (
              <span className="font-mono text-[11px] text-slate-400 truncate max-w-full">
                Selected:{" "}
                <strong className="text-sky-300 font-semibold">
                  @{activeBot.username}
                </strong>
              </span>
            )}
          </div>
        </div>
      </section>

      {/* 3. Metric Cards (3 columns - Hardware Surface + Tabular Nums) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {/* Card 1: Connected bots */}
        <div className="hw-surface rounded-2xl p-5 flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-b from-[#12334d] to-[#0b2032] border border-sky-400/30 shadow-[inset_0_1px_0_rgba(255,255,255,0.14)] flex items-center justify-center text-[#38bdf8] flex-shrink-0">
            <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 8V4H8" />
              <rect width="16" height="12" x="4" y="8" rx="2" />
              <path d="M2 14h2" />
              <path d="M20 14h2" />
              <path d="M15 13v2" />
              <path d="M9 13v2" />
            </svg>
          </div>
          <div>
            <span className="text-[11px] font-mono uppercase tracking-wider text-slate-400 block">
              Connected bots
            </span>
            <strong className="text-3xl font-extrabold text-white leading-tight block mt-1 tabular-nums">
              {totalBotsCount.toLocaleString()}
            </strong>
          </div>
        </div>

        {/* Card 2: Automation enabled */}
        <div className="hw-surface rounded-2xl p-5 flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-b from-[#12334d] to-[#0b2032] border border-sky-400/30 shadow-[inset_0_1px_0_rgba(255,255,255,0.14)] flex items-center justify-center text-[#38bdf8] flex-shrink-0">
            <svg className="w-6 h-6 fill-current" viewBox="0 0 24 24">
              <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
            </svg>
          </div>
          <div>
            <span className="text-[11px] font-mono uppercase tracking-wider text-slate-400 block">
              Automation enabled
            </span>
            <strong className="text-3xl font-extrabold text-white leading-tight block mt-1 tabular-nums">
              {activeBotsCount.toLocaleString()}
            </strong>
          </div>
        </div>

        {/* Card 3: Registered users */}
        <div className="hw-surface rounded-2xl p-5 flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-b from-[#12334d] to-[#0b2032] border border-sky-400/30 shadow-[inset_0_1px_0_rgba(255,255,255,0.14)] flex items-center justify-center text-[#38bdf8] flex-shrink-0">
            <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
              <path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
          </div>
          <div>
            <span className="text-[11px] font-mono uppercase tracking-wider text-slate-400 block">
              Registered users
            </span>
            <strong className="text-3xl font-extrabold text-white leading-tight block mt-1 tabular-nums">
              {totalUsersCount.toLocaleString()}
            </strong>
          </div>
        </div>
      </div>

      {/* 4. "Your bots" Section & Table */}
      <div className="hw-surface rounded-2xl p-6">
        {/* Table Top Header: Title & Search */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-800/80">
          <div>
            <h2 className="text-xl font-bold text-white tracking-tight">Your bots</h2>
          </div>

          <div className="relative w-full sm:w-64">
            <svg
              className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              type="search"
              placeholder="Search bots..."
              aria-label="Search bots"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-xl border border-slate-800 bg-[#0d121c] text-xs py-2 pl-9 pr-3 text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-[#38bdf8] focus:ring-1 focus:ring-[#38bdf8] transition"
            />
          </div>
        </div>

        {/* Table Body */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-800/80 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                <th className="py-3.5 px-4">Bot</th>
                <th className="py-3.5 px-4">Username</th>
                <th className="py-3.5 px-4">Status</th>
                <th className="py-3.5 px-4">Users</th>
                <th className="py-3.5 px-4">Automation</th>
                <th className="py-3.5 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {filteredBots.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-xs text-slate-500">
                    No bots found matching &quot;{search}&quot;.
                  </td>
                </tr>
              ) : (
                filteredBots.map((b, idx) => {
                  const isViewing = b.id === activeBotId;
                  const isTesting = testingId === b.id;

                  // Dark pastel avatar palettes matching target dark reference
                  const avatarPalettes = [
                    { bg: "bg-sky-500/20", text: "text-[#38bdf8]", icon: "robot" },
                    { bg: "bg-purple-500/20", text: "text-purple-400", icon: "game" },
                    { bg: "bg-rose-500/20", text: "text-rose-400", icon: "18plus" },
                    { bg: "bg-amber-500/20", text: "text-amber-400", icon: "bot" },
                  ];
                  const palette = avatarPalettes[idx % avatarPalettes.length];

                  return (
                    <tr
                      key={b.id}
                      className={`group hover:bg-white/[0.03] transition-colors duration-150 ${
                        isViewing ? "bg-sky-500/[0.05] shadow-[inset_3px_0_0_#38bdf8]" : ""
                      }`}
                    >
                      {/* Bot Info */}
                      <td className="py-4 px-4">
                        <div className="flex items-center gap-3">
                          <div
                            className={`w-10 h-10 rounded-xl ${palette.bg} ${palette.text} flex items-center justify-center font-bold text-sm flex-shrink-0 shadow-[inset_0_1px_0_rgba(255,255,255,0.12)] border border-white/10 transition-all duration-200 group-hover:scale-105 group-hover:shadow-[0_0_18px_-4px_rgba(56,189,248,0.35)]`}
                          >
                            {palette.icon === "game" ? (
                              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <line x1="6" y1="12" x2="10" y2="12" />
                                <line x1="8" y1="10" x2="8" y2="14" />
                                <line x1="15" y1="13" x2="15.01" y2="13" />
                                <line x1="18" y1="11" x2="18.01" y2="11" />
                                <rect width="20" height="12" x="2" y="6" rx="6" />
                              </svg>
                            ) : palette.icon === "18plus" ? (
                              <span className="text-xs font-bold font-mono">18+</span>
                            ) : (
                              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M12 8V4H8" />
                                <rect width="16" height="12" x="4" y="8" rx="2" />
                                <path d="M2 14h2" />
                                <path d="M20 14h2" />
                                <path d="M15 13v2" />
                                <path d="M9 13v2" />
                              </svg>
                            )}
                          </div>
                          <div>
                            <span className="font-bold text-sm text-white block leading-snug">
                              {b.name}
                            </span>
                            <span className="text-xs text-slate-400 block mt-0.5 font-normal">
                              {b.description || (b.name === "Test Bot" ? "General purpose bot" : "Telegram community bot")}
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* Username */}
                      <td className="py-4 px-4">
                        <span className="text-xs font-medium text-slate-300 font-mono">
                          @{b.username}
                        </span>
                      </td>

                      {/* Status */}
                      <td className="py-4 px-4">
                        <span
                          className={`text-xs px-2.5 py-1 rounded-full font-medium inline-flex items-center gap-1.5 ${
                            b.isActive
                              ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
                              : "bg-amber-500/15 text-amber-400 border border-amber-500/30"
                          }`}
                        >
                          <span className="relative flex h-2 w-2">
                            {b.isActive && (
                              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60" />
                            )}
                            <span
                              className={`relative inline-flex rounded-full h-2 w-2 ${
                                b.isActive ? "bg-emerald-400" : "bg-amber-400"
                              }`}
                            />
                          </span>
                          {b.isActive ? "Active" : "Standby"}
                        </span>
                      </td>

                      {/* Users */}
                      <td className="py-4 px-4">
                        <div className="flex items-center gap-1.5 text-xs text-slate-300 font-medium font-mono tabular-nums">
                          <svg className="w-4 h-4 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                            <circle cx="9" cy="7" r="4" />
                            <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
                            <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                          </svg>
                          <span>{(b._count?.users || 0).toLocaleString()}</span>
                        </div>
                      </td>

                      {/* Automation */}
                      <td className="py-4 px-4">
                        <div className="flex items-center gap-1.5">
                          <svg className={`w-4 h-4 ${b.isActive ? "text-[#38bdf8] fill-current" : "text-slate-500"}`} viewBox="0 0 24 24">
                            <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
                          </svg>
                          <span className={`text-xs font-semibold ${b.isActive ? "text-[#38bdf8]" : "text-slate-500"}`}>
                            {b.isActive ? "Enabled" : "Paused"}
                          </span>
                        </div>
                      </td>

                      {/* Actions */}
                      <td className="py-4 px-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {/* Quick test button */}
                          <button
                            type="button"
                            onClick={() => handleTestConnection(b.id)}
                            disabled={isTesting}
                            className="w-8 h-8 rounded-lg border border-slate-800 bg-[#0d121c] text-slate-400 hover:text-white hover:border-slate-700 flex items-center justify-center text-xs shadow-xs transition cursor-pointer"
                            title="Test connection via Telegram API"
                          >
                            {isTesting ? (
                              <span className="w-3.5 h-3.5 border-2 border-sky-400 border-t-transparent rounded-full animate-spin" />
                            ) : (
                              "⚡"
                            )}
                          </button>

                          {/* Quick Edit */}
                          {isSuperAdmin && (
                            <button
                              type="button"
                              onClick={() => handleOpenEdit(b)}
                              className="w-8 h-8 rounded-lg border border-slate-800 bg-[#0d121c] text-slate-400 hover:text-white hover:border-slate-700 flex items-center justify-center text-xs shadow-xs transition font-mono cursor-pointer"
                              title="Bot Settings & Token"
                            >
                              •••
                            </button>
                          )}

                          {/* Manage > Button */}
                          <button
                            type="button"
                            onClick={() => handleSelectBot(b.id)}
                            className={`border text-xs font-semibold px-3 py-1.5 rounded-lg shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] flex items-center gap-1 transition-all active:scale-95 cursor-pointer ${
                              isViewing
                                ? "bg-[#0c2538] border-sky-400/40 text-[#38bdf8] shadow-[0_0_16px_-4px_rgba(56,189,248,0.35)]"
                                : "bg-[#0d121c] border-white/[0.08] text-slate-300 hover:bg-slate-800/70 hover:border-sky-400/30 hover:text-white"
                            }`}
                          >
                            <span>Manage</span>
                            <span className="text-[10px] transition-transform duration-150 group-hover:translate-x-0.5">›</span>
                          </button>
                        </div>
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
          <section className="lg:col-span-7 hw-surface rounded-2xl overflow-hidden">
            <div className="p-5 border-b border-white/[0.07] flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-white">
                  {activeBot.name}
                </h2>
                <div className="text-xs text-slate-400 font-mono flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5">
                  <span>@{activeBot.username}</span>
                  <span title="Internal Database UUID">ID: {activeBot.id}</span>
                  {activeBot.telegramBotId && (
                    <span title="Numeric Telegram Bot ID">TG ID: {activeBot.telegramBotId}</span>
                  )}
                </div>
              </div>
              <span className="text-xs text-sky-400 font-medium bg-sky-500/10 px-2.5 py-1 rounded-full border border-sky-500/25">
                Active Bot
              </span>
            </div>

            {/* Sliding Tabs */}
            <div className="flex border-b border-white/[0.07] px-5 py-2.5 gap-2 bg-[#0a0f19]/70">
              <button
                type="button"
                onClick={() => setActiveTab("settings")}
                className={`relative py-1.5 px-3.5 text-xs font-semibold rounded-full transition-colors cursor-pointer ${
                  activeTab === "settings"
                    ? "text-white"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                {activeTab === "settings" && (
                  <motion.span
                    layoutId="dashboard-detail-tab-pill"
                    transition={{ type: "spring", stiffness: 420, damping: 32 }}
                    className="absolute inset-0 rounded-full bg-[#151e30] border border-sky-400/25 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]"
                    aria-hidden="true"
                  />
                )}
                <span className="relative z-10">Welcome Message</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("users")}
                className={`relative py-1.5 px-3.5 text-xs font-semibold rounded-full transition-colors cursor-pointer tabular-nums ${
                  activeTab === "users"
                    ? "text-white"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                {activeTab === "users" && (
                  <motion.span
                    layoutId="dashboard-detail-tab-pill"
                    transition={{ type: "spring", stiffness: 420, damping: 32 }}
                    className="absolute inset-0 rounded-full bg-[#151e30] border border-sky-400/25 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]"
                    aria-hidden="true"
                  />
                )}
                <span className="relative z-10">
                  Registered Users ({activeBotUsers.length.toLocaleString()})
                </span>
              </button>
            </div>

            <div className="p-5">
              {activeTab === "settings" ? (
                <form onSubmit={handleSaveWelcome} className="space-y-4">
                  <div>
                    <label
                      htmlFor="welcome-message-input"
                      className="block text-xs font-semibold text-slate-200 mb-1.5"
                    >
                      Welcome Greeting (/start)
                    </label>
                    <textarea
                      id="welcome-message-input"
                      rows={5}
                      value={welcomeText}
                      onChange={(e) => setWelcomeText(e.target.value)}
                      className="w-full rounded-xl border border-slate-800 bg-[#0d121c] p-3 text-xs font-mono text-slate-100 leading-relaxed focus:outline-none focus:border-[#38bdf8] focus:ring-1 focus:ring-[#38bdf8]"
                      placeholder="Enter the message your bot sends when a user taps /start..."
                    />
                    <p className="text-[11px] text-slate-500 mt-1">
                      Dynamically loaded from PostgreSQL for this specific bot.
                    </p>
                  </div>

                  {saveStatus && (
                    <div
                      className={`p-3 rounded-xl text-xs ${
                        saveStatus.includes("successfully")
                          ? "bg-emerald-950/60 border border-emerald-500/40 text-emerald-300"
                          : "bg-rose-950/60 border border-rose-500/40 text-rose-300"
                      }`}
                    >
                      {saveStatus}
                    </div>
                  )}

                  <div className="flex items-center justify-between pt-2">
                    <span className="text-xs text-slate-400">
                      Bot Status:{" "}
                      <strong className="text-white font-semibold">
                        {activeBot.isActive ? "Active" : "Paused"}
                      </strong>
                    </span>
                    <button
                      type="submit"
                      disabled={savingWelcome}
                      className="bg-[#38bdf8] hover:bg-[#20b3f7] active:scale-[0.98] text-slate-950 font-bold text-xs px-4 py-2 rounded-xl shadow-xs transition cursor-pointer"
                    >
                      {savingWelcome ? "Saving..." : "Save Welcome Message"}
                    </button>
                  </div>
                </form>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-300">
                      Users who interacted with <strong className="text-white">{activeBot.name}</strong>
                    </span>
                    <span className="text-xs text-slate-400 font-mono tabular-nums">
                      {activeBotUsers.length.toLocaleString()} total
                    </span>
                  </div>

                  {activeBotUsers.length === 0 ? (
                    <div className="py-8 text-center text-xs text-slate-500 border border-dashed border-slate-800 rounded-xl">
                      No users have sent /start to this bot yet.
                    </div>
                  ) : (
                    <div className="overflow-x-auto border border-slate-800 rounded-xl">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead>
                          <tr className="border-b border-slate-800 bg-[#0d121c] text-slate-400 font-semibold">
                            <th className="py-2.5 px-3">User</th>
                            <th className="py-2.5 px-3">Telegram ID</th>
                            <th className="py-2.5 px-3">Phone</th>
                            <th className="py-2.5 px-3">Last Seen</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800 font-mono">
                          {activeBotUsers.map((u) => (
                            <tr key={u.id} className="hover:bg-slate-800/40">
                              <td className="py-2 px-3 text-slate-200 font-sans">
                                {u.firstName || ""} {u.lastName || ""}
                                {u.username && (
                                  <span className="text-slate-400 ml-1 font-mono">
                                    (@{u.username})
                                  </span>
                                )}
                              </td>
                              <td className="py-2 px-3 text-slate-400">
                                {u.telegramId}
                              </td>
                              <td className="py-2 px-3 text-slate-200 font-semibold">
                                {u.telegramPhNo || "—"}
                              </td>
                              <td className="py-2 px-3 text-slate-400">
                                {new Date(u.lastSeenAt).toLocaleDateString()}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </div>
          </section>

          {/* Right Card: Interactive Telegram Simulator */}
          <section className="lg:col-span-5 hw-surface rounded-2xl overflow-hidden flex flex-col">
            <div className="p-5 border-b border-white/[0.07] flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-white">
                  Chat Simulator
                </h2>
                <p className="text-xs text-slate-400">
                  Preview for {activeBot.name} (@{activeBot.username})
                </p>
              </div>
              <button
                type="button"
                onClick={() =>
                  setChatMessages([
                    {
                      id: Date.now(),
                      text: "Draft preview — send /start to test a response.",
                      sender: "note",
                    },
                  ])
                }
                className="text-xs py-1 px-2.5 rounded-lg border border-slate-800 bg-[#0d121c] text-slate-300 hover:text-white hover:bg-slate-800 transition cursor-pointer"
              >
                Reset
              </button>
            </div>

            <div className="p-5 space-y-3 flex-1 flex flex-col justify-between">
              <div className="chat-window bg-[#0a0f19] border border-white/[0.08] rounded-xl p-3 min-h-[180px] max-h-[260px] overflow-y-auto space-y-2 shadow-inner">
                <AnimatePresence initial={false}>
                  {chatMessages.map((msg) => (
                    <motion.div
                      key={msg.id}
                      initial={{ opacity: 0, y: 8, scale: 0.97 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      transition={{ type: "spring", stiffness: 450, damping: 32 }}
                      className={`text-xs p-2.5 rounded-xl max-w-[85%] leading-relaxed ${
                        msg.sender === "user"
                          ? "bg-[#0c2538] border border-sky-500/30 text-white ml-auto shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]"
                          : msg.sender === "note"
                          ? "bg-slate-800/50 text-slate-400 text-center mx-auto text-[11px]"
                          : "bg-[#151e30] text-slate-200 border border-white/[0.08] shadow-xs mr-auto"
                      }`}
                    >
                      {msg.text}
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>

              {/* Simulated Reply Keyboard */}
              {simActiveButtons.length > 0 && (
                <div className="p-2.5 rounded-xl bg-[#0a0f19] border border-white/[0.08]">
                  <div className="text-[10px] uppercase font-bold text-slate-400 mb-1.5 flex justify-between">
                    <span>
                      Menu: {simCurrentMenuId === "root" ? "Main Menu" : simCurrentMenuId}
                    </span>
                    <span>(Click button to test)</span>
                  </div>
                  <div className="grid grid-cols-2 gap-1.5">
                    {simActiveButtons.map((btn) => (
                      <motion.button
                        whileHover={{ y: -1 }}
                        whileTap={{ scale: 0.96 }}
                        key={btn.id}
                        type="button"
                        onClick={() => handleSimulateAction(btn.label)}
                        className="py-1.5 px-2 rounded-lg bg-[#151e30] hover:bg-[#1c2840] hover:border-sky-400/30 text-slate-200 text-xs font-medium text-center border border-white/[0.08] truncate transition-colors cursor-pointer shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]"
                        title={btn.label}
                      >
                        {btn.label}
                      </motion.button>
                    ))}
                  </div>
                </div>
              )}

              <form onSubmit={handleSendChatMessage} className="flex gap-2 pt-1">
                <input
                  type="text"
                  placeholder="Send /start or test a message..."
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  className="w-full rounded-xl border border-slate-800 bg-[#0d121c] px-3 py-2 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-[#38bdf8] focus:ring-1 focus:ring-[#38bdf8]"
                />
                <button
                  type="submit"
                  className="bg-[#38bdf8] hover:bg-[#20b3f7] text-slate-950 font-bold text-xs px-3.5 py-2 rounded-xl transition cursor-pointer"
                >
                  Send
                </button>
              </form>

              <p className="text-[11px] text-slate-500 italic">
                Local simulation only. Real messages are polled live by your Telegram bot runner.
              </p>
            </div>
          </section>
        </div>
      )}

      {/* Modal: Add Telegram Bot */}
      <AnimatePresence>
        {showAddModal && (
          <motion.div
            key="add-bot-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.16 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 8 }}
              transition={{ type: "spring", stiffness: 420, damping: 32 }}
              className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl bg-[#0f1420] border border-white/[0.1] shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_24px_64px_rgba(0,0,0,0.75)] p-6 space-y-4"
            >
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div>
                <h2 className="text-lg font-bold text-white flex items-center gap-2">
                  <span className="text-[#38bdf8]">✈</span> Connect a New Telegram Bot
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Register another Telegram bot to manage its menu, channels, users, and posts.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="text-xs text-slate-400 hover:text-white font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            {addError && (
              <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-xs text-rose-400">
                ⚠️ {addError}
              </div>
            )}

            <form onSubmit={handleSaveAddBot} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-200 mb-1">
                  Bot Display Name <span className="text-rose-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. VIP Member Bot, Customer Support Bot"
                  value={addName}
                  onChange={(e) => setAddName(e.target.value)}
                  className="w-full rounded-xl border border-slate-800 bg-[#0d121c] p-2.5 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-[#38bdf8] focus:ring-1 focus:ring-[#38bdf8]"
                  maxLength={64}
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-semibold text-slate-200">
                    Telegram Bot Token <span className="text-rose-400">*</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowAddTokenText((prev) => !prev)}
                    className="text-[11px] text-[#38bdf8] hover:underline cursor-pointer"
                  >
                    {showAddTokenText ? "Hide token" : "Show token"}
                  </button>
                </div>
                <input
                  type={showAddTokenText ? "text" : "password"}
                  required
                  placeholder="123456789:ABCdefGHIjklMNOpqrSTUvwxYZ"
                  value={addToken}
                  onChange={(e) => setAddToken(e.target.value)}
                  className="w-full rounded-xl border border-slate-800 bg-[#0d121c] p-2.5 text-xs font-mono text-white placeholder:text-slate-500 focus:outline-none focus:border-[#38bdf8] focus:ring-1 focus:ring-[#38bdf8]"
                  autoComplete="off"
                />
                <p className="text-[11px] text-slate-400 mt-1">
                  Obtain your token by messaging <strong>@BotFather</strong> on Telegram.
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-200 mb-1">
                  Description / Notes (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. Primary subscriber bot for channel"
                  value={addDescription}
                  onChange={(e) => setAddDescription(e.target.value)}
                  className="w-full rounded-xl border border-slate-800 bg-[#0d121c] p-2.5 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-[#38bdf8] focus:ring-1 focus:ring-[#38bdf8]"
                  maxLength={255}
                />
              </div>

              <div className="p-3 rounded-xl bg-sky-500/10 border border-sky-400/20 text-xs text-sky-300 space-y-1">
                <strong className="block font-semibold">🔒 Authenticated Token Encryption:</strong>
                <p className="text-[11px] leading-relaxed text-slate-300">
                  Your bot token will be verified via Telegram <code className="font-mono text-[#38bdf8]">getMe</code> and encrypted with <strong>AES-256-GCM</strong> before saving. It is never exposed in responses or logs.
                </p>
              </div>

              <div className="flex justify-end gap-2.5 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  disabled={addingBot}
                  className="text-xs py-2 px-3.5 rounded-xl border border-slate-800 bg-[#0d121c] text-slate-300 hover:text-white cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={addingBot}
                  className="bg-[#38bdf8] hover:bg-[#20b3f7] active:scale-[0.98] text-slate-950 font-bold text-xs py-2 px-4 rounded-xl shadow-xs transition cursor-pointer"
                >
                  {addingBot ? "Verifying & Adding..." : "Verify & Connect Bot"}
                </button>
              </div>
            </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Modal: Edit Bot / Replace Token */}
      <AnimatePresence>
        {editingBot && (
          <motion.div
            key="edit-bot-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.16 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 8 }}
              transition={{ type: "spring", stiffness: 420, damping: 32 }}
              className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl bg-[#0f1420] border border-white/[0.1] shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_24px_64px_rgba(0,0,0,0.75)] p-6 space-y-4"
            >
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div>
                <h2 className="text-lg font-bold text-white">
                  Edit Bot Settings
                </h2>
                <div className="text-xs text-slate-400 font-mono mt-0.5 flex flex-wrap gap-x-3">
                  <span>@{editingBot.username}</span>
                  <span>ID: {editingBot.id}</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEditingBot(null)}
                className="text-xs text-slate-400 hover:text-white font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            {editError && (
              <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-xs text-rose-400">
                ⚠️ {editError}
              </div>
            )}

            <form onSubmit={handleSaveEditBot} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-200 mb-1">
                  Display Name
                </label>
                <input
                  type="text"
                  required
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full rounded-xl border border-slate-800 bg-[#0d121c] p-2.5 text-xs text-white focus:outline-none focus:border-[#38bdf8] focus:ring-1 focus:ring-[#38bdf8]"
                  maxLength={64}
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-200 mb-1">
                  Description / Notes
                </label>
                <input
                  type="text"
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  className="w-full rounded-xl border border-slate-800 bg-[#0d121c] p-2.5 text-xs text-white focus:outline-none focus:border-[#38bdf8] focus:ring-1 focus:ring-[#38bdf8]"
                  maxLength={255}
                />
              </div>

              <div className="flex items-center gap-3 p-3 rounded-xl border border-slate-800 bg-[#0d121c]">
                <input
                  type="checkbox"
                  id="bot-active-checkbox"
                  checked={editIsActive}
                  onChange={(e) => setEditIsActive(e.target.checked)}
                  className="accent-[#38bdf8] w-4 h-4 cursor-pointer"
                />
                <label
                  htmlFor="bot-active-checkbox"
                  className="text-xs font-semibold text-slate-200 cursor-pointer"
                >
                  Enable bot automation (Active)
                  <span className="block text-[11px] font-normal text-slate-400">
                    When paused, incoming updates or long polling are gracefully suspended.
                  </span>
                </label>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-semibold text-slate-200">
                    Replace Telegram Bot Token (Optional)
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowEditTokenText((prev) => !prev)}
                    className="text-[11px] text-[#38bdf8] hover:underline cursor-pointer"
                  >
                    {showEditTokenText ? "Hide token" : "Show token"}
                  </button>
                </div>
                <input
                  type={showEditTokenText ? "text" : "password"}
                  placeholder="Leave blank to keep existing token"
                  value={editToken}
                  onChange={(e) => setEditToken(e.target.value)}
                  className="w-full rounded-xl border border-slate-800 bg-[#0d121c] p-2.5 text-xs font-mono text-white focus:outline-none focus:border-[#38bdf8] focus:ring-1 focus:ring-[#38bdf8]"
                  autoComplete="off"
                />
              </div>

              <div className="flex justify-end gap-2.5 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setEditingBot(null)}
                  disabled={savingEdit}
                  className="text-xs py-2 px-3.5 rounded-xl border border-slate-800 bg-[#0d121c] text-slate-300 hover:text-white cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingEdit}
                  className="bg-[#38bdf8] hover:bg-[#20b3f7] active:scale-[0.98] text-slate-950 font-bold text-xs py-2 px-4 rounded-xl shadow-xs transition cursor-pointer"
                >
                  {savingEdit ? "Saving Changes..." : "Save Changes"}
                </button>
              </div>
            </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
