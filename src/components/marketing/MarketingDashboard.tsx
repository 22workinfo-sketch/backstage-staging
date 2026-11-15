"use client";

import { useState, useEffect, useCallback } from "react";

export interface BotOption {
  id: string;
  name: string;
  username: string;
}

export interface ChannelOption {
  id: string;
  botId: string;
  name: string;
  telegramChatId: string;
}

export interface CampaignItem {
  id: string;
  botId: string;
  botName: string;
  botUsername: string;
  name: string;
  slug: string;
  description: string | null;
  deepLink: string;
  targetChannelId: string | null;
  targetChannelName: string | null;
  clicksCount: number;
  uniqueStartsCount: number;
  totalTouches: number;
  isActive: boolean;
  createdAt: string;
}

export interface AudienceProfile {
  id: string;
  botId: string;
  botName: string;
  botUsername: string;
  telegramId: string;
  displayName: string;
  username: string | null;
  firstSeenAt: string;
  lastSeenAt: string;
  marketingConsent: string;
  marketingConsentAt: string | null;
  marketingConsentSource: string | null;
  firstCampaignSource: string | null;
  lastCampaignSource: string | null;
  associatedChannels: Array<{
    channelId: string | null;
    channelName: string;
    latestStatus: string;
    lastObservedAt: string;
  }>;
}

export interface MarketingMetrics {
  newBotUsers: number;
  observedJoins: number;
  observedLeaves: number;
  netObservedJoins: number;
  uniqueChannelSelectors: number;
  uniqueMembershipConfirmed: number;
  marketingConsent: {
    optedIn: number;
    optedOut: number;
    unspecified: number;
  };
  trackingStartDate: string | null;
  growthTrend: Array<{ date: string; joins: number; leaves: number }>;
  dataCompletenessNote: string;
}

interface MarketingDashboardProps {
  bots: BotOption[];
  channels: ChannelOption[];
  initialMetrics: MarketingMetrics;
  initialAudience: AudienceProfile[];
  initialAudienceTotal: number;
  initialAudiencePages: number;
  initialCampaigns: CampaignItem[];
  userRole: string;
}

