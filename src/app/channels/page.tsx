"use client";

import { useEffect, useState } from "react";
import { DashboardShell } from "@/components/layout/DashboardShell";
import {
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Unlink,
  Sparkles,
  ExternalLink,
} from "lucide-react";
import { YouTubeIcon, InstagramIcon, XIcon } from "@/components/icons";
import { formatNumber } from "@/lib/utils";

interface Account {
  id: string;
  platform: "YOUTUBE" | "INSTAGRAM" | "X";
  platformAccountId: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  followersCount: number;
  followingCount: number;
  postsCount: number;
  status: string;
  isMock: boolean;
  updatedAt: string;
}

const PLATFORM_CONFIGS = [
  {
    platform: "YOUTUBE" as const,
    name: "YouTube",
    handlePrefix: "@",
    icon: YouTubeIcon,
    colorClass: "text-red-500",
    bgClass: "bg-red-500/10 border-red-500/20",
    badgeClass: "bg-red-500/20 text-red-300 border-red-500/30",
    description: "Publish video titles, community posts, tags & monitor subscriber growth.",
    metricsLabel: "Subscribers",
  },
  {
    platform: "INSTAGRAM" as const,
    name: "Instagram",
    handlePrefix: "@",
    icon: InstagramIcon,
    colorClass: "text-pink-500",
    bgClass: "bg-pink-500/10 border-pink-500/20",
    badgeClass: "bg-pink-500/20 text-pink-300 border-pink-500/30",
    description: "Direct publish feeds & reels, auto-post first comment hashtags, best time heatmaps.",
    metricsLabel: "Followers",
  },
  {
    platform: "X" as const,
    name: "X (Twitter)",
    handlePrefix: "@",
    icon: XIcon,
    colorClass: "text-sky-400",
    bgClass: "bg-sky-500/10 border-sky-500/20",
    badgeClass: "bg-sky-500/20 text-sky-300 border-sky-500/30",
    description: "Schedule 280-char tweets, threads, retweets, and audience engagement tracking.",
    metricsLabel: "Followers",
  },
];

