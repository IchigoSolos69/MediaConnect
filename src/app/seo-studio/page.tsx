"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { MobileFoldPreview } from "@/components/seo/MobileFoldPreview";
import { HashtagOptimizer } from "@/components/seo/HashtagOptimizer";
import { AltTextAssistant } from "@/components/seo/AltTextAssistant";
import { SeoScoreCard } from "@/components/seo/SeoScoreCard";
import { SeoService } from "@/services/seo.service";
import {
  Sparkles,
  Calendar,
  Zap,
  RotateCcw,
  Lightbulb,
} from "lucide-react";

const SAMPLE_POSTS = [
  {
    label: "🔥 High-Converting Hook",
    text: "Are you still manually planning social posts across 5 different tabs? 3 simple automation rules that will save you 15+ hours every week:\n\n1. Fixed queue posting time slots\n2. Real-time hook optimization\n3. CamelCase hashtags for discovery\n\nWhich tool in your stack is slowing you down the most? Drop a comment below! 👇 #SocialMediaMarketing #CreatorEconomy #BufferAlternative",
  },
  {
    label: "⚠️ Weak Hook (Wall of Text)",
    text: "We just released a new feature update to our social media platform and we think it is really cool because it allows you to post to YouTube and Instagram and Twitter and it also has some analytics features which you can see if you log into the dashboard.",
  },
];

