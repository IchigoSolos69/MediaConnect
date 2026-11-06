"use client";

import { useState } from "react";
import { YouTubeIcon, InstagramIcon, XIcon } from "@/components/icons";

interface MobileFoldPreviewProps {
  content: string;
}

export function MobileFoldPreview({ content }: MobileFoldPreviewProps) {
  const [platform, setPlatform] = useState<"INSTAGRAM" | "X" | "YOUTUBE">("INSTAGRAM");
  const [expanded, setExpanded] = useState(false);

  const trimmed = content.trim();

  // Cutoff points
  let cutoff = 125;
  if (platform === "X") cutoff = 280;
  if (platform === "YOUTUBE") cutoff = 100;

  const isTruncated = trimmed.length > cutoff;
  const visible = isTruncated && !expanded ? trimmed.slice(0, cutoff) : trimmed;
  const hidden = isTruncated ? trimmed.slice(cutoff) : "";

  return (
    <div className="bg-slate-900/70 border border-slate-800 rounded-3xl p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <span className="text-xs font-semibold text-indigo-400 uppercase tracking-wider block">
            Visual Simulator
          </span>
          <h3 className="text-base font-bold text-white">Mobile Fold & &quot;See more&quot; Cutoff</h3>
        </div>

        {/* Platform Selector Buttons */}
        <div className="flex items-center bg-slate-950 border border-slate-800 rounded-xl p-1 gap-1">
          <button
            onClick={() => {
              setPlatform("INSTAGRAM");
              setExpanded(false);
            }}
            className={`p-2 rounded-lg transition ${
              platform === "INSTAGRAM"
                ? "bg-pink-500/20 text-pink-400 border border-pink-500/30"
                : "text-slate-400 hover:text-white"
            }`}
            title="Instagram Mobile Feed"
          >
            <InstagramIcon className="w-4 h-4" />
          </button>

          <button
            onClick={() => {
              setPlatform("X");
              setExpanded(false);
            }}
            className={`p-2 rounded-lg transition ${
              platform === "X"
                ? "bg-sky-500/20 text-sky-400 border border-sky-500/30"
                : "text-slate-400 hover:text-white"
            }`}
            title="X (Twitter) Mobile Feed"
          >
            <XIcon className="w-4 h-4" />
          </button>

          <button
            onClick={() => {
              setPlatform("YOUTUBE");
              setExpanded(false);
            }}
            className={`p-2 rounded-lg transition ${
              platform === "YOUTUBE"
                ? "bg-red-500/20 text-red-400 border border-red-500/30"
                : "text-slate-400 hover:text-white"
            }`}
            title="YouTube Shorts / Community"
          >
            <YouTubeIcon className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Smartphone Shell Mockup */}
      <div className="max-w-[340px] mx-auto bg-slate-950 border-4 border-slate-800 rounded-[36px] p-4 shadow-2xl relative">
        {/* Phone Speaker Notch */}
        <div className="w-20 h-3 bg-slate-800 rounded-full mx-auto mb-4"></div>

        {/* Mock Post Card inside Phone */}
        <div className="bg-slate-900 border border-slate-800/80 rounded-2xl p-3.5 space-y-3">
          {/* Mock Author Header */}
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-purple-500 to-indigo-500 flex items-center justify-center text-xs font-bold text-white">
              A
            </div>
            <div>
              <span className="text-xs font-bold text-white block leading-tight">Acme Media</span>
              <span className="text-[10px] text-slate-400 block font-mono">
                {platform === "INSTAGRAM"
                  ? "@acmemedia"
                  : platform === "X"
                  ? "@AcmeMediaHQ"
                  : "@AcmeStudios"}
              </span>
            </div>
          </div>

          {/* Post Text Simulation */}
          <div className="text-xs text-slate-200 leading-relaxed font-sans">
            {trimmed.length === 0 ? (
              <span className="text-slate-600 italic">Start typing in the editor to see your live mobile feed preview...</span>
            ) : (
              <>
                <span className="text-white font-medium">{visible}</span>
                {isTruncated && !expanded && (
                  <button
                    onClick={() => setExpanded(true)}
                    className="text-slate-400 hover:text-white font-semibold ml-1 underline cursor-pointer"
                  >
                    ...more
                  </button>
                )}
                {isTruncated && expanded && (
                  <span className="text-slate-300">{hidden}</span>
                )}
              </>
            )}
          </div>

          {/* Visual Fold Indicator Line */}
          {isTruncated && !expanded && (
            <div className="pt-2 border-t border-dashed border-red-500/40 text-[10px] text-red-400 flex items-center justify-between">
              <span>⚠️ Fold cutoff (~{cutoff} chars)</span>
              <span>Scroll barrier</span>
            </div>
          )}
        </div>
      </div>

      <p className="text-center text-[11px] text-slate-500">
        On mobile screens, 74% of users will not click &quot;...more&quot; if the opening line doesn&apos;t hook them.
      </p>
    </div>
  );
}
