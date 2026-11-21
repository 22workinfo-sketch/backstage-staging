"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";

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
    <div className="flex min-h-screen items-center justify-center p-4 bg-[var(--bg)]">
      <div className="w-full max-w-md rounded-2xl bg-[var(--panel)] p-8 shadow-2xl border border-[var(--border)]">
        <div className="mb-6 text-center">
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--text)] text-[var(--bg)] font-bold text-xl mb-3 shadow-lg">
            ↗
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--text)]">
            botdesk
          </h1>
          <p className="mt-1 text-xs text-[var(--muted)]">
            {mode === "LOGIN"
              ? "Sign in to your Botdesk workspace"
              : "Security Requirement: Set a new permanent password"}
          </p>
        </div>

        {error && (
          <div className="mb-4 rounded-lg bg-[var(--redbg)] border border-[var(--red)] p-3 text-xs text-[var(--red)]">
            {error}
          </div>
        )}

        {mode === "LOGIN" ? (
          <form onSubmit={handleLoginSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--muted)] mb-1">
                Staff Email
              </label>
              <input
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="botdesk-input text-xs"
                placeholder="Enter your registered staff email"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--muted)] mb-1">
                Password
              </label>
              <input
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="botdesk-input text-xs"
                placeholder="Enter your password"
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
        ) : (
          <form onSubmit={handleChangePasswordSubmit} className="space-y-4">
            <div className="p-3 rounded-lg bg-[var(--bluebg)] border border-[var(--border)] text-xs text-[var(--accent)] leading-relaxed">
              Your account requires a new password before you can access the BackStage workspace.
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--muted)] mb-1">
                Current / Initial Password
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

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--muted)] mb-1">
                New Password (Min 8 Characters)
              </label>
              <input
                type="password"
                required
                minLength={8}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="botdesk-input text-xs"
                placeholder="••••••••••••"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--muted)] mb-1">
                Confirm New Password
              </label>
              <input
                type="password"
                required
                minLength={8}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="botdesk-input text-xs"
                placeholder="••••••••••••"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="botdesk-btn primary w-full text-xs font-semibold py-2.5"
            >
              {loading ? "Saving Password..." : "Set Password & Continue"}
            </button>
          </form>
        )}

        <div className="mt-6 border-t border-[var(--border)] pt-4 text-center">
          <p className="text-xs text-[var(--muted)]">
            One control center. Independent bots.
          </p>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[var(--background)] flex items-center justify-center p-4">
          <div className="text-xs text-[var(--muted)]">Loading BackStage...</div>
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
