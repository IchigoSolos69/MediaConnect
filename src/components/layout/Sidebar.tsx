"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Calendar,
  BarChart3,
  Sparkles,
  Share2,
  LayoutDashboard,
  ShieldCheck,
  Building2,
} from "lucide-react";
import { cn } from "@/lib/utils";

const navigation = [
  { name: "Dashboard", href: "/", icon: LayoutDashboard },
  { name: "Planner & Calendar", href: "/planner", icon: Calendar },
  { name: "Analytics & Insights", href: "/analytics", icon: BarChart3 },
  { name: "Social SEO Studio", href: "/seo-studio", icon: Sparkles },
  { name: "Connected Channels", href: "/channels", icon: Share2 },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-64 border-r border-slate-800 bg-slate-950 flex flex-col shrink-0 min-h-screen">
      {/* Brand Header */}
      <div className="h-16 flex items-center px-6 border-b border-slate-800 gap-3">
        <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-500 via-purple-500 to-pink-500 flex items-center justify-center text-white shadow-lg shadow-indigo-500/25">
          <Share2 className="w-5 h-5" />
        </div>
        <div>
          <span className="font-bold text-base tracking-tight text-white block">MediaConnect</span>
          <span className="text-[11px] font-medium text-indigo-400 block -mt-0.5">Buffer + Metricool Hub</span>
        </div>
      </div>

      {/* Workspace Brand Card */}
      <div className="p-4 border-b border-slate-800/80">
        <div className="bg-slate-900/80 rounded-xl p-3 border border-slate-800 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400 font-bold">
            <Building2 className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-white truncate block">Acme Media</span>
              <span className="text-[10px] bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 px-1.5 py-0.5 rounded font-mono">Brand</span>
            </div>
            <span className="text-xs text-slate-400 truncate block">3 Channels Active</span>
          </div>
        </div>
      </div>

      {/* Navigation Links */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        {navigation.map((item) => {
          const isActive = pathname === item.href;
          const Icon = item.icon;
          return (
            <Link
              key={item.name}
              href={item.href}
              className={cn(
                "flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 group",
                isActive
                  ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/30"
                  : "text-slate-400 hover:text-slate-200 hover:bg-slate-900"
              )}
            >
              <Icon
                className={cn(
                  "w-4 h-4 transition-colors",
                  isActive ? "text-white" : "text-slate-400 group-hover:text-slate-200"
                )}
              />
              <span>{item.name}</span>
            </Link>
          );
        })}
      </nav>

      {/* Free Tier / Mock Sandbox Status Indicator */}
      <div className="p-4 border-t border-slate-800/80">
        <div className="rounded-xl bg-emerald-950/40 border border-emerald-800/40 p-3">
          <div className="flex items-center gap-2 mb-1">
            <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
            <span className="text-xs font-semibold text-emerald-300">Mock Sandbox Active</span>
          </div>
          <p className="text-[11px] text-slate-400 leading-relaxed">
            100% Free local environment. All YouTube, Instagram, and X APIs are simulated without rate limits.
          </p>
        </div>
      </div>
    </aside>
  );
}
