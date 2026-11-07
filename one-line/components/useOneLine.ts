"use client";
// Polls GET /api/state every second and smooths the sim clock between polls.
import { useCallback, useEffect, useRef, useState } from "react";
import type { AppState } from "@/lib/types";

/** API paths are relative to the app's base path (/one-line when deployed with the other services). */
export const apiUrl = (path: string) => `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}${path}`;

export function useOneLine(pollMs = 1000) {
  const [state, setState] = useState<AppState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fetchedAt = useRef(0);
  const [, setTick] = useState(0);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(apiUrl("/api/state"), { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const next = (await res.json()) as AppState;
      fetchedAt.current = performance.now();
      setState(next);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "offline");
    }
  }, []);

  useEffect(() => {
    refresh();
    const poll = setInterval(refresh, pollMs);
    const tick = setInterval(() => setTick((t) => t + 1), 200);
    return () => {
      clearInterval(poll);
      clearInterval(tick);
    };
  }, [refresh, pollMs]);

  /** POST then refresh immediately, so the screen updates well within 1 s. */
  const post = useCallback(
    async (url: string, payload: unknown = {}) => {
      const res = await fetch(apiUrl(url), { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
      await refresh();
      return res.ok ? res.json().catch(() => ({})) : null;
    },
    [refresh],
  );

  // Interpolated "now" so countdowns tick smoothly between polls.
  let now = state?.simNow ?? 0;
  if (state?.sim.running && fetchedAt.current) {
    const elapsed = Math.min(performance.now() - fetchedAt.current, 1500);
    now += elapsed * state.sim.speed;
  }

  return { state, now, error, refresh, post };
}

export const orderPath = (id: string) => `/api/orders/${encodeURIComponent(id.replace(/^#/, ""))}`;
