"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { PlusCircle, LogOut } from "lucide-react";
import { YouTubeIcon, InstagramIcon, XIcon } from "@/components/icons";

interface TopBarProps {
  title?: string;
}

interface UserSessionInfo {
  name: string;
  email: string;
  role: string;
  workspaceName: string;
}

export function TopBar({ title }: TopBarProps) {
  const [session, setSession] = useState<UserSessionInfo | null>(null);

  useEffect(() => {
    fetch("/api/auth/session")
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.session) {
          setSession({
            name: data.session.name,
            email: data.session.email,
            role: data.session.activeWorkspace.role,
            workspaceName: data.session.activeWorkspace.name,
          });
        }
      })
      .catch(() => {});
  }, []);

  const handleLogout = async () => {
    await fetch("/api/auth/session", { method: "POST" });
    window.location.href = "/login";
  };

  return (
    <header className="h-16 border-b border-slate-800 bg-slate-950/70 backdrop-blur-md px-8 flex items-center justify-between shrink-0 sticky top-0 z-20">
      <div>
        <h1 className="text-lg font-semibold text-white tracking-tight">
          {title || "Dashboard Overview"}
        </h1>
      </div>

      <div className="flex items-center gap-4">
        {/* Connected Channels Pill Indicators */}
        <div className="hidden md:flex items-center gap-2 bg-slate-900 border border-slate-800 rounded-full px-3 py-1.5 text-xs text-slate-300">
          <span className="text-[11px] font-medium text-slate-400 mr-1">Channels:</span>
          
          <div className="flex items-center gap-1.5 text-red-500">
            <YouTubeIcon className="w-3.5 h-3.5" />
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
          </div>

          <div className="w-px h-3 bg-slate-800"></div>

          <div className="flex items-center gap-1.5 text-pink-500">
            <InstagramIcon className="w-3.5 h-3.5" />
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
          </div>

          <div className="w-px h-3 bg-slate-800"></div>

          <div className="flex items-center gap-1.5 text-sky-400">
            <XIcon className="w-3.5 h-3.5" />
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
          </div>
        </div>

        {/* Primary Action Button */}
        <Link
          href="/planner?action=new"
          className="flex items-center gap-2 bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white text-xs font-semibold px-4 py-2 rounded-lg shadow-md shadow-indigo-500/20 transition-all transform active:scale-95"
        >
          <PlusCircle className="w-4 h-4" />
          <span>New Post</span>
        </Link>

        {/* User Profile Pill & Role Badge */}
        <div className="flex items-center gap-2.5 pl-2 border-l border-slate-800">
          <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-purple-500 to-indigo-500 border border-indigo-400/30 flex items-center justify-center text-xs font-bold text-white shadow-inner">
            {session ? session.name[0] : "A"}
          </div>
          <div className="hidden lg:block text-left">
            <span className="text-xs font-medium text-white block leading-none">
              {session ? session.name : "Alice Owner"}
            </span>
            <span className="text-[10px] text-indigo-400 font-mono block leading-tight mt-0.5">
              {session ? `${session.role}` : "OWNER"}
            </span>
          </div>

          {/* Switch User / Logout button */}
          <Link
            href="/login"
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition ml-1"
            title="Switch User / Login"
          >
            <LogOut className="w-4 h-4" />
          </Link>
        </div>
      </div>
    </header>
  );
}
