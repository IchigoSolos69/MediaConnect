import Link from "next/link";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { db } from "@/lib/db";
import {
  Users,
  Calendar,
  Sparkles,
  TrendingUp,
  ArrowUpRight,
  Clock,
  ChevronRight,
  CheckCircle2,
} from "lucide-react";
import { YouTubeIcon, InstagramIcon, XIcon } from "@/components/icons";
import { formatNumber, formatDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const workspace = await db.workspace.findFirst({
    include: {
      accounts: true,
      posts: {
        include: {
          targets: true,
        },
        orderBy: { scheduledAt: "asc" },
      },
    },
  });

  const accounts = workspace?.accounts || [];
  const posts = workspace?.posts || [];

  const totalFollowers = accounts.reduce((sum, a) => sum + a.followersCount, 0);
  const scheduledPosts = posts.filter((p) => p.status === "SCHEDULED");
  const publishedPosts = posts.filter((p) => p.status === "PUBLISHED");

  return (
    <DashboardShell title="Executive Overview">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Welcome & Highlights Banner */}
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-indigo-900/60 via-slate-900 to-purple-950/40 border border-slate-800 p-8 shadow-2xl">
          <div className="absolute top-0 right-0 -mr-16 -mt-16 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none"></div>
          
          <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                  {workspace?.name || "Acme Media"} Brand Hub
                </span>
                <span className="text-xs text-slate-400">Multi-Channel Operations</span>
              </div>
              <h2 className="text-2xl md:text-3xl font-bold text-white tracking-tight">
                Social Performance & Planning
              </h2>
              <p className="text-slate-300 text-sm mt-1 max-w-xl leading-relaxed">
                Buffer-style multi-channel publishing with Metricool deep analytics and real-time caption SEO suggestions.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Link
                href="/planner?action=new"
                className="flex items-center gap-2 bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white text-sm font-semibold px-5 py-2.5 rounded-xl shadow-lg shadow-indigo-500/25 transition active:scale-95"
              >
                <Calendar className="w-4 h-4" />
                <span>Open Planner</span>
              </Link>
              <Link
                href="/seo-studio"
                className="flex items-center gap-2 bg-slate-800/80 hover:bg-slate-800 text-slate-200 text-sm font-medium px-4 py-2.5 rounded-xl border border-slate-700 transition"
              >
                <Sparkles className="w-4 h-4 text-purple-400" />
                <span>SEO Studio</span>
              </Link>
            </div>
          </div>
        </div>

        {/* Top-line KPI Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-5 hover:border-slate-700 transition">
            <div className="flex items-center justify-between text-slate-400 mb-3">
              <span className="text-xs font-medium uppercase tracking-wider">Total Audience</span>
              <div className="w-8 h-8 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
                <Users className="w-4 h-4" />
              </div>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold text-white tracking-tight">
                {formatNumber(totalFollowers)}
              </span>
              <span className="text-xs font-semibold text-emerald-400 flex items-center">
                <ArrowUpRight className="w-3.5 h-3.5" />
                +3.6K this week
              </span>
            </div>
            <span className="text-[11px] text-slate-500 block mt-1">Across 3 connected channels</span>
          </div>

          <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-5 hover:border-slate-700 transition">
            <div className="flex items-center justify-between text-slate-400 mb-3">
              <span className="text-xs font-medium uppercase tracking-wider">Scheduled Posts</span>
              <div className="w-8 h-8 rounded-lg bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400">
                <Calendar className="w-4 h-4" />
              </div>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold text-white tracking-tight">
                {scheduledPosts.length}
              </span>
              <span className="text-xs text-slate-400">in queue</span>
            </div>
            <span className="text-[11px] text-slate-500 block mt-1">Next post drops tomorrow</span>
          </div>

          <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-5 hover:border-slate-700 transition">
            <div className="flex items-center justify-between text-slate-400 mb-3">
              <span className="text-xs font-medium uppercase tracking-wider">Average Engagement</span>
              <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
                <TrendingUp className="w-4 h-4" />
              </div>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold text-white tracking-tight">
                6.8%
              </span>
              <span className="text-xs font-semibold text-emerald-400 flex items-center">
                <ArrowUpRight className="w-3.5 h-3.5" />
                +0.8%
              </span>
            </div>
            <span className="text-[11px] text-slate-500 block mt-1">Top tier vs industry benchmark</span>
          </div>

          <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-5 hover:border-slate-700 transition">
            <div className="flex items-center justify-between text-slate-400 mb-3">
              <span className="text-xs font-medium uppercase tracking-wider">Published Posts</span>
              <div className="w-8 h-8 rounded-lg bg-sky-500/10 border border-sky-500/20 flex items-center justify-center text-sky-400">
                <CheckCircle2 className="w-4 h-4" />
              </div>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold text-white tracking-tight">
                {publishedPosts.length}
              </span>
              <span className="text-xs text-emerald-400 font-medium">100% success rate</span>
            </div>
            <span className="text-[11px] text-slate-500 block mt-1">Simulated live URLs active</span>
          </div>
        </div>

        {/* Channels Health & Peak Hours Section */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Connected Channels Summary */}
          <div className="lg:col-span-2 bg-slate-900/70 border border-slate-800 rounded-2xl p-6">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h3 className="font-semibold text-white text-base">Channel Status & Health</h3>
                <p className="text-xs text-slate-400">Monitored accounts for Acme Media</p>
              </div>
              <Link
                href="/channels"
                className="text-xs font-medium text-indigo-400 hover:text-indigo-300 flex items-center gap-1 transition"
              >
                <span>Manage Channels</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </Link>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {accounts.map((acc) => {
                const isYt = acc.platform === "YOUTUBE";
                const isIg = acc.platform === "INSTAGRAM";

                return (
                  <div
                    key={acc.id}
                    className="bg-slate-950/70 rounded-xl p-4 border border-slate-800/80 flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <div
                          className={`w-8 h-8 rounded-lg flex items-center justify-center border ${
                            isYt
                              ? "bg-red-500/10 border-red-500/20 text-red-500"
                              : isIg
                              ? "bg-pink-500/10 border-pink-500/20 text-pink-500"
                              : "bg-sky-500/10 border-sky-500/20 text-sky-400"
                          }`}
                        >
                          {isYt && <YouTubeIcon className="w-4 h-4" />}
                          {isIg && <InstagramIcon className="w-4 h-4" />}
                          {!isYt && !isIg && <XIcon className="w-4 h-4" />}
                        </div>

                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded-full">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                          <span>Active</span>
                        </span>
                      </div>

                      <span className="text-sm font-semibold text-white block truncate">
                        {acc.displayName}
                      </span>
                      <span className="text-xs text-slate-400 font-mono block">
                        {acc.username}
                      </span>
                    </div>

                    <div className="mt-4 pt-3 border-t border-slate-800 flex items-center justify-between">
                      <span className="text-xs text-slate-400">Audience:</span>
                      <span className="text-sm font-bold text-white">
                        {formatNumber(acc.followersCount)}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Metricool "Best Time to Post Today" Smart Card */}
          <div className="bg-gradient-to-br from-slate-900 via-indigo-950/30 to-slate-900 border border-slate-800 rounded-2xl p-6 flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Sparkles className="w-4 h-4 text-purple-400" />
                <span className="text-xs font-semibold text-purple-300 uppercase tracking-wide">
                  Smart Timing Advisor
                </span>
              </div>
              <h3 className="font-semibold text-white text-base">Peak Audience Hours</h3>
              <p className="text-xs text-slate-400 mt-1">
                Calculated from 168-cell audience activity density:
              </p>

              <div className="mt-4 space-y-3">
                <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-3 flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <YouTubeIcon className="w-4 h-4 text-red-500" />
                    <span className="text-xs text-slate-300">YouTube</span>
                  </div>
                  <span className="text-xs font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                    6:00 PM (88% Peak)
                  </span>
                </div>

                <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-3 flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <InstagramIcon className="w-4 h-4 text-pink-500" />
                    <span className="text-xs text-slate-300">Instagram</span>
                  </div>
                  <span className="text-xs font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                    7:00 PM (94% Peak)
                  </span>
                </div>

                <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-3 flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <XIcon className="w-4 h-4 text-sky-400" />
                    <span className="text-xs text-slate-300">X (Twitter)</span>
                  </div>
                  <span className="text-xs font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                    2:00 PM (91% Peak)
                  </span>
                </div>
              </div>
            </div>

            <Link
              href="/analytics"
              className="mt-4 block text-center text-xs font-semibold text-indigo-400 hover:text-indigo-300 py-2 rounded-lg bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/20 transition"
            >
              Inspect 24x7 Heatmap →
            </Link>
          </div>
        </div>

        {/* Upcoming Posts Preview */}
        <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-6">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h3 className="font-semibold text-white text-base">Content Pipeline & Scheduled Posts</h3>
              <p className="text-xs text-slate-400">Queue items awaiting dispatch</p>
            </div>

            <Link
              href="/planner"
              className="text-xs font-medium text-indigo-400 hover:text-indigo-300 flex items-center gap-1 transition"
            >
              <span>View Full Calendar</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          <div className="space-y-3">
            {posts.map((post) => (
              <div
                key={post.id}
                className="bg-slate-950/70 border border-slate-800/80 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:border-slate-700 transition"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1.5">
                    <span
                      className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                        post.status === "PUBLISHED"
                          ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                          : "bg-purple-500/10 text-purple-400 border border-purple-500/20"
                      }`}
                    >
                      {post.status}
                    </span>

                    {post.scheduledAt && (
                      <span className="text-xs text-slate-400 flex items-center gap-1 font-mono">
                        <Clock className="w-3 h-3 text-slate-500" />
                        {formatDate(post.scheduledAt)}
                      </span>
                    )}

                    {post.seoScore && (
                      <span className="text-[11px] font-medium text-amber-400 bg-amber-500/10 border border-amber-500/20 px-1.5 py-0.2 rounded">
                        SEO: {post.seoScore}/100
                      </span>
                    )}
                  </div>

                  <h4 className="text-sm font-semibold text-white truncate">
                    {post.title || post.content.substring(0, 70) + "..."}
                  </h4>
                  <p className="text-xs text-slate-400 line-clamp-1 mt-0.5">
                    {post.content}
                  </p>
                </div>

                {/* Target Channel Icons */}
                <div className="flex items-center gap-2 shrink-0">
                  {post.targets.map((tgt) => (
                    <div
                      key={tgt.id}
                      className="w-7 h-7 rounded-lg bg-slate-900 border border-slate-800 flex items-center justify-center text-slate-400"
                      title={tgt.platform}
                    >
                      {tgt.platform === "YOUTUBE" && <YouTubeIcon className="w-3.5 h-3.5 text-red-500" />}
                      {tgt.platform === "INSTAGRAM" && <InstagramIcon className="w-3.5 h-3.5 text-pink-500" />}
                      {tgt.platform === "X" && <XIcon className="w-3.5 h-3.5 text-sky-400" />}
                    </div>
                  ))}

                  <Link
                    href={`/planner?post=${post.id}`}
                    className="text-xs font-semibold text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 px-3 py-1.5 rounded-lg border border-slate-700 transition"
                  >
                    Details
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </DashboardShell>
  );
}
