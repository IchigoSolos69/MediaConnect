import { Sparkles, CheckCircle2, AlertCircle, Info } from "lucide-react";
import { SeoScoreBreakdown } from "@/services/seo.service";

interface SeoScoreCardProps {
  scores: SeoScoreBreakdown;
  recommendations: Array<{
    type: "CRITICAL" | "RECOMMENDATION" | "PERFECT";
    text: string;
  }>;
}

export function SeoScoreCard({ scores, recommendations }: SeoScoreCardProps) {
  const getScoreColor = (score: number) => {
    if (score >= 80) return "text-emerald-400 border-emerald-500/30 bg-emerald-500/10";
    if (score >= 60) return "text-amber-400 border-amber-500/30 bg-amber-500/10";
    return "text-red-400 border-red-500/30 bg-red-500/10";
  };

  const getHookVerdict = (score: number) => {
    if (score >= 85) return "🔥 Viral Potential";
    if (score >= 70) return "👍 Strong Hook";
    if (score >= 50) return "⚡ Needs Curiosity Gap";
    return "😴 High Scroll-by Risk";
  };

  return (
    <div className="bg-slate-900/70 border border-slate-800 rounded-3xl p-6 space-y-6">
      {/* Top Gauge Summary */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Sparkles className="w-4 h-4 text-amber-400" />
            <h3 className="font-bold text-white text-base">Real-Time Caption & Hook Grader</h3>
          </div>
          <p className="text-xs text-slate-400">
            Algorithmic score based on curiosity gap, power words, and mobile readability.
          </p>
        </div>

        <div className="flex items-center gap-4">
          <div className="text-right">
            <span className="text-[11px] font-semibold text-slate-400 block uppercase tracking-wider">
              Hook Verdict
            </span>
            <span className="text-sm font-bold text-white">
              {getHookVerdict(scores.hookScore)}
            </span>
          </div>

          <div
            className={`w-16 h-16 rounded-2xl flex flex-col items-center justify-center border font-bold ${getScoreColor(
              scores.overallScore
            )}`}
          >
            <span className="text-2xl leading-none">{scores.overallScore}</span>
            <span className="text-[10px] uppercase font-mono mt-0.5">/ 100</span>
          </div>
        </div>
      </div>

      {/* Sub-Metrics Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-3">
          <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">
            Hook Power
          </span>
          <div className="flex items-baseline gap-1 mt-1">
            <span className="text-xl font-bold text-white">{scores.hookScore}</span>
            <span className="text-xs text-slate-500">/100</span>
          </div>
          <div className="w-full bg-slate-800 rounded-full h-1.5 mt-2 overflow-hidden">
            <div
              className="bg-indigo-500 h-1.5 rounded-full"
              style={{ width: `${scores.hookScore}%` }}
            ></div>
          </div>
        </div>

        <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-3">
          <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">
            Readability
          </span>
          <div className="flex items-baseline gap-1 mt-1">
            <span className="text-xl font-bold text-white">{scores.readabilityScore}</span>
            <span className="text-xs text-slate-500">/100</span>
          </div>
          <div className="w-full bg-slate-800 rounded-full h-1.5 mt-2 overflow-hidden">
            <div
              className="bg-purple-500 h-1.5 rounded-full"
              style={{ width: `${scores.readabilityScore}%` }}
            ></div>
          </div>
        </div>

        <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-3">
          <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">
            Hashtags
          </span>
          <div className="flex items-baseline gap-1 mt-1">
            <span className="text-xl font-bold text-white">{scores.hashtagScore}</span>
            <span className="text-xs text-slate-500">/100</span>
          </div>
          <div className="w-full bg-slate-800 rounded-full h-1.5 mt-2 overflow-hidden">
            <div
              className="bg-emerald-500 h-1.5 rounded-full"
              style={{ width: `${scores.hashtagScore}%` }}
            ></div>
          </div>
        </div>

        <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-3">
          <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">
            Call To Action
          </span>
          <div className="flex items-baseline gap-1 mt-1">
            <span className="text-xl font-bold text-white">{scores.ctaScore}</span>
            <span className="text-xs text-slate-500">/100</span>
          </div>
          <div className="w-full bg-slate-800 rounded-full h-1.5 mt-2 overflow-hidden">
            <div
              className="bg-sky-500 h-1.5 rounded-full"
              style={{ width: `${scores.ctaScore}%` }}
            ></div>
          </div>
        </div>
      </div>

      {/* Recommendations List */}
      <div className="space-y-2 pt-2">
        <span className="text-xs font-semibold text-slate-300 block">
          Algorithm Optimization Checklist:
        </span>
        <div className="space-y-1.5">
          {recommendations.map((rec, i) => (
            <div
              key={i}
              className={`p-3 rounded-xl border flex items-start gap-2.5 text-xs ${
                rec.type === "PERFECT"
                  ? "bg-emerald-950/30 border-emerald-800/40 text-emerald-300"
                  : rec.type === "CRITICAL"
                  ? "bg-red-950/30 border-red-800/40 text-red-300"
                  : "bg-indigo-950/30 border-indigo-800/40 text-indigo-300"
              }`}
            >
              {rec.type === "PERFECT" ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              ) : rec.type === "CRITICAL" ? (
                <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              ) : (
                <Info className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
              )}
              <span className="leading-relaxed">{rec.text}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
