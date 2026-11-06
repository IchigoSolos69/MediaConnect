"use client";

import { useState } from "react";
import { Sparkles, Calendar, Clock, Flame } from "lucide-react";
import { YouTubeIcon, InstagramIcon, XIcon } from "@/components/icons";

interface HeatmapCell {
  dayOfWeek: number;
  hour: number;
  activityScore: number;
}

interface BestSlot {
  dayOfWeek: number;
  hour: number;
  score: number;
  label: string;
}

interface AudienceHeatmapProps {
  cells: HeatmapCell[];
  bestSlots: BestSlot[];
  onSelectSlot?: (dayOfWeek: number, hour: number) => void;
  selectedPlatform: string;
  onPlatformChange: (plat: string) => void;
}

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const HOURS = Array.from({ length: 24 }, (_, i) => i);

export function AudienceHeatmap({
  cells,
  bestSlots,
  onSelectSlot,
  selectedPlatform,
  onPlatformChange,
}: AudienceHeatmapProps) {
  const [hoveredCell, setHoveredCell] = useState<HeatmapCell | null>(null);

  const getCellColor = (score: number) => {
    if (score >= 85) return "bg-pink-500 text-white shadow-sm shadow-pink-500/40";
    if (score >= 70) return "bg-purple-600 text-purple-100";
    if (score >= 50) return "bg-indigo-600/70 text-indigo-100";
    if (score >= 35) return "bg-slate-800 text-slate-300";
    return "bg-slate-900/60 text-slate-600";
  };

  return (
    <div className="bg-slate-900/70 border border-slate-800 rounded-3xl p-6 space-y-6 shadow-xl">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Flame className="w-4 h-4 text-pink-500" />
            <h3 className="font-bold text-white text-base">Metricool-Style Audience Heatmap</h3>
          </div>
          <p className="text-xs text-slate-400">
            24x7 density matrix showing when your followers are actively online. Click any hot spot to schedule.
          </p>
        </div>

        {/* Platform Filter Buttons */}
        <div className="flex items-center bg-slate-950 border border-slate-800 rounded-xl p-1 gap-1">
          <button
            onClick={() => onPlatformChange("ALL")}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
              selectedPlatform === "ALL"
                ? "bg-indigo-600 text-white"
                : "text-slate-400 hover:text-white"
            }`}
          >
            All Networks
          </button>

          <button
            onClick={() => onPlatformChange("INSTAGRAM")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
              selectedPlatform === "INSTAGRAM"
                ? "bg-pink-600 text-white"
                : "text-slate-400 hover:text-white"
            }`}
          >
            <InstagramIcon className="w-3.5 h-3.5" />
            <span>Instagram</span>
          </button>

          <button
            onClick={() => onPlatformChange("X")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
              selectedPlatform === "X"
                ? "bg-sky-600 text-white"
                : "text-slate-400 hover:text-white"
            }`}
          >
            <XIcon className="w-3.5 h-3.5" />
            <span>X</span>
          </button>

          <button
            onClick={() => onPlatformChange("YOUTUBE")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
              selectedPlatform === "YOUTUBE"
                ? "bg-red-600 text-white"
                : "text-slate-400 hover:text-white"
            }`}
          >
            <YouTubeIcon className="w-3.5 h-3.5" />
            <span>YouTube</span>
          </button>
        </div>
      </div>

      {/* Top 3 Peak Recommended Slots */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {bestSlots.map((slot, idx) => (
          <div
            key={idx}
            onClick={() => onSelectSlot && onSelectSlot(slot.dayOfWeek, slot.hour)}
            className="bg-slate-950/70 border border-slate-800/90 rounded-2xl p-3.5 flex items-center justify-between cursor-pointer hover:border-pink-500/40 transition group"
          >
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-pink-500/10 border border-pink-500/20 flex items-center justify-center text-pink-400 font-bold text-xs">
                #{idx + 1}
              </div>
              <div>
                <span className="text-xs font-bold text-white block group-hover:text-pink-300 transition">
                  {slot.label}
                </span>
                <span className="text-[11px] text-slate-400">Peak Activity</span>
              </div>
            </div>

            <span className="text-xs font-mono font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
              {slot.score}%
            </span>
          </div>
        ))}
      </div>

      {/* Heatmap Grid Matrix (7 Days x 24 Hours) */}
      <div className="overflow-x-auto pb-2">
        <div className="min-w-[700px] space-y-1.5">
          {/* Hours Header Row */}
          <div className="grid grid-cols-[50px_repeat(24,1fr)] gap-1 text-center text-[10px] text-slate-500 font-mono">
            <div></div>
            {HOURS.map((h) => (
              <div key={h} className="truncate">
                {h % 3 === 0 ? `${h}h` : ""}
              </div>
            ))}
          </div>

          {/* Days Rows */}
          {DAYS.map((dayName, dayIdx) => (
            <div
              key={dayName}
              className="grid grid-cols-[50px_repeat(24,1fr)] gap-1 items-center"
            >
              <span className="text-xs font-bold text-slate-400">{dayName}</span>

              {HOURS.map((hour) => {
                const cell = cells.find(
                  (c) => c.dayOfWeek === dayIdx && c.hour === hour
                ) || { dayOfWeek: dayIdx, hour, activityScore: 25 };

                return (
                  <button
                    key={hour}
                    type="button"
                    onMouseEnter={() => setHoveredCell(cell)}
                    onMouseLeave={() => setHoveredCell(null)}
                    onClick={() => onSelectSlot && onSelectSlot(dayIdx, hour)}
                    className={`h-7 rounded-md transition transform hover:scale-125 hover:z-10 relative flex items-center justify-center text-[10px] font-mono cursor-pointer ${getCellColor(
                      cell.activityScore
                    )}`}
                    title={`${dayName} ${hour}:00 - ${cell.activityScore}% online`}
                  >
                    {cell.activityScore >= 85 ? "🔥" : ""}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {/* Legend & Hover Status */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between text-xs text-slate-400 pt-2 border-t border-slate-800 gap-2">
        <div className="flex items-center gap-2">
          <span>Density Scale:</span>
          <div className="flex items-center gap-1">
            <span className="w-3.5 h-3.5 rounded bg-slate-900 border border-slate-800 inline-block"></span>
            <span className="text-[11px] text-slate-500 mr-2">Low</span>
            <span className="w-3.5 h-3.5 rounded bg-indigo-600 inline-block"></span>
            <span className="text-[11px] text-slate-400 mr-2">Medium</span>
            <span className="w-3.5 h-3.5 rounded bg-purple-600 inline-block"></span>
            <span className="text-[11px] text-slate-300 mr-2">High</span>
            <span className="w-3.5 h-3.5 rounded bg-pink-500 inline-block"></span>
            <span className="text-[11px] text-pink-300 font-bold">Peak (Optimal)</span>
          </div>
        </div>

        {hoveredCell ? (
          <span className="font-mono text-white bg-slate-800 px-2.5 py-1 rounded-lg">
            {DAYS[hoveredCell.dayOfWeek]} at {hoveredCell.hour}:00 —{" "}
            <strong className="text-pink-400">{hoveredCell.activityScore}%</strong> follower density
          </span>
        ) : (
          <span className="text-slate-500 italic">Hover any slot to inspect audience volume</span>
        )}
      </div>
    </div>
  );
}
