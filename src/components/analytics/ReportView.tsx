"use client";

import { Printer, X, Download, Share2 } from "lucide-react";
import { formatNumber } from "@/lib/utils";

const METRIC_DEFINITIONS = [
  {
    metric: "Impressions / Views",
    definition:
      "Total number of times content was displayed or viewed across connected channels during the selected date window.",
    availabilityNote:
      "Reported by YouTube Analytics API v2 (views) and Instagram Graph API (impressions). Disabled for paid X API.",
  },
  {
    metric: "Unique Reach",
    definition:
      "Distinct user accounts that viewed content at least once during the reporting period.",
    availabilityNote:
      "Provided by Instagram Graph API daily reach. Marked UNAVAILABLE for YouTube daily channel reports.",
  },
  {
    metric: "Total Engagements",
    definition:
      "Aggregate count of likes, comments, shares, and direct content interactions recorded by the platform API.",
    availabilityNote:
      "Provided by YouTube Analytics (likes + comments + shares) and Instagram Insights (total_interactions).",
  },
  {
    metric: "Engagement Rate",
    definition:
      "Percentage of impressions that resulted in an interaction: (Total Engagements / Total Impressions) * 100.",
    availabilityNote: "Computed only when verified impressions are available.",
  },
  {
    metric: "Net Follower Growth",
    definition:
      "Net change in follower or subscriber count across verified daily snapshots within the selected date window.",
    availabilityNote:
      "Marked UNAVAILABLE when fewer than two verified follower snapshots exist; never estimated or fabricated.",
  },
];

interface ReportViewProps {
  isOpen: boolean;
  onClose: () => void;
  brandName: string;
  days?: number;
  startDate?: string;
  endDate?: string;
  dataSource?: string;
  lastSyncedAt?: string | null;
  unavailableMetrics?: string[];
  totalImpressions: number;
  totalReach: number;
  totalEngagements: number;
  totalFollowers: number;
  followerGrowth?: number | null;
  engagementRate: number;
  byPlatform: Record<
    string,
    {
      impressions: number | null;
      reach: number | null;
      engagements: number | null;
      followers: number;
      followerGrowth?: number | null;
      engagementRate: number | null;
      postsCount: number;
      source?: string;
      lastSyncedAt?: string | null;
      unavailableMetrics?: string[];
    }
  >;
}

