"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Share2, Lock, Mail, ShieldCheck, CheckCircle2, AlertCircle } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("owner@mediaconnect.app");
  const [password, setPassword] = useState("Password123!");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLogin = async (e?: React.FormEvent, customEmail?: string, customPass?: string) => {
    if (e) e.preventDefault();
    try {
      setLoading(true);
      setError(null);

      const loginEmail = customEmail || email;
      const loginPass = customPass || password;

      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: loginEmail, password: loginPass }),
      });

      const data = await res.json();
      if (!data.success) {
        throw new Error(data.error || "Login failed");
      }

      router.push("/");
      router.refresh();
    } catch (err: any) {
      setError(err.message || "Failed to sign in");
    } finally {
      setLoading(false);
    }
  };

  const handleQuickLogin = (quickEmail: string) => {
    setEmail(quickEmail);
    setPassword("Password123!");
    handleLogin(undefined, quickEmail, "Password123!");
  };

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col justify-center items-center p-6 text-slate-100 font-sans">
      <div className="w-full max-w-md space-y-6">
        {/* Brand Header */}
        <div className="text-center space-y-2">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-indigo-500 via-purple-500 to-pink-500 flex items-center justify-center text-white mx-auto shadow-xl shadow-indigo-500/25">
            <Share2 className="w-6 h-6" />
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">MediaConnect Security</h1>
          <p className="text-xs text-slate-400">
            Sign in to access your workspace. Protected by AES-256-GCM token encryption and RBAC.
          </p>
        </div>

        {/* Login Box */}
        <div className="bg-slate-900/80 border border-slate-800 rounded-3xl p-8 shadow-2xl space-y-6 backdrop-blur-md">
          {error && (
            <div className="p-3.5 rounded-xl bg-red-950/40 border border-red-800/40 text-xs text-red-300 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1.5">
                Work Email
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-500 absolute left-3.5 top-3" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  placeholder="name@company.com"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-4 py-2.5 text-xs text-white focus:outline-none focus:border-indigo-500 font-mono"
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1.5">
                Password
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-500 absolute left-3.5 top-3" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  placeholder="••••••••••••"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-4 py-2.5 text-xs text-white focus:outline-none focus:border-indigo-500 font-mono"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-bold py-3 rounded-xl shadow-lg shadow-indigo-600/30 transition active:scale-98"
            >
              {loading ? "Authenticating..." : "Sign In to Workspace"}
            </button>
          </form>

          {/* Quick 1-Click Role Login Selector */}
          <div className="pt-4 border-t border-slate-800 space-y-3">
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block text-center">
              Quick Role Test Logins:
            </span>

            <div className="grid grid-cols-1 gap-2">
              <button
                type="button"
                onClick={() => handleQuickLogin("owner@mediaconnect.app")}
                className="flex items-center justify-between p-2.5 rounded-xl bg-slate-950 border border-slate-800 hover:border-indigo-500/50 text-left transition group"
              >
                <div>
                  <span className="text-xs font-bold text-white block group-hover:text-indigo-400">
                    👑 Alice (Workspace OWNER)
                  </span>
                  <span className="text-[10px] text-slate-500 font-mono">owner@mediaconnect.app</span>
                </div>
                <span className="text-[10px] bg-indigo-500/10 text-indigo-400 px-2 py-0.5 rounded border border-indigo-500/20">
                  Full Access
                </span>
              </button>

              <button
                type="button"
                onClick={() => handleQuickLogin("approver@mediaconnect.app")}
                className="flex items-center justify-between p-2.5 rounded-xl bg-slate-950 border border-slate-800 hover:border-purple-500/50 text-left transition group"
              >
                <div>
                  <span className="text-xs font-bold text-white block group-hover:text-purple-400">
                    ✅ Bob (Content APPROVER)
                  </span>
                  <span className="text-[10px] text-slate-500 font-mono">approver@mediaconnect.app</span>
                </div>
                <span className="text-[10px] bg-purple-500/10 text-purple-400 px-2 py-0.5 rounded border border-purple-500/20">
                  Approvals Only
                </span>
              </button>

              <button
                type="button"
                onClick={() => handleQuickLogin("editor@mediaconnect.app")}
                className="flex items-center justify-between p-2.5 rounded-xl bg-slate-950 border border-slate-800 hover:border-pink-500/50 text-left transition group"
              >
                <div>
                  <span className="text-xs font-bold text-white block group-hover:text-pink-400">
                    ✍️ Charlie (Content EDITOR)
                  </span>
                  <span className="text-[10px] text-slate-500 font-mono">editor@mediaconnect.app</span>
                </div>
                <span className="text-[10px] bg-pink-500/10 text-pink-400 px-2 py-0.5 rounded border border-pink-500/20">
                  Drafts Only
                </span>
              </button>

              <button
                type="button"
                onClick={() => handleQuickLogin("beta_user@mediaconnect.app")}
                className="flex items-center justify-between p-2.5 rounded-xl bg-slate-950 border border-slate-800 hover:border-emerald-500/50 text-left transition group"
              >
                <div>
                  <span className="text-xs font-bold text-white block group-hover:text-emerald-400">
                    🏢 Dana (Beta Agency OWNER)
                  </span>
                  <span className="text-[10px] text-slate-500 font-mono">beta_user@mediaconnect.app</span>
                </div>
                <span className="text-[10px] bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded border border-emerald-500/20">
                  Isolated Tenant
                </span>
              </button>
            </div>
          </div>
        </div>

        <div className="text-center">
          <p className="text-[11px] text-slate-500 flex items-center justify-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            <span>Zero-Cost Local Dev Auth. Password for all test users: Password123!</span>
          </p>
        </div>
      </div>
    </div>
  );
}