export function MarketingDashboard({
  bots,
  channels,
  initialMetrics,
  initialAudience,
  initialAudienceTotal,
  initialAudiencePages,
  initialCampaigns,
  userRole,
}: MarketingDashboardProps) {
  const [activeTab, setActiveTab] = useState<"overview" | "audience" | "campaigns">("overview");

  // Global Filters
  const [selectedBotId, setSelectedBotId] = useState<string>("all");
  const [selectedChannelId, setSelectedChannelId] = useState<string>("all");
  const [selectedDateRange, setSelectedDateRange] = useState<"all" | "today" | "7d" | "30d">("all");

  // Metrics State
  const [metrics, setMetrics] = useState<MarketingMetrics>(initialMetrics);
  const [loadingMetrics, setLoadingMetrics] = useState<boolean>(false);

  // Audience State & Filters
  const [audience, setAudience] = useState<AudienceProfile[]>(initialAudience);
  const [audienceTotal, setAudienceTotal] = useState<number>(initialAudienceTotal);
  const [audiencePages, setAudiencePages] = useState<number>(initialAudiencePages);
  const [audiencePage, setAudiencePage] = useState<number>(1);
  const [audienceSearch, setAudienceSearch] = useState<string>("");
  const [audienceConsent, setAudienceConsent] = useState<string>("all");
  const [audienceCampaign, setAudienceCampaign] = useState<string>("all");
  const [loadingAudience, setLoadingAudience] = useState<boolean>(false);

  // Campaigns State
  const [campaigns, setCampaigns] = useState<CampaignItem[]>(initialCampaigns);
  const [showCreateModal, setShowCreateModal] = useState<boolean>(false);
  const [newCampBotId, setNewCampBotId] = useState<string>(bots[0]?.id || "");
  const [newCampName, setNewCampName] = useState<string>("");
  const [newCampSlug, setNewCampSlug] = useState<string>("");
  const [newCampDesc, setNewCampDesc] = useState<string>("");
  const [newCampChannelId, setNewCampChannelId] = useState<string>("");
  const [campaignError, setCampaignError] = useState<string | null>(null);
  const [campaignSuccess, setCampaignSuccess] = useState<string | null>(null);
  const [creatingCampaign, setCreatingCampaign] = useState<boolean>(false);
  const [copiedSlug, setCopiedSlug] = useState<string | null>(null);

  // Filter channels based on selected bot
  const filteredChannels =
    selectedBotId === "all"
      ? channels
      : channels.filter((ch) => ch.botId === selectedBotId);

  // 1. Fetch Metrics
  const fetchMetrics = useCallback(async () => {
    setLoadingMetrics(true);
    try {
      const params = new URLSearchParams({
        botId: selectedBotId,
        channelId: selectedChannelId,
        dateRange: selectedDateRange,
      });
      const res = await fetch(`/api/marketing/metrics?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setMetrics(data);
      }
    } catch (err) {
      console.error("Failed to load marketing metrics", err);
    } finally {
      setLoadingMetrics(false);
    }
  }, [selectedBotId, selectedChannelId, selectedDateRange]);

  // 2. Fetch Audience
  const fetchAudience = useCallback(async () => {
    setLoadingAudience(true);
    try {
      const params = new URLSearchParams({
        botId: selectedBotId,
        channelId: selectedChannelId,
        dateRange: selectedDateRange,
        consentStatus: audienceConsent,
        campaignSource: audienceCampaign,
        search: audienceSearch.trim(),
        page: String(audiencePage),
        limit: "20",
      });
      const res = await fetch(`/api/marketing/audience?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setAudience(data.audience || []);
        setAudienceTotal(data.total || 0);
        setAudiencePages(data.totalPages || 1);
      }
    } catch (err) {
      console.error("Failed to load audience", err);
    } finally {
      setLoadingAudience(false);
    }
  }, [
    selectedBotId,
    selectedChannelId,
    selectedDateRange,
    audienceConsent,
    audienceCampaign,
    audienceSearch,
    audiencePage,
  ]);

  // 3. Fetch Campaigns
  const fetchCampaigns = useCallback(async () => {
    try {
      const params = new URLSearchParams({
        botId: selectedBotId,
      });
      const res = await fetch(`/api/marketing/campaigns?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setCampaigns(data.campaigns || []);
      }
    } catch (err) {
      console.error("Failed to load campaigns", err);
    }
  }, [selectedBotId]);

  useEffect(() => {
    if (activeTab === "overview") {
      fetchMetrics();
    } else if (activeTab === "audience") {
      fetchAudience();
    } else if (activeTab === "campaigns") {
      fetchCampaigns();
    }
  }, [activeTab, fetchMetrics, fetchAudience, fetchCampaigns]);

  // Handle Create Campaign
  const handleCreateCampaign = async (e: React.FormEvent) => {
    e.preventDefault();
    setCampaignError(null);
    setCampaignSuccess(null);
    setCreatingCampaign(true);

    try {
      const res = await fetch("/api/marketing/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          botId: newCampBotId,
          name: newCampName,
          slug: newCampSlug,
          description: newCampDesc || undefined,
          targetChannelId: newCampChannelId || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to create campaign.");
      }

      setCampaignSuccess(`Campaign "${data.campaign.name}" created successfully!`);
      setShowCreateModal(false);
      setNewCampName("");
      setNewCampSlug("");
      setNewCampDesc("");
      fetchCampaigns();
    } catch (err: any) {
      setCampaignError(err.message || "Failed to create campaign.");
    } finally {
      setCreatingCampaign(false);
    }
  };

  const copyToClipboard = (text: string, slug: string) => {
    navigator.clipboard.writeText(text);
    setCopiedSlug(slug);
    setTimeout(() => setCopiedSlug(null), 2500);
  };

  return (
    <div className="space-y-6">
      {/* Screen Heading & Segmented Tab Navigation */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2">
        <div>
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider bg-sky-500/10 text-[#38bdf8] border border-sky-500/25 mb-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-[#38bdf8] animate-pulse" /> Marketing & Audience Intel
          </span>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white">
            Marketing Intelligence & Audience
          </h1>
          <p className="text-xs text-slate-400 mt-1 max-w-2xl">
            Measure bot and channel growth, analyze permission-based audience segments, and track campaign acquisition links.
          </p>
        </div>

        {/* Tab Switcher - Segmented Pill Control */}
        <div className="flex items-center p-1 rounded-xl bg-[#0b0f19] border border-slate-800/80 self-start md:self-auto overflow-x-auto max-w-full">
          <button
            type="button"
            onClick={() => setActiveTab("overview")}
            className={`flex items-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-lg transition-all duration-150 whitespace-nowrap cursor-pointer ${
              activeTab === "overview"
                ? "bg-[#38bdf8] text-slate-950 shadow-md shadow-sky-500/20 font-bold"
                : "text-slate-400 hover:text-white hover:bg-[#141b2d]/60"
            }`}
          >
            <span>📊</span>
            <span>Growth & Metrics</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("audience")}
            className={`flex items-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-lg transition-all duration-150 whitespace-nowrap cursor-pointer ${
              activeTab === "audience"
                ? "bg-[#38bdf8] text-slate-950 shadow-md shadow-sky-500/20 font-bold"
                : "text-slate-400 hover:text-white hover:bg-[#141b2d]/60"
            }`}
          >
            <span>👥</span>
            <span>Audience Profiles</span>
            <span
              className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                activeTab === "audience"
                  ? "bg-slate-950/20 text-slate-950 font-bold"
                  : "bg-slate-800 text-slate-400"
              }`}
            >
              {audienceTotal}
            </span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("campaigns")}
            className={`flex items-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-lg transition-all duration-150 whitespace-nowrap cursor-pointer ${
              activeTab === "campaigns"
                ? "bg-[#38bdf8] text-slate-950 shadow-md shadow-sky-500/20 font-bold"
                : "text-slate-400 hover:text-white hover:bg-[#141b2d]/60"
            }`}
          >
            <span>🔗</span>
            <span>Campaign Links</span>
            <span
              className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                activeTab === "campaigns"
                  ? "bg-slate-950/20 text-slate-950 font-bold"
                  : "bg-slate-800 text-slate-400"
              }`}
            >
              {campaigns.length}
            </span>
          </button>
        </div>
      </div>

      {/* Global Filter Bar */}
      <div className="p-4 sm:p-5 rounded-2xl bg-[#0f1420] border border-slate-800/80 shadow-xl space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {/* Bot Selector */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
              <span>🤖</span>
              <span>Select Bot</span>
            </label>
            <select
              value={selectedBotId}
              onChange={(e) => {
                setSelectedBotId(e.target.value);
                setSelectedChannelId("all");
              }}
              className="text-xs min-h-[38px] w-full py-2 px-3 rounded-xl bg-[#0d121c] border border-slate-800 text-white font-medium focus:outline-none focus:border-[#38bdf8] focus:ring-1 focus:ring-sky-500/30 transition cursor-pointer"
            >
              <option value="all" className="bg-[#0f1420] text-white">All Assigned Bots</option>
              {bots.map((b) => (
                <option key={b.id} value={b.id} className="bg-[#0f1420] text-white">
                  {b.name} (@{b.username})
                </option>
              ))}
            </select>
          </div>

          {/* Channel Selector */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
              <span>📢</span>
              <span>Channel Filter</span>
            </label>
            <select
              value={selectedChannelId}
              onChange={(e) => setSelectedChannelId(e.target.value)}
              className="text-xs min-h-[38px] w-full py-2 px-3 rounded-xl bg-[#0d121c] border border-slate-800 text-white font-medium focus:outline-none focus:border-[#38bdf8] focus:ring-1 focus:ring-sky-500/30 transition cursor-pointer"
            >
              <option value="all" className="bg-[#0f1420] text-white">All Channels</option>
              {filteredChannels.map((ch) => (
                <option key={ch.id} value={ch.id} className="bg-[#0f1420] text-white">
                  {ch.name} ({ch.telegramChatId})
                </option>
              ))}
            </select>
          </div>

          {/* Date Range Selector */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
              <span>📅</span>
              <span>Date Range</span>
            </label>
            <select
              value={selectedDateRange}
              onChange={(e) => setSelectedDateRange(e.target.value as any)}
              className="text-xs min-h-[38px] w-full py-2 px-3 rounded-xl bg-[#0d121c] border border-slate-800 text-white font-medium focus:outline-none focus:border-[#38bdf8] focus:ring-1 focus:ring-sky-500/30 transition cursor-pointer"
            >
              <option value="all" className="bg-[#0f1420] text-white">All Time (Since Tracking Inception)</option>
              <option value="today" className="bg-[#0f1420] text-white">Today</option>
              <option value="7d" className="bg-[#0f1420] text-white">Last 7 Days</option>
              <option value="30d" className="bg-[#0f1420] text-white">Last 30 Days</option>
            </select>
          </div>
        </div>
      </div>

      {/* ======================================================== */}
      {/* TAB 1: OVERVIEW METRICS & GROWTH TRENDS                  */}
      {/* ======================================================== */}
      {activeTab === "overview" && (
        <div className="space-y-6">
          {/* Tracking Inception Notice */}
          <div className="p-4 rounded-xl bg-[#0b0f19] border border-slate-800/80 text-xs text-slate-400 flex flex-col sm:flex-row sm:items-center justify-between gap-2 shadow-sm">
            <div className="flex items-center gap-2.5">
              <span className="text-base">📅</span>
              <span>
                <strong className="text-slate-200">Tracking Inception:</strong>{" "}
                {metrics.trackingStartDate
                  ? `Activity observation active since ${new Date(
                      metrics.trackingStartDate
                    ).toLocaleDateString(undefined, {
                      year: "numeric",
                      month: "short",
                      day: "numeric",
                    })}`
                  : "No events recorded yet."}
              </span>
            </div>
            <span className="text-[11px] text-slate-500 italic">
              {metrics.dataCompletenessNote}
            </span>
          </div>

          {/* KPI Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* New Bot Users */}
            <div className="p-5 rounded-2xl bg-[#0f1420] border border-slate-800/80 hover:border-slate-700/80 transition-all shadow-md space-y-2 group">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  New Bot Users
                </span>
                <span className="text-[10px] px-2 py-0.5 rounded-full font-mono font-semibold bg-sky-500/10 text-[#38bdf8] border border-sky-500/25">
                  Bot
                </span>
              </div>
              <div className="text-3xl font-extrabold tracking-tight text-white group-hover:text-[#38bdf8] transition-colors">
                {metrics.newBotUsers.toLocaleString()}
              </div>
              <p className="text-[11px] text-slate-400 leading-snug">
                First-time users who initiated contact with your bot in this period.
              </p>
            </div>

            {/* Observed Channel Joins */}
            <div className="p-5 rounded-2xl bg-[#0f1420] border border-slate-800/80 hover:border-slate-700/80 transition-all shadow-md space-y-2 group">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  Observed Joins
                </span>
                <span className="text-[10px] px-2 py-0.5 rounded-full font-mono font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/25">
                  Channel
                </span>
              </div>
              <div className="text-3xl font-extrabold tracking-tight text-emerald-400">
                +{metrics.observedJoins.toLocaleString()}
              </div>
              <p className="text-[11px] text-slate-400 leading-snug">
                Users observed joining managed channels via live Telegram updates.
              </p>
            </div>

            {/* Observed Channel Leaves */}
            <div className="p-5 rounded-2xl bg-[#0f1420] border border-slate-800/80 hover:border-slate-700/80 transition-all shadow-md space-y-2 group">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  Observed Leaves / Removed
                </span>
                <span className="text-[10px] px-2 py-0.5 rounded-full font-mono font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/25">
                  Channel
                </span>
              </div>
              <div className="text-3xl font-extrabold tracking-tight text-rose-400">
                -{metrics.observedLeaves.toLocaleString()}
              </div>
              <p className="text-[11px] text-slate-400 leading-snug">
                Users observed leaving or removed/banned by administrators.
              </p>
            </div>

            {/* Net Observed Joins */}
            <div className="p-5 rounded-2xl bg-[#0f1420] border border-slate-800/80 hover:border-slate-700/80 transition-all shadow-md space-y-2 group">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  Net Observed Joins
                </span>
                <span className="text-[10px] px-2 py-0.5 rounded-full font-mono font-semibold bg-indigo-500/10 text-indigo-400 border border-indigo-500/25">
                  Net Delta
                </span>
              </div>
              <div
                className={`text-3xl font-extrabold tracking-tight ${
                  metrics.netObservedJoins >= 0 ? "text-emerald-400" : "text-rose-400"
                }`}
              >
                {metrics.netObservedJoins >= 0 ? "+" : ""}
                {metrics.netObservedJoins.toLocaleString()}
              </div>
              <p className="text-[11px] text-slate-400 leading-snug">
                Observed Joins minus Leaves. Represents event delta, not total subscriber count.
              </p>
            </div>

            {/* Channel Link Selectors */}
            <div className="p-5 rounded-2xl bg-[#0f1420] border border-slate-800/80 hover:border-slate-700/80 transition-all shadow-md space-y-2 group">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  Unique Channel Selectors
                </span>
                <span className="text-[10px] px-2 py-0.5 rounded-full font-mono font-semibold bg-purple-500/10 text-purple-400 border border-purple-500/25">
                  Intent
                </span>
              </div>
              <div className="text-3xl font-extrabold tracking-tight text-purple-400">
                {metrics.uniqueChannelSelectors.toLocaleString()}
              </div>
              <p className="text-[11px] text-slate-400 leading-snug">
                Distinct users who tapped an official channel join button in your bot.
              </p>
            </div>

            {/* Verified Channel Members */}
            <div className="p-5 rounded-2xl bg-[#0f1420] border border-slate-800/80 hover:border-slate-700/80 transition-all shadow-md space-y-2 group">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  Confirmed Members
                </span>
                <span className="text-[10px] px-2 py-0.5 rounded-full font-mono font-semibold bg-sky-500/10 text-[#38bdf8] border border-sky-500/25">
                  Verified
                </span>
              </div>
              <div className="text-3xl font-extrabold tracking-tight text-[#38bdf8]">
                {metrics.uniqueMembershipConfirmed.toLocaleString()}
              </div>
              <p className="text-[11px] text-slate-400 leading-snug">
                Distinct users whose membership was actively verified by bot check.
              </p>
            </div>
          </div>

          {/* Marketing Consent Breakdown */}
          <div className="p-5 sm:p-6 rounded-2xl bg-[#0f1420] border border-slate-800/80 shadow-xl space-y-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-base">🛡️</span>
                <h3 className="text-sm font-bold text-white">
                  Marketing Consent & Eligibility Distribution
                </h3>
              </div>
              <p className="text-xs text-slate-400 mt-1">
                In strict compliance with privacy standards, only explicit opt-ins are marked eligible.
                Starting the bot or joining a channel does NOT constitute marketing consent.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="p-4 rounded-xl bg-[#0b0f19] border border-emerald-500/20 space-y-1.5 shadow-sm">
                <div className="text-xs font-semibold text-emerald-400 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  Explicitly Opted In
                </div>
                <div className="text-2xl font-extrabold text-white">
                  {metrics.marketingConsent.optedIn.toLocaleString()}
                </div>
                <span className="text-[11px] text-emerald-300/80 block">
                  Eligible for future broadcasts via /optin
                </span>
              </div>

              <div className="p-4 rounded-xl bg-[#0b0f19] border border-rose-500/20 space-y-1.5 shadow-sm">
                <div className="text-xs font-semibold text-rose-400 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-rose-400" />
                  Opted Out / Revoked
                </div>
                <div className="text-2xl font-extrabold text-white">
                  {metrics.marketingConsent.optedOut.toLocaleString()}
                </div>
                <span className="text-[11px] text-rose-300/80 block">
                  Excluded from all marketing via /optout
                </span>
              </div>

              <div className="p-4 rounded-xl bg-[#0b0f19] border border-slate-800/80 space-y-1.5 shadow-sm">
                <div className="text-xs font-semibold text-slate-400 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-slate-500" />
                  Unspecified (No Consent)
                </div>
                <div className="text-2xl font-extrabold text-white">
                  {metrics.marketingConsent.unspecified.toLocaleString()}
                </div>
                <span className="text-[11px] text-slate-400 block">
                  Protected: Excluded until explicit opt-in
                </span>
              </div>
            </div>
          </div>

          {/* Growth Trend Timeline */}
          <div className="p-5 sm:p-6 rounded-2xl bg-[#0f1420] border border-slate-800/80 shadow-xl space-y-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-base">📈</span>
                <h3 className="text-sm font-bold text-white">
                  Observed Channel Growth Timeline
                </h3>
              </div>
              <p className="text-xs text-slate-400 mt-1">
                Daily timeline of observed channel joins versus departures.
              </p>
            </div>

            {metrics.growthTrend.length === 0 ? (
              <div className="py-12 text-center text-xs text-slate-500 border border-dashed border-slate-800/80 rounded-xl bg-[#0b0f19]/40">
                No join/leave activity recorded in this period.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <div className="min-w-[500px] flex items-end gap-2 h-48 pt-6 border-b border-slate-800 pb-2 px-2 bg-[#0b0f19]/30 rounded-xl">
                  {metrics.growthTrend.map((t) => {
                    const maxHeight = 120;
                    const maxVal = Math.max(
                      1,
                      ...metrics.growthTrend.map((x) => Math.max(x.joins, x.leaves))
                    );
                    const joinH = Math.round((t.joins / maxVal) * maxHeight);
                    const leaveH = Math.round((t.leaves / maxVal) * maxHeight);

                    return (
                      <div
                        key={t.date}
                        className="flex-1 flex flex-col items-center gap-1 h-full justify-end group"
                      >
                        <div className="text-[10px] font-mono text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                          +{t.joins} / -{t.leaves}
                        </div>
                        <div className="w-full flex items-end justify-center gap-1">
                          {/* Joins Bar */}
                          <div
                            style={{ height: `${Math.max(4, joinH)}px` }}
                            className="w-1/2 bg-emerald-500/85 hover:bg-emerald-400 rounded-t-sm transition-all"
                            title={`${t.date}: +${t.joins} joins`}
                          />
                          {/* Leaves Bar */}
                          <div
                            style={{ height: `${Math.max(4, leaveH)}px` }}
                            className="w-1/2 bg-rose-500/85 hover:bg-rose-400 rounded-t-sm transition-all"
                            title={`${t.date}: -${t.leaves} leaves`}
                          />
                        </div>
                        <span className="text-[10px] text-slate-400 font-mono whitespace-nowrap mt-1">
                          {t.date.slice(5)}
                        </span>
                      </div>
                    );
                  })}
                </div>
                <div className="flex items-center justify-center gap-6 pt-4 text-xs text-slate-400">
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-sm bg-emerald-500/85" />
                    <span>Observed Joins</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-sm bg-rose-500/85" />
                    <span>Observed Leaves</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* TAB 2: AUDIENCE PROFILES & SEGMENTS                      */}
      {/* ======================================================== */}
      {activeTab === "audience" && (
        <div className="space-y-4">
          {/* Audience Filter Bar */}
          <div className="p-4 sm:p-5 rounded-2xl bg-[#0f1420] border border-slate-800/80 shadow-xl space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
              {/* Marketing Consent Filter */}
              <div>
                <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                  Consent Status
                </label>
                <select
                  value={audienceConsent}
                  onChange={(e) => {
                    setAudienceConsent(e.target.value);
                    setAudiencePage(1);
                  }}
                  className="text-xs min-h-[38px] w-full py-2 px-3 rounded-xl bg-[#0d121c] border border-slate-800 text-white font-medium focus:outline-none focus:border-[#38bdf8] focus:ring-1 focus:ring-sky-500/30 transition cursor-pointer"
                >
                  <option value="all" className="bg-[#0f1420] text-white">All Consent Types</option>
                  <option value="OPTED_IN" className="bg-[#0f1420] text-white">🟢 Explicitly Opted In</option>
                  <option value="OPTED_OUT" className="bg-[#0f1420] text-white">🔴 Opted Out / Revoked</option>
                  <option value="UNSPECIFIED" className="bg-[#0f1420] text-white">⚪ Unspecified (No Consent)</option>
                </select>
              </div>

              {/* Campaign Source Filter */}
              <div>
                <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                  Campaign Source
                </label>
                <select
                  value={audienceCampaign}
                  onChange={(e) => {
                    setAudienceCampaign(e.target.value);
                    setAudiencePage(1);
                  }}
                  className="text-xs min-h-[38px] w-full py-2 px-3 rounded-xl bg-[#0d121c] border border-slate-800 text-white font-medium focus:outline-none focus:border-[#38bdf8] focus:ring-1 focus:ring-sky-500/30 transition cursor-pointer"
                >
                  <option value="all" className="bg-[#0f1420] text-white">All Campaign Sources</option>
                  {campaigns.map((c) => (
                    <option key={c.slug} value={c.slug} className="bg-[#0f1420] text-white">
                      {c.name} ({c.slug})
                    </option>
                  ))}
                </select>
              </div>

              {/* Search */}
              <div className="sm:col-span-2">
                <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                  Search Audience
                </label>
                <div className="relative">
                  <input
                    type="text"
                    placeholder="Search by name, @username, or Telegram ID..."
                    value={audienceSearch}
                    onChange={(e) => {
                      setAudienceSearch(e.target.value);
                      setAudiencePage(1);
                    }}
                    className="text-xs min-h-[38px] w-full py-2 pl-9 pr-3 rounded-xl bg-[#0d121c] border border-slate-800 text-white placeholder-slate-500 focus:outline-none focus:border-[#38bdf8] focus:ring-1 focus:ring-sky-500/30 transition"
                  />
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs">
                    🔍
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Privacy & Methodology Callout */}
          <div className="p-4 rounded-xl bg-[#0b0f19] border border-slate-800/80 text-xs text-slate-300 space-y-1.5 shadow-sm">
            <div className="font-semibold text-white flex items-center gap-2">
              <span>🛡️</span>
              <span>Audience Integrity & Privacy Protections</span>
            </div>
            <ul className="list-disc list-inside space-y-1 pl-1 text-[11px] text-slate-400">
              <li>
                <strong className="text-slate-200">Unique User Integrity:</strong> Each Telegram user is represented as <strong>1 unique profile</strong> regardless of how many channels they interact with.
              </li>
              <li>
                <strong className="text-slate-200">Point-in-Time Observations:</strong> Channel badges indicate the <em>last observed state</em> and timestamp. They are not guaranteed real-time unless re-verified.
              </li>
              <li>
                <strong className="text-slate-200">Privacy by Design:</strong> Phone numbers are never exposed in marketing audience lists.
              </li>
            </ul>
          </div>

          {/* Audience Table */}
          <div className="rounded-2xl bg-[#0f1420] border border-slate-800/80 overflow-hidden shadow-xl">
            {loadingAudience ? (
              <div className="py-16 text-center text-xs text-slate-400">
                <div className="inline-block animate-spin rounded-full h-7 w-7 border-2 border-[#38bdf8] border-t-transparent mb-3" />
                <p>Loading audience profiles...</p>
              </div>
            ) : audience.length === 0 ? (
              <div className="py-16 text-center space-y-2">
                <span className="text-3xl block">👥</span>
                <h3 className="text-sm font-semibold text-white">
                  No audience profiles match filters
                </h3>
                <p className="text-xs text-slate-400 max-w-sm mx-auto">
                  Try broadening your search or adjusting consent filters.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-800 bg-[#0b0f19] text-slate-400 font-mono tracking-wider text-[10px] uppercase">
                      <th className="py-3 px-4 font-semibold">User Profile</th>
                      <th className="py-3 px-4 font-semibold">Bot</th>
                      <th className="py-3 px-4 font-semibold">Associated Channels & Last Status</th>
                      <th className="py-3 px-4 font-semibold">Consent Status</th>
                      <th className="py-3 px-4 font-semibold">Campaign Source</th>
                      <th className="py-3 px-4 font-semibold">First Seen</th>
                      <th className="py-3 px-4 font-semibold">Last Active</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/80">
                    {audience.map((u) => (
                      <tr
                        key={u.id}
                        className="hover:bg-[#141b2d]/50 transition-colors"
                      >
                        {/* User Profile */}
                        <td className="py-3.5 px-4">
                          <div className="font-semibold text-white truncate max-w-[160px]">
                            {u.displayName}
                          </div>
                          <div className="text-[11px] text-slate-400 font-mono">
                            ID: {u.telegramId}
                          </div>
                        </td>

                        {/* Bot */}
                        <td className="py-3.5 px-4 whitespace-nowrap text-white">
                          <span className="font-medium">{u.botName}</span>
                          <span className="block text-[11px] text-slate-400 font-mono">
                            @{u.botUsername}
                          </span>
                        </td>

                        {/* Channels */}
                        <td className="py-3.5 px-4 max-w-[220px]">
                          {u.associatedChannels.length === 0 ? (
                            <span className="text-slate-500 font-mono text-[11px]">None observed</span>
                          ) : (
                            <div className="flex flex-wrap gap-1">
                              {u.associatedChannels.map((ch, idx) => (
                                <span
                                  key={idx}
                                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono border ${
                                    ch.latestStatus === "member"
                                      ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/25"
                                      : ch.latestStatus === "left" || ch.latestStatus === "kicked"
                                      ? "bg-rose-500/10 text-rose-400 border-rose-500/25"
                                      : "bg-slate-800 text-slate-300 border-slate-700"
                                  }`}
                                  title={`Last observed: ${new Date(
                                    ch.lastObservedAt
                                  ).toLocaleString()}`}
                                >
                                  {ch.channelName}: {ch.latestStatus}
                                </span>
                              ))}
                            </div>
                          )}
                        </td>

                        {/* Consent Status */}
                        <td className="py-3.5 px-4 whitespace-nowrap">
                          {u.marketingConsent === "OPTED_IN" ? (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                              Opted In
                            </span>
                          ) : u.marketingConsent === "OPTED_OUT" ||
                            u.marketingConsent === "REVOKED" ? (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-rose-500/15 text-rose-400 border border-rose-500/30">
                              <span className="w-1.5 h-1.5 rounded-full bg-rose-400" />
                              Opted Out
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-slate-800/80 text-slate-400 border border-slate-700/80">
                              No Consent
                            </span>
                          )}
                          {u.marketingConsentSource && (
                            <span className="block text-[10px] text-slate-400 font-mono mt-0.5">
                              via {u.marketingConsentSource}
                            </span>
                          )}
                        </td>

                        {/* Campaign Source */}
                        <td className="py-3.5 px-4 text-slate-400 font-mono text-[11px] whitespace-nowrap">
                          {u.firstCampaignSource ? (
                            <span className="px-2 py-0.5 rounded-md bg-[#0c2538] border border-sky-500/30 text-[#38bdf8] font-semibold">
                              c_{u.firstCampaignSource}
                            </span>
                          ) : (
                            <span className="text-slate-500">Organic / Direct</span>
                          )}
                        </td>

                        {/* First Seen */}
                        <td className="py-3.5 px-4 whitespace-nowrap text-slate-400 font-mono text-[11px]">
                          {new Date(u.firstSeenAt).toLocaleDateString()}
                        </td>

                        {/* Last Active */}
                        <td className="py-3.5 px-4 whitespace-nowrap text-slate-400 font-mono text-[11px]">
                          {new Date(u.lastSeenAt).toLocaleDateString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Pagination */}
            {audiencePages > 1 && (
              <div className="p-4 border-t border-slate-800 bg-[#0b0f19] flex items-center justify-between text-xs">
                <span className="text-slate-400">
                  Showing {(audiencePage - 1) * 20 + 1}–
                  {Math.min(audiencePage * 20, audienceTotal)} of {audienceTotal} profiles
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setAudiencePage((p) => Math.max(1, p - 1))}
                    disabled={audiencePage <= 1 || loadingAudience}
                    className="px-3 py-1.5 rounded-xl bg-[#141b2d] border border-slate-800 text-slate-300 hover:text-white hover:bg-[#1a233a] disabled:opacity-40 transition cursor-pointer"
                  >
                    Previous
                  </button>
                  <span className="px-2 font-mono text-white font-medium">
                    {audiencePage} / {audiencePages}
                  </span>
                  <button
                    type="button"
                    onClick={() => setAudiencePage((p) => Math.min(audiencePages, p + 1))}
                    disabled={audiencePage >= audiencePages || loadingAudience}
                    className="px-3 py-1.5 rounded-xl bg-[#141b2d] border border-slate-800 text-slate-300 hover:text-white hover:bg-[#1a233a] disabled:opacity-40 transition cursor-pointer"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* TAB 3: CAMPAIGN DEEP LINKS                               */}
      {/* ======================================================== */}
      {activeTab === "campaigns" && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <span>🔗</span>
                <span>Acquisition Campaigns & Deep Tracking Links</span>
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Generate Telegram deep links (<code className="font-mono text-[#38bdf8] bg-[#0c2538] px-1 py-0.5 rounded border border-sky-500/25">t.me/Bot?start=c_slug</code>) to attribute incoming bot starts and downstream channel growth.
              </p>
            </div>

            <button
              type="button"
              onClick={() => setShowCreateModal(true)}
              className="inline-flex items-center gap-1.5 text-xs py-2 px-4 rounded-xl font-bold bg-[#38bdf8] text-slate-950 hover:bg-[#20b3f7] active:scale-[0.98] transition shadow-md shadow-sky-500/20 cursor-pointer self-start sm:self-auto"
            >
              <span>＋ Create Campaign Link</span>
            </button>
          </div>

          {campaignSuccess && (
            <div className="p-4 rounded-xl bg-emerald-950/40 border border-emerald-800/60 text-emerald-200 text-xs flex items-center justify-between gap-3 shadow-md">
              <div className="flex items-center gap-2">
                <span>✅</span>
                <span className="font-medium">{campaignSuccess}</span>
              </div>
              <button
                type="button"
                onClick={() => setCampaignSuccess(null)}
                className="text-xs opacity-70 hover:opacity-100 p-1 cursor-pointer"
              >
                ✕
              </button>
            </div>
          )}

          {/* Campaigns Table */}
          <div className="rounded-2xl bg-[#0f1420] border border-slate-800/80 overflow-hidden shadow-xl">
            {campaigns.length === 0 ? (
              <div className="py-16 text-center space-y-2">
                <span className="text-3xl block">🔗</span>
                <h3 className="text-sm font-semibold text-white">
                  No campaigns created yet
                </h3>
                <p className="text-xs text-slate-400 max-w-sm mx-auto">
                  Create your first tracking link to start measuring promotional campaign performance.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-800 bg-[#0b0f19] text-slate-400 font-mono tracking-wider text-[10px] uppercase">
                      <th className="py-3 px-4 font-semibold">Campaign Name & Slug</th>
                      <th className="py-3 px-4 font-semibold">Bot</th>
                      <th className="py-3 px-4 font-semibold">Deep Link</th>
                      <th className="py-3 px-4 font-semibold">Target Channel</th>
                      <th className="py-3 px-4 font-semibold">Clicks</th>
                      <th className="py-3 px-4 font-semibold">Unique Starts</th>
                      <th className="py-3 px-4 font-semibold">Created</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/80">
                    {campaigns.map((c) => (
                      <tr
                        key={c.id}
                        className="hover:bg-[#141b2d]/50 transition-colors"
                      >
                        <td className="py-3.5 px-4">
                          <div className="font-semibold text-white">
                            {c.name}
                          </div>
                          <div className="text-[11px] text-slate-400 font-mono">
                            slug: <span className="text-[#38bdf8]">c_{c.slug}</span>
                          </div>
                        </td>

                        <td className="py-3.5 px-4 whitespace-nowrap text-white font-medium">
                          {c.botName}
                        </td>

                        <td className="py-3.5 px-4">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-[11px] text-[#38bdf8] truncate max-w-[200px] bg-[#0c2538] px-2 py-0.5 rounded border border-sky-500/25">
                              {c.deepLink}
                            </span>
                            <button
                              type="button"
                              onClick={() => copyToClipboard(c.deepLink, c.slug)}
                              className={`text-[11px] py-1 px-2.5 rounded-lg border font-medium transition cursor-pointer ${
                                copiedSlug === c.slug
                                  ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/40"
                                  : "bg-[#141b2d] text-slate-300 border-slate-800 hover:text-white hover:bg-[#1a233a]"
                              }`}
                              title="Copy Telegram Deep Link"
                            >
                              {copiedSlug === c.slug ? "✓ Copied" : "Copy"}
                            </button>
                          </div>
                        </td>

                        <td className="py-3.5 px-4 text-slate-400">
                          {c.targetChannelName || "General Bot Onboarding"}
                        </td>

                        <td className="py-3.5 px-4 font-semibold text-white">
                          {c.clicksCount}
                        </td>

                        <td className="py-3.5 px-4 font-semibold text-emerald-400">
                          {c.uniqueStartsCount}
                        </td>

                        <td className="py-3.5 px-4 text-slate-400 font-mono text-[11px] whitespace-nowrap">
                          {new Date(c.createdAt).toLocaleDateString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Attribution Rules Guidance */}
          <div className="p-5 rounded-2xl bg-[#0b0f19] border border-slate-800/80 text-xs text-slate-300 space-y-2 shadow-sm">
            <h4 className="font-semibold text-white flex items-center gap-2">
              <span>ℹ️</span>
              <span>Campaign Source Attribution Rules</span>
            </h4>
            <ul className="list-disc list-inside space-y-1 pl-1 text-[11px] text-slate-400">
              <li>
                <strong className="text-slate-200">First-Touch Attribution:</strong> When a user starts the bot for the first time via <code className="font-mono text-[#38bdf8]">t.me/Bot?start=c_slug</code>, that campaign slug is permanently stored on their profile.
              </li>
              <li>
                <strong className="text-slate-200">Return-Touch Attribution:</strong> Returning users starting via campaign links have each touch recorded in the campaign ledger with timestamp.
              </li>
              <li>
                <strong className="text-slate-200">Channel Join Attribution Integrity:</strong> A channel join is only credited to a campaign if the user actively interacted with the campaign within the attribution window. Organic or direct joins are never falsely credited.
              </li>
            </ul>
          </div>
        </div>
      )}

      {/* CREATE CAMPAIGN MODAL */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4">
          <div className="w-full max-w-md rounded-2xl bg-[#0f1420] border border-slate-700/80 p-6 sm:p-7 shadow-2xl space-y-5 text-white">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <span>🔗</span>
                <span>Create Campaign Tracking Link</span>
              </h3>
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="text-slate-400 hover:text-white text-base p-1 cursor-pointer transition"
              >
                ✕
              </button>
            </div>

            {campaignError && (
              <div className="p-3.5 rounded-xl bg-rose-950/50 border border-rose-800/80 text-rose-200 text-xs flex items-center gap-2">
                <span>⚠️</span>
                <span>{campaignError}</span>
              </div>
            )}

            <form onSubmit={handleCreateCampaign} className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-400 font-semibold mb-1.5 uppercase tracking-wider text-[11px]">
                  Target Bot
                </label>
                <select
                  value={newCampBotId}
                  onChange={(e) => setNewCampBotId(e.target.value)}
                  className="text-xs min-h-[38px] w-full py-2 px-3 rounded-xl bg-[#0d121c] border border-slate-800 text-white font-medium focus:outline-none focus:border-[#38bdf8] focus:ring-1 focus:ring-sky-500/30 transition cursor-pointer"
                  required
                >
                  {bots.map((b) => (
                    <option key={b.id} value={b.id} className="bg-[#0f1420] text-white">
                      {b.name} (@{b.username})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-slate-400 font-semibold mb-1.5 uppercase tracking-wider text-[11px]">
                  Campaign Name
                </label>
                <input
                  type="text"
                  placeholder="e.g. Summer Promo 2026"
                  value={newCampName}
                  onChange={(e) => setNewCampName(e.target.value)}
                  className="text-xs min-h-[38px] w-full py-2 px-3 rounded-xl bg-[#0d121c] border border-slate-800 text-white placeholder-slate-500 focus:outline-none focus:border-[#38bdf8] focus:ring-1 focus:ring-sky-500/30 transition"
                  required
                />
              </div>

              <div>
                <label className="block text-slate-400 font-semibold mb-1.5 uppercase tracking-wider text-[11px]">
                  URL Slug (unique, lowercase, alphanumeric, 2-32 chars)
                </label>
                <div className="flex items-center gap-1.5">
                  <span className="font-mono text-xs text-slate-400 bg-[#0d121c] border border-slate-800 px-2.5 py-2 rounded-xl">
                    ?start=c_
                  </span>
                  <input
                    type="text"
                    placeholder="summer26"
                    value={newCampSlug}
                    onChange={(e) =>
                      setNewCampSlug(
                        e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, "")
                      )
                    }
                    className="text-xs min-h-[38px] flex-1 py-2 px-3 rounded-xl bg-[#0d121c] border border-slate-800 text-white font-mono placeholder-slate-500 focus:outline-none focus:border-[#38bdf8] focus:ring-1 focus:ring-sky-500/30 transition"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-400 font-semibold mb-1.5 uppercase tracking-wider text-[11px]">
                  Target Channel (Optional)
                </label>
                <select
                  value={newCampChannelId}
                  onChange={(e) => setNewCampChannelId(e.target.value)}
                  className="text-xs min-h-[38px] w-full py-2 px-3 rounded-xl bg-[#0d121c] border border-slate-800 text-white font-medium focus:outline-none focus:border-[#38bdf8] focus:ring-1 focus:ring-sky-500/30 transition cursor-pointer"
                >
                  <option value="" className="bg-[#0f1420] text-white">General Bot Onboarding (No Specific Channel)</option>
                  {channels
                    .filter((ch) => ch.botId === newCampBotId)
                    .map((ch) => (
                      <option key={ch.id} value={ch.id} className="bg-[#0f1420] text-white">
                        {ch.name} ({ch.telegramChatId})
                      </option>
                    ))}
                </select>
              </div>

              <div>
                <label className="block text-slate-400 font-semibold mb-1.5 uppercase tracking-wider text-[11px]">
                  Description / Notes (Optional)
                </label>
                <textarea
                  placeholder="Notes about placement (e.g. Twitter post, influencer partnership)..."
                  value={newCampDesc}
                  onChange={(e) => setNewCampDesc(e.target.value)}
                  className="text-xs w-full py-2 px-3 rounded-xl bg-[#0d121c] border border-slate-800 text-white placeholder-slate-500 focus:outline-none focus:border-[#38bdf8] focus:ring-1 focus:ring-sky-500/30 transition h-20 resize-none"
                />
              </div>

              <div className="flex justify-end gap-2.5 pt-4 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 rounded-xl bg-[#141b2d] border border-slate-800 text-slate-300 hover:text-white hover:bg-[#1a233a] font-semibold transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creatingCampaign}
                  className="px-5 py-2 rounded-xl font-bold bg-[#38bdf8] text-slate-950 hover:bg-[#20b3f7] active:scale-[0.98] transition shadow-md shadow-sky-500/20 disabled:opacity-50 cursor-pointer"
                >
                  {creatingCampaign ? "Creating..." : "Create Link"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
