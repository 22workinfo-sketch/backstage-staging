"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("admin@local.test");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Login failed");
      }

      router.push("/dashboard");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Authentication error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center p-4 bg-[var(--bg)]">
      <div className="w-full max-w-md rounded-2xl bg-[var(--panel)] p-8 shadow-2xl border border-[var(--border)]">
        <div className="mb-8 text-center">
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--text)] text-[var(--bg)] font-bold text-xl mb-3 shadow-lg">
            ↗
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--text)]">
            botdesk
          </h1>
          <p className="mt-1 text-xs text-[var(--muted)]">
            Sign in to manage your Telegram bots
          </p>
        </div>

        {error && (
          <div className="mb-4 rounded-lg bg-[var(--redbg)] border border-[var(--red)] p-3 text-xs text-[var(--red)]">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--muted)] mb-1">
              Admin Email
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="botdesk-input text-xs"
              placeholder="admin@local.test"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--muted)] mb-1">
              Password
            </label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="botdesk-input text-xs"
              placeholder="••••••••••••"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="botdesk-btn primary w-full text-xs font-semibold py-2.5"
          >
            {loading ? "Authenticating..." : "Sign In to Botdesk"}
          </button>
        </form>

        <div className="mt-6 border-t border-[var(--border)] pt-4 text-center">
          <p className="text-xs text-[var(--muted)]">
            Default credentials are set in your local <code className="text-[var(--text)]">.env</code> file.
          </p>
        </div>
      </div>
    </div>
  );
}