export function ReportView({
  isOpen,
  onClose,
  brandName,
  days = 14,
  startDate,
  endDate,
  dataSource = "MOCK_SANDBOX",
  lastSyncedAt,
  unavailableMetrics = [],
  totalImpressions,
  totalReach,
  totalEngagements,
  totalFollowers,
  followerGrowth,
  engagementRate,
  byPlatform,
}: ReportViewProps) {
  if (!isOpen) return null;

  const handlePrint = () => {
    window.print();
  };

  const handleServerPdfDownload = () => {
    window.open(`/api/reports/export?days=${days}`, "_blank");
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-4xl max-h-[90vh] overflow-y-auto shadow-2xl flex flex-col">
        {/* Modal Controls (Hidden in Print) */}
        <div className="p-6 border-b border-slate-800 flex items-center justify-between print:hidden">
          <div className="flex items-center gap-2">
            <Share2 className="w-5 h-5 text-indigo-400" />
            <h3 className="font-bold text-white text-base">
              Workspace Performance PDF Report
            </h3>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleServerPdfDownload}
              className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold px-4 py-2 rounded-xl transition shadow-md shadow-emerald-600/20"
            >
              <Download className="w-4 h-4" />
              <span>Download Server PDF</span>
            </button>
            <button
              onClick={handlePrint}
              className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold px-4 py-2 rounded-xl transition shadow-md shadow-indigo-600/20"
            >
              <Printer className="w-4 h-4" />
              <span>Print View</span>
            </button>
            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-white rounded-lg bg-slate-800"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Printable Document Content */}
        <div className="p-8 space-y-8 bg-slate-950 text-slate-100 print:bg-white print:text-black">
          {/* Header */}
          <div className="flex items-start justify-between border-b border-slate-800 pb-6 print:border-gray-200">
            <div>
              <span className="text-xs font-bold text-indigo-400 print:text-indigo-600 uppercase tracking-wider block">
                Executive Social Performance Report
              </span>
              <h2 className="text-2xl font-bold text-white print:text-black mt-1">
                {brandName}
              </h2>
              <p className="text-xs text-slate-400 print:text-gray-500 mt-0.5">
                Reporting Window: {startDate || "Past"} to {endDate || `${days} Days`} ({days} Days)
              </p>
            </div>

            <div className="text-right space-y-1">
              <span className="text-xs font-mono text-slate-400 print:text-gray-500 block">
                Generated: {new Date().toISOString().slice(0, 19).replace("T", " ")} UTC
              </span>
              <span className="text-[10px] font-mono font-semibold text-emerald-400 print:text-emerald-600 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20 inline-block">
                Data Source: {dataSource}
              </span>
              <span className="text-[10px] font-mono text-slate-500 block">
                Last Synced: {lastSyncedAt ? new Date(lastSyncedAt).toLocaleString() : "Not yet synced"}
              </span>
            </div>
          </div>

          {/* Top-Line KPIs */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <div className="p-4 bg-slate-900/80 print:bg-gray-50 border border-slate-800 print:border-gray-200 rounded-2xl">
              <span className="text-[10px] font-semibold text-slate-400 print:text-gray-600 uppercase block">
                Total Impressions
              </span>
              <span className="text-lg font-bold text-white print:text-black block mt-1">
                {formatNumber(totalImpressions)}
              </span>
            </div>

            <div className="p-4 bg-slate-900/80 print:bg-gray-50 border border-slate-800 print:border-gray-200 rounded-2xl">
              <span className="text-[10px] font-semibold text-slate-400 print:text-gray-600 uppercase block">
                Unique Reach
              </span>
              <span className="text-lg font-bold text-white print:text-black block mt-1">
                {formatNumber(totalReach)}
              </span>
            </div>

            <div className="p-4 bg-slate-900/80 print:bg-gray-50 border border-slate-800 print:border-gray-200 rounded-2xl">
              <span className="text-[10px] font-semibold text-slate-400 print:text-gray-600 uppercase block">
                Engagements
              </span>
              <span className="text-lg font-bold text-white print:text-black block mt-1">
                {formatNumber(totalEngagements)}
              </span>
            </div>

            <div className="p-4 bg-slate-900/80 print:bg-gray-50 border border-slate-800 print:border-gray-200 rounded-2xl">
              <span className="text-[10px] font-semibold text-slate-400 print:text-gray-600 uppercase block">
                Engagement Rate
              </span>
              <span className="text-lg font-bold text-emerald-400 print:text-emerald-600 block mt-1">
                {engagementRate}%
              </span>
            </div>

            <div className="p-4 bg-slate-900/80 print:bg-gray-50 border border-slate-800 print:border-gray-200 rounded-2xl">
              <span className="text-[10px] font-semibold text-slate-400 print:text-gray-600 uppercase block">
                Follower Growth
              </span>
              <span className="text-sm font-bold text-white print:text-black block mt-1 font-mono">
                {followerGrowth !== null && followerGrowth !== undefined
                  ? `${followerGrowth >= 0 ? "+" : ""}${formatNumber(followerGrowth)}`
                  : "UNAVAILABLE"}
              </span>
            </div>
          </div>

          {/* Channel Deliveries Table */}
          <div>
            <h4 className="text-sm font-bold text-white print:text-black mb-3">
              Performance Breakdown & Source Attribution by Platform
            </h4>
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-800 print:border-gray-200 text-slate-400 print:text-gray-600 font-semibold uppercase text-[10px]">
                  <th className="pb-2.5">Platform</th>
                  <th className="pb-2.5">Source</th>
                  <th className="pb-2.5">Audience</th>
                  <th className="pb-2.5">Impressions</th>
                  <th className="pb-2.5">Reach</th>
                  <th className="pb-2.5">Engagements</th>
                  <th className="pb-2.5">Eng. Rate</th>
                  <th className="pb-2.5 text-right">Unavailable</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800 print:divide-gray-200 font-mono">
                {Object.entries(byPlatform).map(([plat, data]) => (
                  <tr key={plat}>
                    <td className="py-3 font-bold text-slate-200 print:text-black font-sans">
                      {plat}
                    </td>
                    <td className="py-3 text-[11px] text-indigo-300 print:text-indigo-700">
                      {data.source || dataSource}
                    </td>
                    <td className="py-3 text-slate-300 print:text-gray-700">
                      {formatNumber(data.followers)}
                    </td>
                    <td className="py-3 text-slate-300 print:text-gray-700">
                      {data.impressions !== null ? formatNumber(data.impressions) : "UNAVAILABLE"}
                    </td>
                    <td className="py-3 text-slate-300 print:text-gray-700">
                      {data.reach !== null ? formatNumber(data.reach) : "UNAVAILABLE"}
                    </td>
                    <td className="py-3 text-slate-300 print:text-gray-700">
                      {data.engagements !== null ? formatNumber(data.engagements) : "UNAVAILABLE"}
                    </td>
                    <td className="py-3 text-emerald-400 print:text-emerald-700 font-bold">
                      {data.engagementRate !== null ? `${data.engagementRate}%` : "UNAVAILABLE"}
                    </td>
                    <td className="py-3 text-right text-[10px] text-amber-400 print:text-amber-700">
                      {data.unavailableMetrics && data.unavailableMetrics.length > 0
                        ? data.unavailableMetrics.join(", ")
                        : "None"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Unavailable Data Disclosures */}
          {unavailableMetrics.length > 0 && (
            <div className="bg-amber-950/20 border border-amber-500/30 rounded-2xl p-4 text-xs space-y-1">
              <span className="font-bold text-amber-300 block">
                Unavailable Metrics Disclosure:
              </span>
              <p className="text-slate-300 font-mono text-[11px]">
                {unavailableMetrics.join(" | ")}
              </p>
            </div>
          )}

          {/* Metric Definitions */}
          <div className="bg-slate-900/60 print:bg-gray-50 border border-slate-800 print:border-gray-200 rounded-2xl p-4 text-xs space-y-2">
            <span className="font-bold text-white print:text-black block">
              Metric Definitions & Reporting Notes:
            </span>
            <ul className="list-disc pl-4 space-y-1 text-slate-300 print:text-gray-700 leading-relaxed">
              {METRIC_DEFINITIONS.map((def) => (
                <li key={def.metric}>
                  <strong>{def.metric}:</strong> {def.definition} ({def.availabilityNote})
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
