"use client";

import { useState } from "react";
import {
  X,
  Sparkles,
  Calendar,
  Clock,
  Send,
  Image as ImageIcon,
  Check,
  AlertTriangle,
} from "lucide-react";
import { YouTubeIcon, InstagramIcon, XIcon } from "@/components/icons";

interface Account {
  id: string;
  platform: "YOUTUBE" | "INSTAGRAM" | "X";
  username: string;
  displayName: string;
  avatarUrl: string | null;
  followersCount: number;
}

interface ComposerModalProps {
  isOpen: boolean;
  onClose: () => void;
  accounts: Account[];
  onPostCreated?: () => void;
  initialDate?: Date;
}

export function ComposerModal({
  isOpen,
  onClose,
  accounts,
  onPostCreated,
  initialDate,
}: ComposerModalProps) {
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>(["X", "INSTAGRAM"]);
  const [activeTab, setActiveTab] = useState<string>("BASE");
  const [content, setContent] = useState("");
  const [mediaUrl, setMediaUrl] = useState("");
  const [title, setTitle] = useState("");

  // Platform-specific fields
  const [ytTitle, setYtTitle] = useState("");
  const [ytTags, setYtTags] = useState("");
  const [igFirstComment, setIgFirstComment] = useState("");
  const [customCaptions, setCustomCaptions] = useState<Record<string, string>>({});

  // Scheduling options
  const [scheduleMode, setScheduleMode] = useState<"NOW" | "SCHEDULE" | "QUEUE" | "DRAFT">("SCHEDULE");
  const [scheduledDateTime, setScheduledDateTime] = useState<string>(
    initialDate
      ? new Date(initialDate.getTime() - initialDate.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
      : new Date(Date.now() + 3600000 - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16)
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  if (!isOpen) return null;

  const togglePlatform = (platform: string) => {
    if (selectedPlatforms.includes(platform)) {
      if (selectedPlatforms.length > 1) {
        setSelectedPlatforms(selectedPlatforms.filter((p) => p !== platform));
      }
    } else {
      setSelectedPlatforms([...selectedPlatforms, platform]);
    }
  };

  const getCharCount = (platform: string) => {
    const text = customCaptions[platform] || content;
    return text.length;
  };

  const getCharLimit = (platform: string) => {
    if (platform === "X") return 280;
    if (platform === "INSTAGRAM") return 2200;
    return 5000;
  };

  const isOverLimit = (platform: string) => {
    return getCharCount(platform) > getCharLimit(platform);
  };

  const handleSubmit = async () => {
    try {
      setIsSubmitting(true);
      setErrorMessage("");

      const targets = selectedPlatforms.map((platform) => {
        const account = accounts.find((a) => a.platform === platform);
        return {
          accountId: account?.id,
          platform,
          customContent: customCaptions[platform] || null,
          firstComment: platform === "INSTAGRAM" ? igFirstComment : null,
          videoTitle: platform === "YOUTUBE" ? (ytTitle || title) : null,
          videoTags: platform === "YOUTUBE" ? ytTags : null,
        };
      });

      const res = await fetch("/api/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title || ytTitle || null,
          content,
          mediaUrls: mediaUrl ? [mediaUrl] : [],
          scheduleMode,
          scheduledDate: scheduledDateTime,
          targets,
          seoScore: 85,
          hookScore: 90,
        }),
      });

      const data = await res.json();
      if (!data.success) {
        throw new Error(data.error || "Failed to create post");
      }

      if (onPostCreated) onPostCreated();
      onClose();
    } catch (err: any) {
      setErrorMessage(err.message || "Failed to submit post");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-3xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-6 border-b border-slate-800 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-white">Compose Multi-Channel Post</h2>
            <p className="text-xs text-slate-400">Craft once, customize per network, and schedule.</p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Channel Selector Bar */}
        <div className="px-6 py-3 bg-slate-950/60 border-b border-slate-800 flex flex-wrap items-center gap-3">
          <span className="text-xs font-medium text-slate-400">Target Channels:</span>
          {["YOUTUBE", "INSTAGRAM", "X"].map((plat) => {
            const isSelected = selectedPlatforms.includes(plat);
            const account = accounts.find((a) => a.platform === plat);
            return (
              <button
                key={plat}
                type="button"
                onClick={() => togglePlatform(plat)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold border transition ${
                  isSelected
                    ? plat === "YOUTUBE"
                      ? "bg-red-500/20 text-red-300 border-red-500/40"
                      : plat === "INSTAGRAM"
                      ? "bg-pink-500/20 text-pink-300 border-pink-500/40"
                      : "bg-sky-500/20 text-sky-300 border-sky-500/40"
                    : "bg-slate-900 text-slate-500 border-slate-800 hover:text-slate-400"
                }`}
              >
                {plat === "YOUTUBE" && <YouTubeIcon className="w-3.5 h-3.5" />}
                {plat === "INSTAGRAM" && <InstagramIcon className="w-3.5 h-3.5" />}
                {plat === "X" && <XIcon className="w-3.5 h-3.5" />}
                <span>{account?.displayName || plat}</span>
                {isSelected && <Check className="w-3 h-3 ml-0.5" />}
              </button>
            );
          })}
        </div>

        {/* Platform Tab Navigation */}
        <div className="flex border-b border-slate-800 px-6 bg-slate-900/50">
          <button
            onClick={() => setActiveTab("BASE")}
            className={`py-3 px-4 text-xs font-semibold border-b-2 transition ${
              activeTab === "BASE"
                ? "border-indigo-500 text-white"
                : "border-transparent text-slate-400 hover:text-slate-300"
            }`}
          >
            Base Content
          </button>
          {selectedPlatforms.map((plat) => (
            <button
              key={plat}
              onClick={() => setActiveTab(plat)}
              className={`py-3 px-4 text-xs font-semibold border-b-2 flex items-center gap-1.5 transition ${
                activeTab === plat
                  ? "border-indigo-500 text-white"
                  : "border-transparent text-slate-400 hover:text-slate-300"
              }`}
            >
              {plat === "YOUTUBE" && <YouTubeIcon className="w-3 h-3 text-red-500" />}
              {plat === "INSTAGRAM" && <InstagramIcon className="w-3 h-3 text-pink-500" />}
              {plat === "X" && <XIcon className="w-3 h-3 text-sky-400" />}
              <span>{plat} Override</span>
              {isOverLimit(plat) && <AlertTriangle className="w-3 h-3 text-red-400" />}
            </button>
          ))}
        </div>

        {/* Composer Body */}
        <div className="p-6 overflow-y-auto space-y-4 flex-1">
          {activeTab === "BASE" ? (
            <>
              {/* Optional Post Title */}
              <div>
                <label className="text-xs font-medium text-slate-400 block mb-1">
                  Internal Title / Headline (Optional)
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Weekly Product Teaser #4"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              {/* Main Content Area */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-medium text-slate-400">Post Copy</label>
                  <span className="text-xs text-slate-500 font-mono">{content.length} chars</span>
                </div>
                <textarea
                  rows={5}
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder="What would you like to share? Write your hook, story, and call-to-action here..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-4 text-sm text-white focus:outline-none focus:border-indigo-500 leading-relaxed resize-none"
                />
              </div>

              {/* Media URL Attachment */}
              <div>
                <label className="text-xs font-medium text-slate-400 block mb-1">
                  Image or Video URL
                </label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <ImageIcon className="w-4 h-4 text-slate-500 absolute left-3.5 top-3" />
                    <input
                      type="url"
                      value={mediaUrl}
                      onChange={(e) => setMediaUrl(e.target.value)}
                      placeholder="https://images.unsplash.com/photo-..."
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-4 py-2.5 text-xs text-white focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                </div>
                {mediaUrl && (
                  <div className="mt-2 relative w-32 h-20 rounded-lg overflow-hidden border border-slate-800">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={mediaUrl} alt="Preview" className="w-full h-full object-cover" />
                  </div>
                )}
              </div>
            </>
          ) : activeTab === "YOUTUBE" ? (
            <div className="space-y-4">
              <div>
                <label className="text-xs font-medium text-slate-400 block mb-1">
                  YouTube Video Title
                </label>
                <input
                  type="text"
                  value={ytTitle}
                  onChange={(e) => setYtTitle(e.target.value)}
                  placeholder={title || "Catchy YouTube Video Title..."}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2 text-sm text-white focus:outline-none focus:border-red-500"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-slate-400 block mb-1">
                  YouTube Description (Overrides base caption if filled)
                </label>
                <textarea
                  rows={4}
                  value={customCaptions["YOUTUBE"] || ""}
                  onChange={(e) =>
                    setCustomCaptions({ ...customCaptions, YOUTUBE: e.target.value })
                  }
                  placeholder={content || "Custom description for YouTube..."}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm text-white focus:outline-none focus:border-red-500 resize-none"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-slate-400 block mb-1">
                  Video Tags (Comma separated)
                </label>
                <input
                  type="text"
                  value={ytTags}
                  onChange={(e) => setYtTags(e.target.value)}
                  placeholder="social media, buffer, metricool, seo, growth"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2 text-xs text-white focus:outline-none focus:border-red-500"
                />
              </div>
            </div>
          ) : activeTab === "INSTAGRAM" ? (
            <div className="space-y-4">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-medium text-slate-400">Instagram Caption</label>
                  <span className="text-xs text-slate-500 font-mono">
                    {getCharCount("INSTAGRAM")} / 2,200 chars
                  </span>
                </div>
                <textarea
                  rows={4}
                  value={customCaptions["INSTAGRAM"] || ""}
                  onChange={(e) =>
                    setCustomCaptions({ ...customCaptions, INSTAGRAM: e.target.value })
                  }
                  placeholder={content || "Custom caption for Instagram feed/reel..."}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm text-white focus:outline-none focus:border-pink-500 resize-none"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-slate-400 block mb-1">
                  First Comment (Ideal for burying hashtags)
                </label>
                <input
                  type="text"
                  value={igFirstComment}
                  onChange={(e) => setIgFirstComment(e.target.value)}
                  placeholder="#CreatorEconomy #DigitalMarketing #ViralTips"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2 text-xs text-white focus:outline-none focus:border-pink-500"
                />
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-medium text-slate-400">X (Twitter) Tweet Text</label>
                  <span
                    className={`text-xs font-mono font-bold ${
                      isOverLimit("X") ? "text-red-400" : "text-emerald-400"
                    }`}
                  >
                    {getCharCount("X")} / 280
                  </span>
                </div>
                <textarea
                  rows={4}
                  value={customCaptions["X"] || ""}
                  onChange={(e) =>
                    setCustomCaptions({ ...customCaptions, X: e.target.value })
                  }
                  placeholder={content || "Custom tweet copy..."}
                  className={`w-full bg-slate-950 border rounded-xl p-3 text-sm text-white focus:outline-none resize-none ${
                    isOverLimit("X") ? "border-red-500" : "border-slate-800 focus:border-sky-400"
                  }`}
                />
                {isOverLimit("X") && (
                  <p className="text-xs text-red-400 mt-1 flex items-center gap-1">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    Exceeds 280-character limit by {getCharCount("X") - 280} chars!
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Scheduling Mode Selection */}
          <div className="pt-4 border-t border-slate-800">
            <label className="text-xs font-medium text-slate-400 block mb-2">Publishing Strategy</label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <button
                type="button"
                onClick={() => setScheduleMode("SCHEDULE")}
                className={`flex items-center gap-2 p-3 rounded-xl border text-xs font-semibold transition ${
                  scheduleMode === "SCHEDULE"
                    ? "bg-indigo-600/20 text-indigo-300 border-indigo-500/50"
                    : "bg-slate-950 text-slate-400 border-slate-800 hover:text-white"
                }`}
              >
                <Calendar className="w-4 h-4" />
                <span>Custom Date & Time</span>
              </button>

              <button
                type="button"
                onClick={() => setScheduleMode("QUEUE")}
                className={`flex items-center gap-2 p-3 rounded-xl border text-xs font-semibold transition ${
                  scheduleMode === "QUEUE"
                    ? "bg-indigo-600/20 text-indigo-300 border-indigo-500/50"
                    : "bg-slate-950 text-slate-400 border-slate-800 hover:text-white"
                }`}
              >
                <Clock className="w-4 h-4" />
                <span>Add to Next Queue Slot</span>
              </button>

              <button
                type="button"
                onClick={() => setScheduleMode("NOW")}
                className={`flex items-center gap-2 p-3 rounded-xl border text-xs font-semibold transition ${
                  scheduleMode === "NOW"
                    ? "bg-emerald-600/20 text-emerald-300 border-emerald-500/50"
                    : "bg-slate-950 text-slate-400 border-slate-800 hover:text-white"
                }`}
              >
                <Send className="w-4 h-4" />
                <span>Publish Immediately</span>
              </button>
            </div>

            {scheduleMode === "SCHEDULE" && (
              <div className="mt-3">
                <input
                  type="datetime-local"
                  value={scheduledDateTime}
                  onChange={(e) => setScheduledDateTime(e.target.value)}
                  className="bg-slate-950 border border-slate-800 rounded-xl px-4 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                />
              </div>
            )}
          </div>

          {errorMessage && (
            <div className="p-3 rounded-xl bg-red-950/40 border border-red-800/40 text-xs text-red-400">
              {errorMessage}
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-6 border-t border-slate-800 bg-slate-950/70 flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <Sparkles className="w-3.5 h-3.5 text-purple-400" />
            <span>SEO Hook Grader: Ready</span>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              className="text-xs font-medium text-slate-400 hover:text-white px-4 py-2 transition"
            >
              Cancel
            </button>

            <button
              type="button"
              onClick={handleSubmit}
              disabled={isSubmitting || !content || selectedPlatforms.some(isOverLimit)}
              className="flex items-center gap-2 bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 disabled:opacity-50 text-white text-xs font-semibold px-5 py-2.5 rounded-xl shadow-lg shadow-indigo-500/25 transition active:scale-95"
            >
              <Send className="w-3.5 h-3.5" />
              <span>
                {isSubmitting
                  ? "Publishing..."
                  : scheduleMode === "NOW"
                  ? "Publish Now"
                  : scheduleMode === "QUEUE"
                  ? "Add to Queue"
                  : "Schedule Post"}
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
