"use client";

import { useState } from "react";
import { Users, Plus, TrendingUp, ShieldAlert, Award } from "lucide-react";
import { YouTubeIcon, InstagramIcon, XIcon } from "@/components/icons";
import { formatNumber } from "@/lib/utils";

interface Competitor {
  id: string;
  platform: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  followersCount: number;
  postsCount: number;
  engagementRate: number;
}

interface CompetitorTrackerProps {
  competitors: Competitor[];
  yourFollowers: number;
  yourEngagementRate: number;
  onCompetitorAdded?: () => void;
}

export function CompetitorTracker({
  competitors,
  yourFollowers,
  yourEngagementRate,
  onCompetitorAdded,
}: CompetitorTrackerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [platform, setPlatform] = useState("X");
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [followers, setFollowers] = useState("75000");
  const [isAdding, setIsAdding] = useState(false);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setIsAdding(true);
      const res = await fetch("/api/competitors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          platform,
          username,
          displayName,
          followersCount: followers,
          engagementRate: 2.2,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setUsername("");
        setDisplayName("");
        setIsOpen(false);
        if (onCompetitorAdded) onCompetitorAdded();
      }
    } catch (err) {
      console.error("Failed to add competitor", err);
    } finally {
      setIsAdding(false);
    }
  };

  return (
    <div className="bg-slate-900/70 border border-slate-800 rounded-3xl p-6 space-y-6 shadow-xl">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Award className="w-4 h-4 text-amber-400" />
            <h3 className="font-bold text-white text-base">Competitor Benchmarking (Metricool-Grade)</h3>
          </div>
          <p className="text-xs text-slate-400">
            Monitor growth trajectories, posting frequency, and engagement rates against key competitors.
          </p>
        </div>

        <button
          onClick={() => setIsOpen(!isOpen)}
          className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold px-3.5 py-2 rounded-xl transition shadow-md shadow-indigo-600/20 active:scale-95"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Add Competitor</span>
        </button>
      </div>

      {/* Add Competitor Form */}
      {isOpen && (
        <form
          onSubmit={handleAdd}
          className="bg-slate-950/80 border border-slate-800 rounded-2xl p-4 space-y-3 animate-in fade-in"
        >
          <span className="text-xs font-bold text-white block">Track New Competitor</span>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <select
              value={platform}
              onChange={(e) => setPlatform(e.target.value)}
              className="bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
            >
              <option value="X">X (Twitter)</option>
              <option value="INSTAGRAM">Instagram</option>
              <option value="YOUTUBE">YouTube</option>
            </select>

            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Username (e.g. Wired)"
              required
              className="bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
            />

            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Brand Name (e.g. WIRED)"
              className="bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
            />

            <input
              type="number"
              value={followers}
              onChange={(e) => setFollowers(e.target.value)}
              placeholder="Est. Followers"
              className="bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="text-xs text-slate-400 hover:text-white px-3 py-1.5"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isAdding}
              className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold px-4 py-1.5 rounded-lg transition"
            >
              {isAdding ? "Adding..." : "Save Competitor"}
            </button>
          </div>
        </form>
      )}

      {/* Comparison Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="border-b border-slate-800 text-slate-400 font-semibold uppercase tracking-wider text-[11px]">
              <th className="pb-3">Account / Brand</th>
              <th className="pb-3">Platform</th>
              <th className="pb-3">Audience Size</th>
              <th className="pb-3">Engagement Rate</th>
              <th className="pb-3 text-right">Benchmarking Delta</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60 font-sans">
            {/* Your Brand Row */}
            <tr className="bg-indigo-950/20 font-medium">
              <td className="py-3.5 flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-lg bg-indigo-600 text-white flex items-center justify-center font-bold text-xs">
                  ★
                </div>
                <div>
                  <span className="font-bold text-white block">Acme Media (You)</span>
                  <span className="text-[10px] text-indigo-400">Primary Brand</span>
                </div>
              </td>
              <td className="py-3.5 text-slate-300">All 3 Networks</td>
              <td className="py-3.5 font-bold text-white">{formatNumber(yourFollowers)}</td>
              <td className="py-3.5">
                <span className="font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                  {yourEngagementRate}%
                </span>
              </td>
              <td className="py-3.5 text-right font-bold text-indigo-400">Baseline</td>
            </tr>

            {/* Competitor Rows */}
            {competitors.map((comp) => {
              const engDelta = (yourEngagementRate - comp.engagementRate).toFixed(1);
              const isHigherEng = Number(engDelta) >= 0;

              return (
                <tr key={comp.id} className="hover:bg-slate-900/40 transition">
                  <td className="py-3.5 flex items-center gap-2.5">
                    {comp.avatarUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={comp.avatarUrl}
                        alt={comp.displayName}
                        className="w-7 h-7 rounded-lg object-cover border border-slate-800"
                      />
                    ) : (
                      <div className="w-7 h-7 rounded-lg bg-slate-800 flex items-center justify-center font-bold text-slate-300">
                        {comp.displayName[0]}
                      </div>
                    )}
                    <div>
                      <span className="font-semibold text-slate-200 block">{comp.displayName}</span>
                      <span className="text-[10px] text-slate-500 font-mono">@{comp.username}</span>
                    </div>
                  </td>
                  <td className="py-3.5">
                    <span className="flex items-center gap-1.5 text-slate-300 font-mono text-[11px]">
                      {comp.platform === "YOUTUBE" && <YouTubeIcon className="w-3.5 h-3.5 text-red-500" />}
                      {comp.platform === "INSTAGRAM" && <InstagramIcon className="w-3.5 h-3.5 text-pink-500" />}
                      {comp.platform === "X" && <XIcon className="w-3.5 h-3.5 text-sky-400" />}
                      <span>{comp.platform}</span>
                    </span>
                  </td>
                  <td className="py-3.5 font-mono text-slate-300">
                    {formatNumber(comp.followersCount)}
                  </td>
                  <td className="py-3.5 font-mono text-slate-300">{comp.engagementRate}%</td>
                  <td className="py-3.5 text-right font-mono font-semibold">
                    <span
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] ${
                        isHigherEng
                          ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                          : "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                      }`}
                    >
                      {isHigherEng ? `+${engDelta}% Higher` : `${engDelta}% Lower`}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
