"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AnimatePresence, MotionConfig, motion } from "motion/react";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [mode, setMode] = useState<"LOGIN" | "CHANGE_PASSWORD">("LOGIN");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (searchParams.get("changePassword") === "true") {
      setMode("CHANGE_PASSWORD");
    }
  }, [searchParams]);

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setError("Please enter your staff email.");
      return;
    }

    if (!password) {
      setError("Please enter your password.");
      return;
    }

    setLoading(true);

    try {
      let res: Response;
      try {
        res = await fetch("/api/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: trimmedEmail, password }),
        });
      } catch {
        setError(
          "Unable to connect to the authentication service. Please check your network connection or verify that the server is running."
        );
        return;
      }

      let data: any = null;
      const contentType = res.headers.get("content-type") || "";
      if (contentType.includes("application/json")) {
        try {
          data = await res.json();
        } catch {
          // JSON parsing failed despite header
        }
      }

      if (!res.ok) {
        if (data && typeof data.error === "string") {
          setError(data.error);
        } else if (res.status === 502 || res.status === 503 || res.status === 504) {
          setError(
            "The authentication server is temporarily unavailable. Please try again in a few moments."
          );
        } else if (res.status === 500) {
          setError("Authentication service encountered an unexpected error. Please check server logs.");
        } else {
          setError(`Authentication request failed (${res.status} ${res.statusText || "Error"}).`);
        }
        return;
      }

      if (!data) {
        setError("Received an unexpected non-JSON response from the server.");
        return;
      }

      if (data.user?.mustChangePassword) {
        setMode("CHANGE_PASSWORD");
        setError("Password change required: Please set a new password to continue.");
        return;
      }

      router.push("/");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Authentication error occurred");
    } finally {
      setLoading(false);
    }
  };

  const handleChangePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!password) {
      setError("Please enter your current password.");
      return;
    }

    if (newPassword.length < 8) {
      setError("New password must be at least 8 characters long.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("New password and confirmation do not match.");
      return;
    }

    setLoading(true);

    try {
      let res: Response;
      try {
        res = await fetch("/api/auth/change-password", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            oldPassword: password,
            newPassword,
          }),
        });
      } catch {
        setError(
          "Unable to connect to the authentication service. Please check your network connection."
        );
        return;
      }

      let data: any = null;
      const contentType = res.headers.get("content-type") || "";
      if (contentType.includes("application/json")) {
        try {
          data = await res.json();
        } catch {
          // JSON parsing failed
        }
      }

      if (!res.ok) {
        if (data && typeof data.error === "string") {
          setError(data.error);
        } else {
          setError(`Failed to update password (${res.status} ${res.statusText || "Error"}).`);
        }
        return;
      }

      router.push("/");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to change password");
    } finally {
      setLoading(false);
    }
  };

  return (
    <MotionConfig reducedMotion="user">
      <div className="relative flex min-h-screen items-center justify-center p-4 bg-[#080b12] overflow-hidden">
        {/* Atmospheric Sky Cyan top glow */}
        <div
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_45%_at_50%_18%,rgba(56,189,248,0.14)_0%,rgba(14,165,233,0.04)_42%,transparent_75%)]"
          aria-hidden="true"
        />

        <motion.div
          initial={{ opacity: 0, y: 14, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ type: "spring", stiffness: 360, damping: 30 }}
          className="relative z-10 w-full max-w-md hw-hero-card rounded-2xl p-8"
        >
          <div className="mb-7 text-center">
            <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-b from-[#133550] to-[#0a1e30] border border-sky-400/35 text-[#38bdf8] shadow-[inset_0_1px_0_rgba(255,255,255,0.16),0_0_24px_-4px_rgba(56,189,248,0.45)] mb-3.5">
              <svg className="w-6 h-6 fill-current" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M13 2L3 14h8l-1 8 11-12h-8l1-8z" />
              </svg>
            </div>
            <h1 className="text-2xl font-extrabold tracking-tight text-white">
              botdesk
            </h1>
            <p className="mt-1.5 text-xs text-slate-400">
              {mode === "LOGIN"
                ? "Sign in to your Botdesk workspace"
                : "Security Requirement: Set a new permanent password"}
            </p>
          </div>

          <AnimatePresence>
            {error && (
              <motion.div
                key="login-error"
                initial={{ opacity: 0, y: -6, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -6, scale: 0.98 }}
                transition={{ type: "spring", stiffness: 420, damping: 30 }}
                className="mb-4 rounded-xl bg-rose-950/50 border border-rose-500/40 p-3 text-xs text-rose-200 shadow-sm"
              >
                {error}
              </motion.div>
            )}
          </AnimatePresence>

          {mode === "LOGIN" ? (
            <form onSubmit={handleLoginSubmit} className="space-y-4">
              <div>
                <label className="block font-mono text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                  Staff Email
                </label>
                <input
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-xl border border-white/[0.09] bg-[#080d17] px-3.5 py-2.5 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-[#38bdf8] focus:ring-1 focus:ring-[#38bdf8] transition"
                  placeholder="Enter your registered staff email"
                />
              </div>

              <div>
                <label className="block font-mono text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                  Password
                </label>
                <input
                  type="password"
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-xl border border-white/[0.09] bg-[#080d17] px-3.5 py-2.5 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-[#38bdf8] focus:ring-1 focus:ring-[#38bdf8] transition"
                  placeholder="Enter your password"
                />
              </div>

              <motion.button
                whileHover={loading ? undefined : { y: -1 }}
                whileTap={loading ? undefined : { scale: 0.98 }}
                type="submit"
                disabled={loading}
                className="w-full rounded-xl bg-[#38bdf8] hover:bg-[#20b3f7] text-slate-950 font-bold text-xs py-2.5 shadow-[0_6px_22px_-4px_rgba(56,189,248,0.45),inset_0_1px_0_rgba(255,255,255,0.4)] transition cursor-pointer disabled:opacity-50"
              >
                {loading ? "Authenticating..." : "Sign In to Botdesk"}
              </motion.button>
            </form>
          ) : (
            <form onSubmit={handleChangePasswordSubmit} className="space-y-4">
              <div className="p-3 rounded-xl bg-sky-500/10 border border-sky-400/25 text-xs text-sky-300 leading-relaxed">
                Your account requires a new password before you can access the BackStage workspace.
              </div>

              <div>
                <label className="block font-mono text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                  Current / Initial Password
                </label>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-xl border border-white/[0.09] bg-[#080d17] px-3.5 py-2.5 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-[#38bdf8] focus:ring-1 focus:ring-[#38bdf8] transition"
                  placeholder="••••••••••••"
                />
              </div>

              <div>
                <label className="block font-mono text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                  New Password (Min 8 Characters)
                </label>
                <input
                  type="password"
                  required
                  minLength={8}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full rounded-xl border border-white/[0.09] bg-[#080d17] px-3.5 py-2.5 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-[#38bdf8] focus:ring-1 focus:ring-[#38bdf8] transition"
                  placeholder="••••••••••••"
                />
              </div>

              <div>
                <label className="block font-mono text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                  Confirm New Password
                </label>
                <input
                  type="password"
                  required
                  minLength={8}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full rounded-xl border border-white/[0.09] bg-[#080d17] px-3.5 py-2.5 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-[#38bdf8] focus:ring-1 focus:ring-[#38bdf8] transition"
                  placeholder="••••••••••••"
                />
              </div>

              <motion.button
                whileHover={loading ? undefined : { y: -1 }}
                whileTap={loading ? undefined : { scale: 0.98 }}
                type="submit"
                disabled={loading}
                className="w-full rounded-xl bg-[#38bdf8] hover:bg-[#20b3f7] text-slate-950 font-bold text-xs py-2.5 shadow-[0_6px_22px_-4px_rgba(56,189,248,0.45),inset_0_1px_0_rgba(255,255,255,0.4)] transition cursor-pointer disabled:opacity-50"
              >
                {loading ? "Saving Password..." : "Set Password & Continue"}
              </motion.button>
            </form>
          )}

          <div className="mt-6 border-t border-white/[0.08] pt-4 text-center">
            <p className="font-mono text-[11px] text-slate-500">
              One control center. Independent bots.
            </p>
          </div>
        </motion.div>
      </div>
    </MotionConfig>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#080b12] flex items-center justify-center p-4">
          <div className="text-xs font-mono text-slate-400">Loading BackStage...</div>
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
