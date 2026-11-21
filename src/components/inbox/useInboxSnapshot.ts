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
    let delayMs = 3000;
    async function sync() {
      if (busy || !active || document.hidden) return;
      busy = true;
      clearTimeout(timer);
      pending = new AbortController();
      const timeout = setTimeout(() => pending?.abort(), 15000);
      try {
        const data = await requestJson<T>(url!, { signal: pending.signal });
        delayMs = 3000;
        if (active) setView({ key: url!, data });
      } catch (err) {
        if (!active) return;
        delayMs = Math.min(30000, delayMs * 2);
        const denied = err instanceof RequestError && [401, 403, 404].includes(err.status);
        const error = denied ? (err as Error).message : "Connection interrupted. Reconnecting…";
        setView(previous => ({ key: url!, data: !denied && previous?.key === url ? previous.data : undefined, error }));
      } finally {
        clearTimeout(timeout);
        busy = false;
        if (active) timer = setTimeout(sync, delayMs);
      }
    }
    void sync();
    document.addEventListener("visibilitychange", sync);
    window.addEventListener("online", sync);
    window.addEventListener("focus", sync);
    return () => {
      active = false;
      pending?.abort();
      document.removeEventListener("visibilitychange", sync);
      clearTimeout(timer);
      window.removeEventListener("online", sync);
      window.removeEventListener("focus", sync);
    };
  }, [url, revision]);
  return view?.key === url ? view : undefined;
}
