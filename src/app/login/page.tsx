"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Share2, Lock, Mail, AlertCircle, ShieldCheck } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isDev = process.env.NODE_ENV !== "production";

  const handleLogin = async (e?: React.FormEvent, customEmail?: string, customPass?: string) => {
    if (e) e.preventDefault();
    try {
      setLoading(true);
      setError(null);

      const loginEmail = customEmail || email;
      const loginPass = customPass || password;

      if (!loginEmail || !loginPass) {
        throw new Error("Please enter both email and password.");
      }

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

  const handleDevQuickFill = (quickEmail: string) => {
    setEmail(quickEmail);
    setPassword("Password123!");
  };

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col justify-center items-center p-6 text-slate-100 font-sans">
      <div className="w-full max-w-md space-y-6">
        {/* Brand Header */}
        <div className="text-center space-y-2">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-indigo-500 via-purple-500 to-pink-500 flex items-center justify-center text-white mx-auto shadow-xl shadow-indigo-500/25">
            <Share2 className="w-6 h-6" />
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">MediaConnect</h1>
          <p className="text-xs text-slate-400">
            Sign in to access your publishing workspace.
          </p>
        </div>

        {/* Login Form Box */}
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
                  autoComplete="email"
                  placeholder="name@company.com"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-4 py-2.5 text-xs text-white focus:outline-none focus:border-indigo-500"
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
                  autoComplete="current-password"
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
              {loading ? "Authenticating..." : "Sign In"}
            </button>
          </form>

          {/* Development-Only Helper (Stripped in Production Builds) */}
          {isDev && (
            <div className="pt-4 border-t border-slate-800/80 space-y-2.5">
              <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider block text-center">
                Local Dev Quick-Fill
              </span>

              <div className="grid grid-cols-2 gap-1.5 text-left">
                <button
                  type="button"
                  onClick={() => handleDevQuickFill("owner@mediaconnect.app")}
                  className="px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-800 hover:border-slate-700 text-[11px] text-slate-300 transition"
                >
                  Alice (Owner)
                </button>
                <button
                  type="button"
                  onClick={() => handleDevQuickFill("approver@mediaconnect.app")}
                  className="px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-800 hover:border-slate-700 text-[11px] text-slate-300 transition"
                >
                  Bob (Approver)
                </button>
                <button
                  type="button"
                  onClick={() => handleDevQuickFill("editor@mediaconnect.app")}
                  className="px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-800 hover:border-slate-700 text-[11px] text-slate-300 transition"
                >
                  Charlie (Editor)
                </button>
                <button
                  type="button"
                  onClick={() => handleDevQuickFill("beta_user@mediaconnect.app")}
                  className="px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-800 hover:border-slate-700 text-[11px] text-slate-300 transition"
                >
                  Dana (Beta Tenant)
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="text-center">
          <p className="text-[11px] text-slate-500 flex items-center justify-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            <span>Protected by AES-256-GCM Vault & Secure HttpOnly Sessions</span>
          </p>
        </div>
      </div>
    </div>
  );
}
