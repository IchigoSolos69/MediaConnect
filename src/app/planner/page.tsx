"use client";

import { useEffect, useState, useCallback } from "react";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { CalendarView } from "@/components/planner/CalendarView";
import { QueueSlotManager } from "@/components/planner/QueueSlotManager";
import { ComposerModal } from "@/components/planner/ComposerModal";
import {
  Calendar,
  Clock,
  Plus,
  Play,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
} from "lucide-react";

export default function PlannerPage() {
  const [activeTab, setActiveTab] = useState<"CALENDAR" | "QUEUE">("CALENDAR");
  const [posts, setPosts] = useState<any[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [queueSlots, setQueueSlots] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Composer Modal State
  const [isComposerOpen, setIsComposerOpen] = useState(false);
  const [composerDate, setComposerDate] = useState<Date | undefined>(undefined);

  // Dispatcher state
  const [dispatchResult, setDispatchResult] = useState<string | null>(null);
  const [isDispatching, setIsDispatching] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const [postsRes, accsRes, slotsRes] = await Promise.all([
        fetch("/api/posts"),
        fetch("/api/accounts"),
        fetch("/api/queue-slots"),
      ]);

      const [postsData, accsData, slotsData] = await Promise.all([
        postsRes.json(),
        accsRes.json(),
        slotsRes.json(),
      ]);

      if (postsData.success) setPosts(postsData.posts);
      if (accsData.success) setAccounts(accsData.accounts);
      if (slotsData.success) setQueueSlots(slotsData.slots);
    } catch (err) {
      console.error("Error loading planner data", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleOpenComposer = (date?: Date) => {
    setComposerDate(date);
    setIsComposerOpen(true);
  };

  const handleTriggerDispatcher = async () => {
    try {
      setIsDispatching(true);
      setDispatchResult(null);
      const res = await fetch("/api/posts/dispatch", { method: "POST" });
      const data = await res.json();
      if (data.success) {
        setDispatchResult(`Processed queue! ${data.dispatchedCount} post(s) dispatched to live status.`);
        await fetchData();
      }
    } catch (err: any) {
      setDispatchResult(`Error: ${err.message}`);
    } finally {
      setIsDispatching(false);
    }
  };

  return (
    <DashboardShell title="Planner & Scheduling Engine">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Top Controls Header */}
        <div className="bg-gradient-to-r from-slate-900 via-indigo-950/40 to-slate-900 border border-slate-800 rounded-3xl p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                Buffer-Style Queue & Calendar
              </span>
              <span className="text-xs text-slate-400">Exact-minute social dispatch</span>
            </div>
            <h2 className="text-2xl font-bold text-white">Visual Content Calendar</h2>
            <p className="text-sm text-slate-400 mt-1 max-w-xl">
              Schedule across YouTube, Instagram, and X in one unified view. Use fixed queue slots for evergreen posting.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Background Dispatcher Trigger Button */}
            <button
              onClick={handleTriggerDispatcher}
              disabled={isDispatching}
              className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold px-4 py-2.5 rounded-xl border border-slate-700 transition"
              title="Manually trigger due queue posts"
            >
              <Play className={`w-3.5 h-3.5 text-emerald-400 ${isDispatching ? "animate-pulse" : ""}`} />
              <span>{isDispatching ? "Checking..." : "Trigger Due Posts"}</span>
            </button>

            <button
              onClick={() => handleOpenComposer()}
              className="flex items-center gap-2 bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white text-xs font-semibold px-5 py-2.5 rounded-xl shadow-lg shadow-indigo-500/25 transition active:scale-95"
            >
              <Plus className="w-4 h-4" />
              <span>Schedule New Post</span>
            </button>
          </div>
        </div>

        {/* Dispatcher Notice */}
        {dispatchResult && (
          <div className="p-4 rounded-2xl bg-indigo-950/40 border border-indigo-800/40 flex items-center justify-between text-xs text-indigo-300 animate-in fade-in">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>{dispatchResult}</span>
            </div>
            <button
              onClick={() => setDispatchResult(null)}
              className="text-slate-400 hover:text-white font-bold"
            >
              ✕
            </button>
          </div>
        )}

        {/* Tab Navigation (Calendar vs Queue Slots) */}
        <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
          <button
            onClick={() => setActiveTab("CALENDAR")}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition ${
              activeTab === "CALENDAR"
                ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/30"
                : "bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800"
            }`}
          >
            <Calendar className="w-4 h-4" />
            <span>Monthly Grid Calendar</span>
          </button>

          <button
            onClick={() => setActiveTab("QUEUE")}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition ${
              activeTab === "QUEUE"
                ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/30"
                : "bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800"
            }`}
          >
            <Clock className="w-4 h-4" />
            <span>Buffer Queue Slots ({queueSlots.length})</span>
          </button>
        </div>

        {/* Main Content Area */}
        {activeTab === "CALENDAR" ? (
          <CalendarView
            posts={posts}
            onNewPostDate={(date) => handleOpenComposer(date)}
            onPostUpdated={fetchData}
          />
        ) : (
          <QueueSlotManager
            slots={queueSlots}
            onSlotAdded={fetchData}
          />
        )}

        {/* Composer Modal */}
        <ComposerModal
          isOpen={isComposerOpen}
          onClose={() => setIsComposerOpen(false)}
          accounts={accounts}
          onPostCreated={fetchData}
          initialDate={composerDate}
        />
      </div>
    </DashboardShell>
  );
}
