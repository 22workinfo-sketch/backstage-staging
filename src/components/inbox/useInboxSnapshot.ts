"use client";
import { useEffect, useState } from "react";
import { safeFetchJson, type ApiRequestInit } from "@/lib/api-client";

class RequestError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export async function requestJson<T>(url: string, options?: ApiRequestInit): Promise<T> {
  const res = await safeFetchJson<T>(url, { cache: "no-store", ...options });
  if (!res.ok || res.data == null) throw new RequestError(res.status, res.error || "Request failed.");
  return res.data;
}

const ACTIVE_BASE_MS = 5000;
const ACTIVE_MAX_IDLE_MS = 15000;
const HIDDEN_POLL_MS = 30000;

// Each snapshot is a complete, paginated database view. Reconnect never depends
// on socket events that might have been missed while the tab was offline.
export function useInboxSnapshot<T>(url: string | null, revision: number) {
  const [view, setView] = useState<{ key: string; data?: T; error?: string }>();
  useEffect(() => {
    if (!url) return;
    let active = true;
    let busy = false;
    let timer: ReturnType<typeof setTimeout>;
    let pending: AbortController | undefined;
    let currentEtag: string | null = null;
    let idlePolls = 0;

    function nextDelayMs() {
      if (document.hidden) return HIDDEN_POLL_MS;
      if (idlePolls <= 0) return ACTIVE_BASE_MS;
      if (idlePolls === 1) return 8000;
      if (idlePolls === 2) return 12000;
      return ACTIVE_MAX_IDLE_MS;
    }

    async function sync(resetBackoff = false) {
      if (busy || !active) return;
      if (resetBackoff) idlePolls = 0;
      busy = true;
      clearTimeout(timer);
      pending = new AbortController();
      const timeout = setTimeout(() => pending?.abort(), 15000);
      try {
        const headers: Record<string, string> = {};
        if (currentEtag) {
          headers["If-None-Match"] = currentEtag;
        }
        const res = await safeFetchJson<T>(url!, {
          cache: "no-store",
          headers,
          signal: pending.signal,
        });

        if (res.status === 304) {
          idlePolls += 1;
          if (active) {
            setView(previous => (previous?.key === url && previous.error ? { key: url!, data: previous.data } : previous));
          }
          return;
        }

        if (!res.ok || res.data == null) {
          throw new RequestError(res.status, res.error || "Request failed.");
        }

        if (res.etag) {
          currentEtag = res.etag;
        }
        idlePolls = 0;
        if (active) setView({ key: url!, data: res.data });
      } catch (err) {
        if (!active) return;
        idlePolls += 1;
        const denied = err instanceof RequestError && [401, 403, 404].includes(err.status);
        const error = denied ? (err as Error).message : "Connection interrupted. Reconnecting…";
        setView(previous => ({ key: url!, data: !denied && previous?.key === url ? previous.data : undefined, error }));
      } finally {
        clearTimeout(timeout);
        busy = false;
        if (active) timer = setTimeout(() => void sync(false), nextDelayMs());
      }
    }

    const onWake = () => {
      if (!document.hidden) void sync(true);
    };

    void sync(true);
    document.addEventListener("visibilitychange", onWake);
    window.addEventListener("online", onWake);
    window.addEventListener("focus", onWake);
    return () => {
      active = false;
      pending?.abort();
      document.removeEventListener("visibilitychange", onWake);
      clearTimeout(timer);
      window.removeEventListener("online", onWake);
      window.removeEventListener("focus", onWake);
    };
  }, [url, revision]);
  return view?.key === url ? view : undefined;
}