export default function SeoStudioPage() {
  const [content, setContent] = useState<string>(SAMPLE_POSTS[0].text);
  const [assistantResult, setAssistantResult] = useState<any>(null);
  const [assistantLoading, setAssistantLoading] = useState<boolean>(false);

  // Compute live SEO analysis on every keystroke
  const analysis = useMemo(() => {
    return SeoService.analyze(content);
  }, [content]);

  const handleAppendTags = (tags: string) => {
    setContent((prev) => `${prev.trim()}\n\n${tags}`);
  };

  const handleGenerateAssistant = async () => {
    try {
      setAssistantLoading(true);
      const res = await fetch("/api/seo/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content, topic: "marketing" }),
      });
      const data = await res.json();
      if (data.success) {
        setAssistantResult(data.assistant);
      }
    } catch (err) {
      console.error("Failed to generate SEO suggestions", err);
    } finally {
      setAssistantLoading(false);
    }
  };

  return (
    <DashboardShell title="Social SEO Studio & Content Assistant">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Banner Header */}
        <div className="bg-gradient-to-r from-slate-900 via-purple-950/40 to-slate-900 border border-slate-800 rounded-3xl p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/30">
                SEO & Algorithm Optimizer
              </span>
              <span className="text-xs text-slate-400">TikTok, Instagram, X & YouTube Search</span>
            </div>
            <h2 className="text-2xl font-bold text-white">Social Caption & Hook Studio</h2>
            <p className="text-sm text-slate-400 mt-1 max-w-xl">
              Optimize for both human curiosity and search ranking algorithms with real-time hook grading, CamelCase formatting, and mobile fold simulation.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleGenerateAssistant}
              disabled={assistantLoading}
              className="flex items-center gap-2 bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold px-4 py-2.5 rounded-xl border border-purple-500/40 transition"
            >
              <Sparkles className="w-4 h-4" />
              <span>
                {assistantLoading ? "Generating..." : "Run AI / Heuristic Assistant"}
              </span>
            </button>
            <Link
              href="/planner"
              className="flex items-center gap-2 bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white text-xs font-semibold px-5 py-2.5 rounded-xl shadow-lg shadow-indigo-500/25 transition active:scale-95"
            >
              <Calendar className="w-4 h-4" />
              <span>Send to Planner</span>
            </Link>
          </div>
        </div>

        {/* Preset Hook Pickers */}
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="text-slate-400 flex items-center gap-1 font-medium">
            <Lightbulb className="w-3.5 h-3.5 text-amber-400" />
            <span>Load Preset:</span>
          </span>
          {SAMPLE_POSTS.map((preset, idx) => (
            <button
              key={idx}
              onClick={() => setContent(preset.text)}
              className="bg-slate-900 hover:bg-slate-800 text-slate-300 px-3 py-1.5 rounded-lg border border-slate-800 transition"
            >
              {preset.label}
            </button>
          ))}
          <button
            onClick={() => setContent("")}
            className="text-slate-500 hover:text-slate-300 px-2 py-1 flex items-center gap-1 transition"
          >
            <RotateCcw className="w-3 h-3" />
            <span>Clear</span>
          </button>
        </div>

        {/* Main 2-Column Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Left Column: Live Content Editor (7 Cols) */}
          <div className="lg:col-span-7 space-y-6">
            <div className="bg-slate-900/70 border border-slate-800 rounded-3xl p-6 space-y-4 shadow-xl">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-white text-base">Interactive Caption Editor</h3>
                  <p className="text-xs text-slate-400">Type or paste your draft to receive instant scoring.</p>
                </div>
                <div className="flex items-center gap-2 font-mono text-xs text-slate-400">
                  <span>{analysis.charCount} chars</span>
                  <span>•</span>
                  <span>{analysis.wordCount} words</span>
                </div>
              </div>

              <textarea
                rows={9}
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="Write your social post here. Start with a curious hook or thought-provoking question..."
                className="w-full bg-slate-950 border border-slate-800 rounded-2xl p-4 text-sm text-white focus:outline-none focus:border-purple-500 leading-relaxed resize-none shadow-inner"
              />

              {/* Detected Power Words Pills */}
              {analysis.detectedPowerWords.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5 pt-1">
                  <span className="text-[11px] font-semibold text-slate-400 flex items-center gap-1 mr-1">
                    <Zap className="w-3.5 h-3.5 text-amber-400" />
                    <span>Power Words Detected:</span>
                  </span>
                  {analysis.detectedPowerWords.map((pw, i) => (
                    <span
                      key={i}
                      className="bg-amber-500/10 border border-amber-500/20 text-amber-300 text-[11px] font-mono font-medium px-2 py-0.5 rounded-full"
                    >
                      {pw}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Score Breakdown & Algorithm Checklist */}
            <SeoScoreCard
              scores={analysis.scores}
              recommendations={analysis.recommendations}
            />

            {/* AI / Heuristic Assistant Output Panel */}
            {assistantResult && (
              <div className="bg-slate-900/70 border border-slate-800 rounded-3xl p-6 space-y-4 shadow-xl">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-purple-400" />
                    <h3 className="font-bold text-white text-sm">
                      Social SEO Assistant Suggestions
                    </h3>
                  </div>
                  <span className="text-[11px] font-mono font-semibold px-2.5 py-0.5 rounded-full bg-indigo-500/15 text-indigo-300 border border-indigo-500/30">
                    {assistantResult.source} ({assistantResult.provider}: {assistantResult.model})
                  </span>
                </div>

                <p className="text-[11px] text-slate-400 bg-slate-950/70 border border-slate-800 rounded-xl p-3">
                  {assistantResult.disclaimer}
                </p>

                <div className="space-y-2">
                  <span className="text-xs font-semibold text-slate-300 block">
                    Hook Alternatives:
                  </span>
                  {assistantResult.hookAlternatives?.map((h: any, i: number) => (
                    <div
                      key={i}
                      onClick={() => setContent(h.hook + "\n\n" + content)}
                      className="p-3 bg-slate-950 border border-slate-800 hover:border-purple-500/40 rounded-xl text-xs text-slate-200 cursor-pointer transition"
                    >
                      <span className="text-[10px] font-mono text-purple-400 uppercase block mb-0.5">
                        {h.style}
                      </span>
                      {h.hook}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Right Column: Visual Smartphone Simulator (5 Cols) */}
          <div className="lg:col-span-5 space-y-6 sticky top-24">
            <MobileFoldPreview content={content} />
          </div>
        </div>

        {/* Bottom Section: Hashtags & Alt-Text Tools */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 pt-4">
          <HashtagOptimizer onAppendTags={handleAppendTags} />
          <AltTextAssistant />
        </div>
      </div>
    </DashboardShell>
  );
}
