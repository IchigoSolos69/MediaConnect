"use client";

import { useEffect, useState, useCallback } from "react";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { AudienceHeatmap } from "@/components/analytics/AudienceHeatmap";
import { CompetitorTracker } from "@/components/analytics/CompetitorTracker";
import { ReportView } from "@/components/analytics/ReportView";
import {
  Users,
  Eye,
  TrendingUp,
  Share2,
  FileText,
  RefreshCw,
} from "lucide-react";
import { YouTubeIcon, InstagramIcon, XIcon } from "@/components/icons";
import { formatNumber } from "@/lib/utils";

export default function AnalyticsPage() {
  const [days, setDays] = useState(14);
  const [platform, setPlatform] = useState("ALL");
  const [data, setData] = useState<any>(null);
  const [competitors, setCompetitors] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [isReportOpen, setIsReportOpen] = useState(false);

  const fetchAnalytics = useCallback(async () => {
    try {
      setLoading(true);
      const [analyticsRes, compRes] = await Promise.all([
        fetch(`/api/analytics?days=${days}&platform=${platform}`),
        fetch("/api/competitors"),
      ]);

      const [analyticsData, compData] = await Promise.all([
        analyticsRes.json(),
        compRes.json(),
      ]);

      if (analyticsData.success) {
        setData(analyticsData);
      }
      if (compData.success) {
        setCompetitors(compData.competitors);
      }
    } catch (err) {
      console.error("Failed to load analytics data", err);
    } finally {
      setLoading(false);
    }
  }, [days, platform]);

  const handleSyncAnalytics = async () => {
    try {
      setSyncing(true);
      const res = await fetch("/api/analytics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ days }),
      });
      const json = await res.json();
      if (json.success) {
        setData(json);
      }
    } catch (err) {
      console.error("Analytics sync error", err);
    } finally {
      setSyncing(false);
    }
  };

  useEffect(() => {
    fetchAnalytics();
  }, [fetchAnalytics]);

  const overview = data?.overview;
  const heatmap = data?.heatmap;

  return (
    <DashboardShell title="Analytics & Metricool Intelligence">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Banner Header */}
        <div className="bg-gradient-to-r from-slate-900 via-indigo-950/40 to-slate-900 border border-slate-800 rounded-3xl p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                Source: {overview?.dataSource || "LOADING"}
              </span>
              {overview?.lastSyncedAt ? (
                <span className="text-xs font-mono text-slate-400">
                  Last Synced: {new Date(overview.lastSyncedAt).toLocaleString()}
                </span>
              ) : (
                <span className="text-xs font-mono text-amber-400">
                  Not yet synchronized
                </span>
              )}
            </div>
            <h2 className="text-2xl font-bold text-white">
              {overview?.workspaceName || "Workspace"} Performance & Intelligence Suite
            </h2>
            <p className="text-sm text-slate-400 mt-1 max-w-xl">
              Tenant-isolated impressions, engagement rates, audience heatmaps, and competitor benchmarking with explicit source attribution.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Date Range Selector */}
            <div className="flex items-center bg-slate-950 border border-slate-800 rounded-xl p-1 gap-1">
              {[7, 14, 30].map((d) => (
                <button
                  key={d}
                  onClick={() => setDays(d)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                    days === d
                      ? "bg-indigo-600 text-white"
                      : "text-slate-400 hover:text-white"
                  }`}
                >
                  {d} Days
                </button>
              ))}
            </div>

            <button
              onClick={handleSyncAnalytics}
              disabled={syncing || loading}
              className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold px-3.5 py-2.5 rounded-xl border border-slate-700 transition"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${syncing ? "animate-spin" : ""}`} />
              <span>{syncing ? "Syncing..." : "Sync Insights"}</span>
            </button>

            <button
              onClick={() => setIsReportOpen(true)}
              className="flex items-center gap-2 bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white text-xs font-semibold px-4 py-2.5 rounded-xl shadow-lg shadow-indigo-500/25 transition active:scale-95"
            >
              <FileText className="w-4 h-4" />
              <span>Export PDF Report</span>
            </button>
          </div>
        </div>

        {/* Top-Line KPI Summary Cards */}
        {overview && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-5 hover:border-slate-700 transition">
              <div className="flex items-center justify-between text-slate-400 mb-3">
                <span className="text-xs font-medium uppercase tracking-wider">Total Impressions</span>
                <div className="w-8 h-8 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
                  <Eye className="w-4 h-4" />
                </div>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-bold text-white tracking-tight">
                  {formatNumber(overview.totalImpressions)}
                </span>
              </div>
              <span className="text-[11px] text-slate-500 block mt-1">
                {overview.startDate} to {overview.endDate} ({overview.dataSource})
              </span>
            </div>

            <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-5 hover:border-slate-700 transition">
              <div className="flex items-center justify-between text-slate-400 mb-3">
                <span className="text-xs font-medium uppercase tracking-wider">Unique Reach</span>
                <div className="w-8 h-8 rounded-lg bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400">
                  <Share2 className="w-4 h-4" />
                </div>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-bold text-white tracking-tight">
                  {formatNumber(overview.totalReach)}
                </span>
              </div>
              <span className="text-[11px] text-slate-500 block mt-1">
                {overview.unavailableMetrics?.includes("YOUTUBE:reach")
                  ? "Excludes YouTube (Reach not provided by YT API)"
                  : "Distinct user accounts reached"}
              </span>
            </div>

            <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-5 hover:border-slate-700 transition">
              <div className="flex items-center justify-between text-slate-400 mb-3">
                <span className="text-xs font-medium uppercase tracking-wider">Total Engagements</span>
                <div className="w-8 h-8 rounded-lg bg-pink-500/10 border border-pink-500/20 flex items-center justify-center text-pink-400">
                  <TrendingUp className="w-4 h-4" />
                </div>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-bold text-white tracking-tight">
                  {formatNumber(overview.totalEngagements)}
                </span>
                <span className="text-xs text-emerald-400 font-bold">
                  {overview.engagementRate}% rate
                </span>
              </div>
              <span className="text-[11px] text-slate-500 block mt-1">Likes, comments, shares & clicks</span>
            </div>

            <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-5 hover:border-slate-700 transition">
              <div className="flex items-center justify-between text-slate-400 mb-3">
                <span className="text-xs font-medium uppercase tracking-wider">Net Follower Growth</span>
                <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
                  <Users className="w-4 h-4" />
                </div>
              </div>
              <div className="flex items-baseline gap-2">
                {overview.followerGrowth !== null && overview.followerGrowth !== undefined ? (
                  <>
                    <span className="text-2xl font-bold text-white tracking-tight">
                      {overview.followerGrowth >= 0 ? "+" : ""}
                      {formatNumber(overview.followerGrowth)}
                    </span>
                    <span className="text-xs text-slate-400">net delta</span>
                  </>
                ) : (
                  <span className="text-sm font-mono font-semibold text-amber-400">
                    Unavailable (Insufficient snapshots)
                  </span>
                )}
              </div>
              <span className="text-[11px] text-slate-500 block mt-1">
                Total base: {formatNumber(overview.totalFollowers)}
              </span>
            </div>
          </div>
        )}

        {/* Per-Platform Breakdown Cards */}
        {overview && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
            {Object.entries(overview.byPlatform).map(([plat, pData]: [string, any]) => {
              const isYt = plat === "YOUTUBE";
              const isIg = plat === "INSTAGRAM";
              return (
                <div
                  key={plat}
                  className="bg-slate-900/70 border border-slate-800 rounded-2xl p-5 space-y-4"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div
                        className={`w-9 h-9 rounded-xl flex items-center justify-center border ${
                          isYt
                            ? "bg-red-500/10 border-red-500/20 text-red-500"
                            : isIg
                            ? "bg-pink-500/10 border-pink-500/20 text-pink-500"
                            : "bg-sky-500/10 border-sky-500/20 text-sky-400"
                        }`}
                      >
                        {isYt && <YouTubeIcon className="w-5 h-5" />}
                        {isIg && <InstagramIcon className="w-5 h-5" />}
                        {!isYt && !isIg && <XIcon className="w-5 h-5" />}
                      </div>
                      <div>
                        <span className="text-sm font-bold text-white block">{plat}</span>
                        <span className="text-xs text-slate-400 font-mono">
                          {formatNumber(pData.followers)} audience
                        </span>
                      </div>
                    </div>

                    <div className="text-right">
                      <span className="text-[10px] font-mono font-semibold text-indigo-300 bg-indigo-500/10 px-2 py-0.5 rounded border border-indigo-500/20 block">
                        {pData.source}
                      </span>
                      {pData.engagementRate !== null && (
                        <span className="text-[11px] font-mono font-bold text-emerald-400 mt-1 block">
                          {pData.engagementRate}% Eng
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-800/80">
                    <div className="bg-slate-950/60 p-2.5 rounded-xl border border-slate-800/60">
                      <span className="text-[10px] text-slate-400 block">Impressions</span>
                      <span className="text-xs font-bold text-white font-mono">
                        {pData.impressions !== null ? formatNumber(pData.impressions) : "UNAVAILABLE"}
                      </span>
                    </div>
                    <div className="bg-slate-950/60 p-2.5 rounded-xl border border-slate-800/60">
                      <span className="text-[10px] text-slate-400 block">Reach</span>
                      <span className="text-xs font-bold text-white font-mono">
                        {pData.reach !== null ? formatNumber(pData.reach) : "UNAVAILABLE"}
                      </span>
                    </div>
                    <div className="bg-slate-950/60 p-2.5 rounded-xl border border-slate-800/60">
                      <span className="text-[10px] text-slate-400 block">Engagements</span>
                      <span className="text-xs font-bold text-white font-mono">
                        {pData.engagements !== null ? formatNumber(pData.engagements) : "UNAVAILABLE"}
                      </span>
                    </div>
                  </div>

                  {pData.unavailableMetrics?.length > 0 && (
                    <div className="text-[10px] text-amber-400/90 font-mono bg-amber-500/5 border border-amber-500/20 rounded-lg px-2.5 py-1.5">
                      Unavailable metrics: {pData.unavailableMetrics.join(", ")}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* 24x7 Metricool Audience Activity Heatmap */}
        {heatmap && (
          <AudienceHeatmap
            cells={heatmap.cells}
            bestSlots={heatmap.bestSlots}
            available={heatmap.available}
            source={heatmap.source}
            lastSyncedAt={heatmap.lastSyncedAt}
            reason={heatmap.reason}
            selectedPlatform={platform}
            onPlatformChange={setPlatform}
          />
        )}

        {/* Competitor Benchmarking Section */}
        {overview && (
          <CompetitorTracker
            competitors={competitors}
            yourFollowers={overview.totalFollowers}
            yourEngagementRate={overview.engagementRate}
            onCompetitorAdded={fetchAnalytics}
          />
        )}

        {/* White-Label Client Report Modal */}
        {overview && (
          <ReportView
            isOpen={isReportOpen}
            onClose={() => setIsReportOpen(false)}
            brandName={overview.workspaceName || "Workspace"}
            days={days}
            startDate={overview.startDate}
            endDate={overview.endDate}
            dataSource={overview.dataSource}
            lastSyncedAt={overview.lastSyncedAt}
            unavailableMetrics={overview.unavailableMetrics}
            totalImpressions={overview.totalImpressions}
            totalReach={overview.totalReach}
            totalEngagements={overview.totalEngagements}
            totalFollowers={overview.totalFollowers}
            followerGrowth={overview.followerGrowth}
            engagementRate={overview.engagementRate}
            byPlatform={overview.byPlatform}
          />
        )}
      </div>
    </DashboardShell>
  );
}
