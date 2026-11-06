"use client";

import { useState } from "react";
import { Clock, Plus, Trash2, Calendar } from "lucide-react";

interface QueueSlot {
  id: string;
  dayOfWeek: number;
  time: string;
  isActive: boolean;
}

interface QueueSlotManagerProps {
  slots: QueueSlot[];
  onSlotAdded?: () => void;
  onSlotDeleted?: () => void;
}

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function QueueSlotManager({ slots, onSlotAdded }: QueueSlotManagerProps) {
  const [selectedDay, setSelectedDay] = useState(1); // Monday
  const [newTime, setNewTime] = useState("09:00");
  const [isAdding, setIsAdding] = useState(false);

  const handleAddSlot = async () => {
    try {
      setIsAdding(true);
      const res = await fetch("/api/queue-slots", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dayOfWeek: selectedDay,
          time: newTime,
        }),
      });
      const data = await res.json();
      if (data.success && onSlotAdded) {
        onSlotAdded();
      }
    } catch (err) {
      console.error("Failed to add queue slot", err);
    } finally {
      setIsAdding(false);
    }
  };

  return (
    <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Clock className="w-4 h-4 text-indigo-400" />
            <h3 className="font-semibold text-white text-base">Buffer-Style Posting Schedule</h3>
          </div>
          <p className="text-xs text-slate-400">
            Automate publishing by defining recurring daily slots. Dropping content into &quot;Queue&quot; auto-fills the next slot.
          </p>
        </div>
      </div>

      {/* Add Slot Control */}
      <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-3.5 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-slate-400" />
          <select
            value={selectedDay}
            onChange={(e) => setSelectedDay(Number(e.target.value))}
            className="bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500"
          >
            {DAYS.map((day, idx) => (
              <option key={day} value={idx}>
                {day}
              </option>
            ))}
          </select>
        </div>

        <input
          type="time"
          value={newTime}
          onChange={(e) => setNewTime(e.target.value)}
          className="bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500"
        />

        <button
          onClick={handleAddSlot}
          disabled={isAdding}
          className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold px-3.5 py-1.5 rounded-lg transition ml-auto"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Add Slot</span>
        </button>
      </div>

      {/* Slots List by Day */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-7 gap-3">
        {DAYS.map((dayName, dayIndex) => {
          const daySlots = slots.filter((s) => s.dayOfWeek === dayIndex);
          return (
            <div
              key={dayName}
              className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-3 flex flex-col justify-between"
            >
              <div className="border-b border-slate-800 pb-2 mb-2 flex items-center justify-between">
                <span className="text-xs font-bold text-slate-300">{dayName.slice(0, 3)}</span>
                <span className="text-[10px] text-slate-500 font-mono">{daySlots.length} slots</span>
              </div>

              <div className="space-y-1.5 min-h-[60px]">
                {daySlots.length > 0 ? (
                  daySlots.map((slot) => (
                    <div
                      key={slot.id}
                      className="bg-indigo-950/40 border border-indigo-500/20 rounded-md px-2 py-1 text-[11px] font-mono font-medium text-indigo-300 flex items-center justify-between"
                    >
                      <span>{slot.time}</span>
                    </div>
                  ))
                ) : (
                  <span className="text-[10px] text-slate-600 italic block pt-3 text-center">
                    No slots
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