export default function ChannelsPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [liveIntegration, setLiveIntegration] = useState<
    Record<string, { enabled: boolean; reason?: string }>
  >({});
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetchAccounts = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/accounts");
      const data = await res.json();
      if (data.success) {
        setAccounts(data.accounts);
        if (data.liveIntegration) {
          setLiveIntegration(data.liveIntegration);
        }
      }
    } catch (err) {
      console.error("Failed to load accounts", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAccounts();
  }, []);

  const handleConnectMock = async (platform: "YOUTUBE" | "INSTAGRAM" | "X") => {
    try {
      setActionLoading(`connect_${platform}`);
      const res = await fetch("/api/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ platform }),
      });
      const data = await res.json();
      if (data.success) {
        await fetchAccounts();
      }
    } catch (err) {
      console.error("Connect error", err);
    } finally {
      setActionLoading(null);
    }
  };

  const handleDisconnect = async (id: string) => {
    try {
      setActionLoading(`disconnect_${id}`);
      const res = await fetch(`/api/accounts/${id}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (data.success) {
        await fetchAccounts();
      }
    } catch (err) {
      console.error("Disconnect error", err);
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <DashboardShell title="Connected Channels">
      <div className="max-w-6xl mx-auto space-y-8">
        {/* Header Banner */}
        <div className="bg-gradient-to-r from-slate-900 via-indigo-950/40 to-slate-900 border border-slate-800 rounded-2xl p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                Zero-Cost Sandbox Mode
              </span>
              <span className="text-xs text-slate-400">All channels ready for local dev</span>
            </div>
            <h2 className="text-xl font-bold text-white">Social Channel Hub</h2>
            <p className="text-sm text-slate-400 mt-1 max-w-xl">
              Connect YouTube, Instagram, and X channels to enable cross-posting, Buffer-style queues,
              and Metricool-grade analytics.
            </p>
          </div>

          <button
            onClick={fetchAccounts}
            className="flex items-center gap-2 bg-slate-800/80 hover:bg-slate-800 text-slate-300 text-xs font-medium px-3.5 py-2 rounded-lg border border-slate-700 transition"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            <span>Sync Accounts</span>
          </button>
        </div>

        {/* Channels Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {PLATFORM_CONFIGS.map((cfg) => {
            const Icon = cfg.icon;
            const connected = accounts.find((a) => a.platform === cfg.platform);
            const isConnecting = actionLoading === `connect_${cfg.platform}`;
            const isDisconnecting = connected && actionLoading === `disconnect_${connected.id}`;

            return (
              <div
                key={cfg.platform}
                className="bg-slate-900/70 border border-slate-800 rounded-2xl p-6 flex flex-col justify-between hover:border-slate-700 transition duration-200"
              >
                <div>
                  {/* Top Header of Card */}
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className={`w-12 h-12 rounded-xl flex items-center justify-center border ${cfg.bgClass}`}>
                        <Icon className={`w-6 h-6 ${cfg.colorClass}`} />
                      </div>
                      <div>
                        <h3 className="font-semibold text-white text-base">{cfg.name}</h3>
                        <p className="text-xs text-slate-400">{cfg.description}</p>
                      </div>
                    </div>
                  </div>

                  {/* Connected Account Details */}
                  {connected ? (
                    <div className="mt-4 pt-4 border-t border-slate-800/80 space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2.5">
                          {connected.avatarUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={connected.avatarUrl}
                              alt={connected.displayName}
                              className="w-10 h-10 rounded-full object-cover border border-slate-700"
                            />
                          ) : (
                            <div className="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center text-sm font-bold text-white">
                              {connected.displayName[0]}
                            </div>
                          )}
                          <div>
                            <span className="text-sm font-semibold text-white block leading-tight">
                              {connected.displayName}
                            </span>
                            <span className="text-xs text-slate-400 block font-mono">
                              {connected.username}
                            </span>
                          </div>
                        </div>

                        <span className="inline-flex items-center gap-1 text-[11px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded-full">
                          <CheckCircle2 className="w-3 h-3" />
                          <span>Active</span>
                        </span>
                      </div>

                      {/* Metrics Pill Grid */}
                      <div className="grid grid-cols-2 gap-2 pt-2">
                        <div className="bg-slate-950/60 rounded-xl p-2.5 border border-slate-800/60">
                          <span className="text-[11px] text-slate-400 block">{cfg.metricsLabel}</span>
                          <span className="text-base font-bold text-white">
                            {formatNumber(connected.followersCount)}
                          </span>
                        </div>
                        <div className="bg-slate-950/60 rounded-xl p-2.5 border border-slate-800/60">
                          <span className="text-[11px] text-slate-400 block">Total Posts</span>
                          <span className="text-base font-bold text-white">
                            {formatNumber(connected.postsCount)}
                          </span>
                        </div>
                      </div>

                      <div className="text-[11px] text-slate-400 flex items-center justify-between pt-1">
                        <span>Environment:</span>
                        <span className="font-medium text-indigo-400 bg-indigo-500/10 px-1.5 py-0.5 rounded border border-indigo-500/20">
                          {connected.isMock ? "Mock Sandbox" : "Live API"}
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-6 py-6 border-t border-dashed border-slate-800 text-center">
                      <AlertCircle className="w-8 h-8 text-slate-600 mx-auto mb-2" />
                      <p className="text-xs text-slate-400">Not currently connected to this workspace.</p>
                    </div>
                  )}
                </div>

                {/* Card Actions */}
                <div className="mt-6 pt-4 border-t border-slate-800">
                  {connected ? (
                    <button
                      onClick={() => handleDisconnect(connected.id)}
                      disabled={isDisconnecting}
                      className="w-full flex items-center justify-center gap-2 bg-slate-800/60 hover:bg-red-950/40 hover:text-red-400 hover:border-red-800/50 text-slate-400 text-xs font-semibold py-2.5 px-4 rounded-xl border border-slate-800 transition"
                    >
                      <Unlink className="w-3.5 h-3.5" />
                      <span>{isDisconnecting ? "Disconnecting..." : "Disconnect Channel"}</span>
                    </button>
                  ) : (
                    <div className="space-y-2">
                      <button
                        onClick={() => handleConnectMock(cfg.platform)}
                        disabled={isConnecting}
                        className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold py-2.5 px-4 rounded-xl shadow-md shadow-indigo-600/20 transition active:scale-98"
                      >
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>{isConnecting ? "Connecting..." : "1-Click Mock Connect (Free)"}</span>
                      </button>

                      {liveIntegration[cfg.platform]?.enabled ? (
                        <a
                          href={`/api/auth/connect/${cfg.platform.toLowerCase()}?mode=live`}
                          className="w-full flex items-center justify-center gap-1.5 bg-slate-800/80 hover:bg-slate-800 text-slate-300 text-[11px] font-medium py-1.5 rounded-lg border border-slate-700/80 transition"
                        >
                          <span>Initiate Live OAuth 2.0</span>
                          <ExternalLink className="w-3 h-3 text-slate-400" />
                        </a>
                      ) : (
                        <button
                          type="button"
                          disabled
                          title={
                            liveIntegration[cfg.platform]?.reason ||
                            "Server-side live OAuth integration is not configured."
                          }
                          className="w-full flex items-center justify-center gap-1.5 bg-slate-900/60 text-slate-500 text-[11px] font-medium py-1.5 rounded-lg border border-slate-800/80 cursor-not-allowed opacity-70"
                        >
                          <span>Initiate Live OAuth 2.0 (Disabled)</span>
                          <ExternalLink className="w-3 h-3 text-slate-600" />
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Architecture Note */}
        <div className="bg-slate-900/40 border border-slate-800 rounded-xl p-4 text-xs text-slate-400 flex items-start gap-3">
          <Sparkles className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
          <div>
            <span className="font-semibold text-slate-200 block mb-0.5">Dual-Mode Provider Architecture:</span>
            Mock accounts generate realistic engagement metrics, 24x7 audience heatmaps, and simulated live URLs.
            When you decide to deploy or connect live API credentials (Meta Graph API, X API v2, YouTube Data API v3),
            simply update your environment variables. No code rewrite is required.
          </div>
        </div>
      </div>
    </DashboardShell>
  );
}
