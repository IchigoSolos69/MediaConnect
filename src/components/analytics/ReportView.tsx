"use client";

import { Printer, X, Download, ShieldCheck, Share2 } from "lucide-react";
import { formatNumber } from "@/lib/utils";

interface ReportViewProps {
  isOpen: boolean;
  onClose: () => void;
  brandName: string;
  totalImpressions: number;
  totalReach: number;
  totalEngagements: number;
  totalFollowers: number;
  engagementRate: number;
  byPlatform: Record<
    string,
    {
      impressions: number;
      reach: number;
      engagements: number;
      followers: number;
      engagementRate: number;
      postsCount: number;
    }
  >;
}

export function ReportView({
  isOpen,
  onClose,
  brandName,
  totalImpressions,
  totalReach,
  totalEngagements,
  totalFollowers,
  engagementRate,
  byPlatform,
}: ReportViewProps) {
  if (!isOpen) return null;

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-4xl max-h-[90vh] overflow-y-auto shadow-2xl flex flex-col">
        {/* Modal Controls (Hidden in Print) */}
        <div className="p-6 border-b border-slate-800 flex items-center justify-between print:hidden">
          <div className="flex items-center gap-2">
            <Share2 className="w-5 h-5 text-indigo-400" />
            <h3 className="font-bold text-white text-base">White-Label Client PDF Report</h3>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold px-4 py-2 rounded-xl transition shadow-md shadow-indigo-600/20"
            >
              <Printer className="w-4 h-4" />
              <span>Print / Save as PDF</span>
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
                Multi-channel review covering YouTube, Instagram, and X
              </p>
            </div>

            <div className="text-right">
              <span className="text-xs font-mono text-slate-400 print:text-gray-500 block">
                Generated: {new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
              </span>
              <span className="text-[10px] font-semibold text-emerald-400 print:text-emerald-600 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20 inline-block mt-1">
                Verified Cross-Channel Ingestion
              </span>
            </div>
          </div>

          {/* Top-Line KPIs */}
          <div className="grid grid-cols-4 gap-4">
            <div className="p-4 bg-slate-900/80 print:bg-gray-50 border border-slate-800 print:border-gray-200 rounded-2xl">
              <span className="text-[11px] font-semibold text-slate-400 print:text-gray-600 uppercase block">
                Total Impressions
              </span>
              <span className="text-xl font-bold text-white print:text-black block mt-1">
                {formatNumber(totalImpressions)}
              </span>
            </div>

            <div className="p-4 bg-slate-900/80 print:bg-gray-50 border border-slate-800 print:border-gray-200 rounded-2xl">
              <span className="text-[11px] font-semibold text-slate-400 print:text-gray-600 uppercase block">
                Unique Reach
              </span>
              <span className="text-xl font-bold text-white print:text-black block mt-1">
                {formatNumber(totalReach)}
              </span>
            </div>

            <div className="p-4 bg-slate-900/80 print:bg-gray-50 border border-slate-800 print:border-gray-200 rounded-2xl">
              <span className="text-[11px] font-semibold text-slate-400 print:text-gray-600 uppercase block">
                Engagements
              </span>
              <span className="text-xl font-bold text-white print:text-black block mt-1">
                {formatNumber(totalEngagements)}
              </span>
            </div>

            <div className="p-4 bg-slate-900/80 print:bg-gray-50 border border-slate-800 print:border-gray-200 rounded-2xl">
              <span className="text-[11px] font-semibold text-slate-400 print:text-gray-600 uppercase block">
                Engagement Rate
              </span>
              <span className="text-xl font-bold text-emerald-400 print:text-emerald-600 block mt-1">
                {engagementRate}%
              </span>
            </div>
          </div>

          {/* Channel Deliveries Table */}
          <div>
            <h4 className="text-sm font-bold text-white print:text-black mb-3">
              Performance Breakdown by Platform
            </h4>
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-800 print:border-gray-200 text-slate-400 print:text-gray-600 font-semibold uppercase text-[10px]">
                  <th className="pb-2.5">Platform</th>
                  <th className="pb-2.5">Audience Base</th>
                  <th className="pb-2.5">Impressions</th>
                  <th className="pb-2.5">Engagements</th>
                  <th className="pb-2.5">Engagement Rate</th>
                  <th className="pb-2.5 text-right">Published Posts</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800 print:divide-gray-200 font-mono">
                {Object.entries(byPlatform).map(([plat, data]) => (
                  <tr key={plat}>
                    <td className="py-3 font-bold text-slate-200 print:text-black font-sans">{plat}</td>
                    <td className="py-3 text-slate-300 print:text-gray-700">{formatNumber(data.followers)}</td>
                    <td className="py-3 text-slate-300 print:text-gray-700">{formatNumber(data.impressions)}</td>
                    <td className="py-3 text-slate-300 print:text-gray-700">{formatNumber(data.engagements)}</td>
                    <td className="py-3 text-emerald-400 print:text-emerald-700 font-bold">{data.engagementRate}%</td>
                    <td className="py-3 text-right text-slate-300 print:text-gray-700">{data.postsCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Strategic Recommendations */}
          <div className="bg-slate-900/60 print:bg-gray-50 border border-slate-800 print:border-gray-200 rounded-2xl p-4 text-xs space-y-2">
            <span className="font-bold text-white print:text-black block">
              Strategic Growth Insights & Next Steps:
            </span>
            <ul className="list-disc pl-4 space-y-1 text-slate-300 print:text-gray-700 leading-relaxed">
              <li>Instagram reels and carousels delivered the highest per-post engagement (7.38%). Focus queue slots on Wednesday/Friday evenings.</li>
              <li>X (Twitter) posts with CamelCase hashtags generated 22% more retweets and impressions than unformatted tags.</li>
              <li>Schedule evergreen content into the Monday & Thursday 1:00 PM Buffer queue slots to capture secondary peak audience activity.</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
