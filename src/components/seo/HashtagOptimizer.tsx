"use client";

import { useState } from "react";
import { Hash, Copy, Check, Sparkles, Layers } from "lucide-react";
import { SeoService } from "@/services/seo.service";

interface HashtagOptimizerProps {
  onAppendTags?: (tagsString: string) => void;
}

export function HashtagOptimizer({ onAppendTags }: HashtagOptimizerProps) {
  const [topic, setTopic] = useState("Marketing");
  const [rawInput, setRawInput] = useState("social media growth, viral content, buffer metricool, growth hacking");
  const [copied, setCopied] = useState(false);

  const formatCamel = (str: string) => {
    return str
      .split(/[,;\s]+/)
      .filter((s) => s.trim().length > 0)
      .map((s) => SeoService.formatToCamelCaseHashtag(s))
      .filter(Boolean);
  };

  const formattedTags = formatCamel(rawInput);
  const recommendations = SeoService.getHashtagRecommendations(topic);

  const copyToClipboard = (tags: string[]) => {
    navigator.clipboard.writeText(tags.join(" "));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="bg-slate-900/70 border border-slate-800 rounded-3xl p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Hash className="w-4 h-4 text-purple-400" />
            <h3 className="font-bold text-white text-base">CamelCase Hashtag Engine</h3>
          </div>
          <p className="text-xs text-slate-400">
            Social algorithms & screen readers favor CamelCase (#DigitalMarketing over #digitalmarketing).
          </p>
        </div>

        <button
          onClick={() => copyToClipboard(formattedTags)}
          disabled={formattedTags.length === 0}
          className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold px-3 py-1.5 rounded-lg border border-slate-700 transition"
        >
          {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
          <span>{copied ? "Copied!" : "Copy Tags"}</span>
        </button>
      </div>

      {/* Raw Input Box */}
      <div>
        <label className="text-xs font-medium text-slate-400 block mb-1.5">
          Paste Raw Keywords or Tags
        </label>
        <input
          type="text"
          value={rawInput}
          onChange={(e) => setRawInput(e.target.value)}
          placeholder="e.g. social media marketing, content repurposing, reels hack"
          className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-purple-500 font-mono"
        />
      </div>

      {/* Formatted CamelCase Output */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold text-slate-300">
            Formatted CamelCase Tags ({formattedTags.length})
          </span>
          {onAppendTags && formattedTags.length > 0 && (
            <button
              onClick={() => onAppendTags(formattedTags.join(" "))}
              className="text-xs text-indigo-400 hover:text-indigo-300 font-semibold"
            >
              + Append to Editor
            </button>
          )}
        </div>

        <div className="flex flex-wrap gap-2 p-3 bg-slate-950/70 border border-slate-800 rounded-xl min-h-[50px]">
          {formattedTags.length > 0 ? (
            formattedTags.map((tag, i) => (
              <span
                key={i}
                className="bg-purple-950/40 border border-purple-500/30 text-purple-300 text-xs font-mono font-medium px-2.5 py-1 rounded-lg flex items-center gap-1"
              >
                <span>{tag}</span>
              </span>
            ))
          ) : (
            <span className="text-xs text-slate-600 italic">No hashtags entered yet</span>
          )}
        </div>
      </div>

      {/* Tiered Recommendations */}
      <div className="pt-4 border-t border-slate-800 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-indigo-400" />
            <span className="text-xs font-semibold text-white">Algorithm Tier Mix for &quot;{topic}&quot;</span>
          </div>

          <div className="flex gap-1.5">
            {["Marketing", "Creator", "Productivity"].map((t) => (
              <button
                key={t}
                onClick={() => setTopic(t)}
                className={`text-[11px] font-semibold px-2 py-0.5 rounded-md transition ${
                  topic === t
                    ? "bg-indigo-600 text-white"
                    : "bg-slate-800 text-slate-400 hover:text-white"
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-3">
            <span className="text-[10px] font-bold text-sky-400 uppercase tracking-wider block mb-1.5">
              Broad Reach (Volume)
            </span>
            <div className="flex flex-wrap gap-1.5">
              {recommendations.broad.map((tag) => (
                <button
                  key={tag}
                  onClick={() => onAppendTags && onAppendTags(tag)}
                  className="text-[11px] font-mono bg-sky-950/30 text-sky-300 border border-sky-500/20 px-2 py-0.5 rounded hover:bg-sky-900/40"
                  title="Click to append"
                >
                  {tag}
                </button>
              ))}
            </div>
          </div>

          <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-3">
            <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider block mb-1.5">
              Niche Intent (Discovery)
            </span>
            <div className="flex flex-wrap gap-1.5">
              {recommendations.niche.map((tag) => (
                <button
                  key={tag}
                  onClick={() => onAppendTags && onAppendTags(tag)}
                  className="text-[11px] font-mono bg-emerald-950/30 text-emerald-300 border border-emerald-500/20 px-2 py-0.5 rounded hover:bg-emerald-900/40"
                  title="Click to append"
                >
                  {tag}
                </button>
              ))}
            </div>
          </div>

          <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-3">
            <span className="text-[10px] font-bold text-purple-400 uppercase tracking-wider block mb-1.5">
              Community / Peering
            </span>
            <div className="flex flex-wrap gap-1.5">
              {recommendations.community.map((tag) => (
                <button
                  key={tag}
                  onClick={() => onAppendTags && onAppendTags(tag)}
                  className="text-[11px] font-mono bg-purple-950/30 text-purple-300 border border-purple-500/20 px-2 py-0.5 rounded hover:bg-purple-900/40"
                  title="Click to append"
                >
                  {tag}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
