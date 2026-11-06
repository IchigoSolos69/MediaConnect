"use client";

import { useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Clock,
  Plus,
  Send,
  ExternalLink,
  Sparkles,
  CheckCircle2,
} from "lucide-react";
import { YouTubeIcon, InstagramIcon, XIcon } from "@/components/icons";
import { formatDate } from "@/lib/utils";

interface PostTarget {
  id: string;
  platform: "YOUTUBE" | "INSTAGRAM" | "X";
  status: string;
  liveUrl?: string | null;
}

interface Post {
  id: string;
  title: string | null;
  content: string;
  status: string;
  scheduledAt: string | null;
  publishedAt: string | null;
  seoScore: number | null;
  targets: PostTarget[];
}

interface CalendarViewProps {
  posts: Post[];
  onNewPostDate: (date: Date) => void;
  onPostUpdated?: () => void;
}

export function CalendarView({ posts, onNewPostDate, onPostUpdated }: CalendarViewProps) {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedPost, setSelectedPost] = useState<Post | null>(null);
  const [isPublishingNow, setIsPublishingNow] = useState(false);

  // Month navigation
  const prevMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
  };
  const nextMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
  };
  const today = () => {
    setCurrentDate(new Date());
  };

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const firstDayOfMonth = new Date(year, month, 1).getDay(); // 0 is Sunday
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  // Create calendar cells (pad leading empty slots)
  const daysArray = [];
  for (let i = 0; i < firstDayOfMonth; i++) {
    daysArray.push(null);
  }
  for (let d = 1; d <= daysInMonth; d++) {
    daysArray.push(new Date(year, month, d));
  }

  const monthName = currentDate.toLocaleString("default", { month: "long" });

  const getPostsForDay = (date: Date) => {
    return posts.filter((p) => {
      if (!p.scheduledAt) return false;
      const pDate = new Date(p.scheduledAt);
      return (
        pDate.getFullYear() === date.getFullYear() &&
        pDate.getMonth() === date.getMonth() &&
        pDate.getDate() === date.getDate()
      );
    });
  };

  const handleInstantPublish = async (postId: string) => {
    try {
      setIsPublishingNow(true);
      const res = await fetch(`/api/posts/${postId}/publish`, { method: "POST" });
      const data = await res.json();
      if (data.success) {
        if (onPostUpdated) onPostUpdated();
        setSelectedPost(null);
      }
    } catch (err) {
      console.error("Instant publish error", err);
    } finally {
      setIsPublishingNow(false);
    }
  };

  return (
    <div className="bg-slate-900/70 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
      {/* Calendar Header */}
      <div className="p-6 border-b border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h3 className="text-xl font-bold text-white tracking-tight">
            {monthName} {year}
          </h3>
          <p className="text-xs text-slate-400">
            {posts.length} total posts across all connected channels.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={today}
            className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition"
          >
            Today
          </button>
          <div className="flex items-center bg-slate-950 border border-slate-800 rounded-lg p-0.5">
            <button
              onClick={prevMonth}
              className="p-1.5 text-slate-400 hover:text-white rounded hover:bg-slate-800 transition"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={nextMonth}
              className="p-1.5 text-slate-400 hover:text-white rounded hover:bg-slate-800 transition"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Weekday Labels */}
      <div className="grid grid-cols-7 border-b border-slate-800 bg-slate-950/80 text-center py-2.5 text-xs font-semibold text-slate-400">
        <div>Sun</div>
        <div>Mon</div>
        <div>Tue</div>
        <div>Wed</div>
        <div>Thu</div>
        <div>Fri</div>
        <div>Sat</div>
      </div>

      {/* Days Grid */}
      <div className="grid grid-cols-7 auto-rows-fr bg-slate-950/30">
        {daysArray.map((date, idx) => {
          if (!date) {
            return (
              <div
                key={`empty-${idx}`}
                className="min-h-[120px] p-2 border-b border-r border-slate-800/40 bg-slate-950/20"
              />
            );
          }

          const isToday =
            new Date().toDateString() === date.toDateString();
          const dayPosts = getPostsForDay(date);

          return (
            <div
              key={date.toISOString()}
              className={`min-h-[120px] p-2 border-b border-r border-slate-800/60 relative group flex flex-col justify-between transition hover:bg-slate-900/40 ${
                isToday ? "bg-indigo-950/15" : ""
              }`}
            >
              <div className="flex items-center justify-between">
                <span
                  className={`text-xs font-bold w-6 h-6 rounded-full flex items-center justify-center ${
                    isToday
                      ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/30"
                      : "text-slate-400"
                  }`}
                >
                  {date.getDate()}
                </span>

                <button
                  onClick={() => onNewPostDate(date)}
                  className="opacity-0 group-hover:opacity-100 p-1 text-slate-400 hover:text-white hover:bg-slate-800 rounded transition"
                  title="Schedule post for this day"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Day's Scheduled Posts */}
              <div className="space-y-1.5 mt-2 flex-1 overflow-y-auto max-h-[90px]">
                {dayPosts.map((post) => {
                  const isPublished = post.status === "PUBLISHED";
                  return (
                    <div
                      key={post.id}
                      onClick={() => setSelectedPost(post)}
                      className={`p-1.5 rounded-lg border text-left cursor-pointer transition transform hover:scale-[1.02] shadow-sm ${
                        isPublished
                          ? "bg-emerald-950/30 border-emerald-800/40 hover:border-emerald-700"
                          : "bg-indigo-950/30 border-indigo-800/40 hover:border-indigo-700"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1 mb-1">
                        <div className="flex items-center gap-1">
                          {post.targets.map((t) => (
                            <span key={t.id}>
                              {t.platform === "YOUTUBE" && <YouTubeIcon className="w-3 h-3 text-red-500" />}
                              {t.platform === "INSTAGRAM" && <InstagramIcon className="w-3 h-3 text-pink-500" />}
                              {t.platform === "X" && <XIcon className="w-3 h-3 text-sky-400" />}
                            </span>
                          ))}
                        </div>

                        <span
                          className={`text-[9px] font-bold px-1 rounded uppercase ${
                            isPublished
                              ? "bg-emerald-500/20 text-emerald-400"
                              : "bg-purple-500/20 text-purple-300"
                          }`}
                        >
                          {isPublished ? "Live" : "Queued"}
                        </span>
                      </div>

                      <p className="text-[11px] font-medium text-slate-200 truncate leading-tight">
                        {post.title || post.content}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Post Detail Modal */}
      {selectedPost && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-lg p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <span
                  className={`text-xs font-semibold px-2.5 py-0.5 rounded-full ${
                    selectedPost.status === "PUBLISHED"
                      ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                      : "bg-purple-500/10 text-purple-400 border border-purple-500/20"
                  }`}
                >
                  {selectedPost.status}
                </span>

                {selectedPost.scheduledAt && (
                  <span className="text-xs text-slate-400 flex items-center gap-1 font-mono">
                    <Clock className="w-3 h-3" />
                    {formatDate(selectedPost.scheduledAt)}
                  </span>
                )}
              </div>

              <button
                onClick={() => setSelectedPost(null)}
                className="text-slate-400 hover:text-white text-xs font-semibold"
              >
                Close
              </button>
            </div>

            {selectedPost.title && (
              <h4 className="text-base font-bold text-white">{selectedPost.title}</h4>
            )}

            <p className="text-sm text-slate-300 whitespace-pre-wrap bg-slate-950/60 p-4 rounded-xl border border-slate-800 leading-relaxed max-h-60 overflow-y-auto">
              {selectedPost.content}
            </p>

            {/* Platform Targets with Live URLs */}
            <div className="space-y-2 pt-2">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">
                Target Platform Deliveries:
              </span>
              {selectedPost.targets.map((tgt) => (
                <div
                  key={tgt.id}
                  className="bg-slate-950/80 border border-slate-800 rounded-xl p-3 flex items-center justify-between"
                >
                  <div className="flex items-center gap-2.5">
                    {tgt.platform === "YOUTUBE" && <YouTubeIcon className="w-4 h-4 text-red-500" />}
                    {tgt.platform === "INSTAGRAM" && <InstagramIcon className="w-4 h-4 text-pink-500" />}
                    {tgt.platform === "X" && <XIcon className="w-4 h-4 text-sky-400" />}
                    <span className="text-xs font-medium text-slate-200">{tgt.platform}</span>
                  </div>

                  {tgt.liveUrl ? (
                    <a
                      href={tgt.liveUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs font-semibold text-indigo-400 hover:text-indigo-300 flex items-center gap-1"
                    >
                      <span>View Live Post</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  ) : (
                    <span className="text-[11px] text-slate-500 font-mono">Scheduled</span>
                  )}
                </div>
              ))}
            </div>

            {/* Actions */}
            <div className="pt-4 border-t border-slate-800 flex items-center justify-between">
              {selectedPost.seoScore && (
                <div className="flex items-center gap-1.5 text-xs text-amber-400">
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>SEO Score: {selectedPost.seoScore}/100</span>
                </div>
              )}

              {selectedPost.status === "SCHEDULED" && (
                <button
                  onClick={() => handleInstantPublish(selectedPost.id)}
                  disabled={isPublishingNow}
                  className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold px-4 py-2 rounded-xl transition"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>{isPublishingNow ? "Publishing..." : "Publish Immediately"}</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
