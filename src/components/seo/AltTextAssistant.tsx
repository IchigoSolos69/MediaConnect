"use client";

import { useState } from "react";
import { Eye, Copy, Check, Sparkles } from "lucide-react";

export function AltTextAssistant() {
  const [subject, setSubject] = useState("Dashboard showing social media scheduling calendar and analytics graphs");
  const [targetKeywords, setTargetKeywords] = useState("social media calendar, metricool alternative, content marketing planner");
  const [copied, setCopied] = useState(false);

  const generateAltText = () => {
    const cleanedSubject = subject.trim();
    const keywords = targetKeywords.split(/[,;]+/).map((k) => k.trim()).filter(Boolean);

    if (!cleanedSubject) return "";

    const keywordClause = keywords.length > 0 ? ` featuring ${keywords.join(" and ")}` : "";
    return `${cleanedSubject}${keywordClause}. High-contrast modern interface with dark mode aesthetic.`;
  };

  const altText = generateAltText();

  const handleCopy = () => {
    navigator.clipboard.writeText(altText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="bg-slate-900/70 border border-slate-800 rounded-3xl p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Eye className="w-4 h-4 text-emerald-400" />
            <h3 className="font-bold text-white text-base">Image Alt-Text Keyword Generator</h3>
          </div>
          <p className="text-xs text-slate-400">
            Instagram, Pinterest, and Google index image alt-text to rank posts in visual search.
          </p>
        </div>

        <button
          onClick={handleCopy}
          disabled={!altText}
          className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold px-3 py-1.5 rounded-lg border border-slate-700 transition"
        >
          {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
          <span>{copied ? "Copied!" : "Copy Alt-Text"}</span>
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="text-xs font-medium text-slate-400 block mb-1">
            Visual Subject Description
          </label>
          <input
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="e.g. Creator holding laptop analyzing analytics charts"
            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
          />
        </div>

        <div>
          <label className="text-xs font-medium text-slate-400 block mb-1">
            Target Search Keywords
          </label>
          <input
            type="text"
            value={targetKeywords}
            onChange={(e) => setTargetKeywords(e.target.value)}
            placeholder="e.g. social media marketing, buffer alternative"
            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
          />
        </div>
      </div>

      <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-4">
        <span className="text-xs font-semibold text-slate-300 block mb-1">
          Generated SEO Alt-Text:
        </span>
        <p className="text-xs text-emerald-300 font-mono leading-relaxed bg-emerald-950/20 p-3 rounded-lg border border-emerald-500/20">
          {altText || "Enter a subject description above to generate accessibility-compliant SEO alt-text."}
        </p>
      </div>
    </div>
  );
}
