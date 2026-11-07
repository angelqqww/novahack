import { useCallback, useEffect, useRef, useState } from "react";
import { useApp } from "@/app/state";

export type Status = "loading" | "ready" | "empty" | "error";
export type Resource<T> = { status: Status; data?: T; retry: () => void };

const cache = new Map<string, unknown>();

/**
 * Loads data once per key (cached for the session) and applies the demo state
 * from Settings (Loading / Empty / Error) so every card can show those states.
 * `isEmpty` decides when real data counts as empty.
 */
export function useResource<T>(key: string, loader: () => Promise<T>, isEmpty?: (d: T) => boolean): Resource<T> {
  const { sim, dataVersion } = useApp();
  const fullKey = `${dataVersion}|${key}`;
  const [state, setState] = useState<{ key: string; status: Status; data?: T }>(() =>
    cache.has(fullKey) ? { key: fullKey, status: "ready", data: cache.get(fullKey) as T } : { key: fullKey, status: "loading" },
  );
  const [recovered, setRecovered] = useState(false);
  const loaderRef = useRef(loader);
  loaderRef.current = loader;

  const run = useCallback(() => {
    let alive = true;
    if (cache.has(fullKey)) {
      setState({ key: fullKey, status: "ready", data: cache.get(fullKey) as T });
      return () => {};
    }
    setState({ key: fullKey, status: "loading" });
    loaderRef
      .current()
      .then((d) => {
        cache.set(fullKey, d);
        if (alive) setState({ key: fullKey, status: "ready", data: d });
      })
      .catch(() => alive && setState({ key: fullKey, status: "error" }));
    return () => {
      alive = false;
    };
  }, [fullKey]);

  useEffect(() => run(), [run]);
  useEffect(() => setRecovered(false), [sim]);

  const retry = useCallback(() => {
    setRecovered(true);
    cache.delete(fullKey);
    run();
  }, [fullKey, run]);

  const current = state.key === fullKey ? state : { key: fullKey, status: "loading" as Status };
  if (!recovered) {
    if (sim === "loading") return { status: "loading", retry };
    if (sim === "error") return { status: "error", retry };
    if (sim === "empty") return { status: "empty", retry };
  }
  if (current.status === "ready" && current.data !== undefined && isEmpty?.(current.data)) return { status: "empty", data: current.data, retry };
  return { status: current.status, data: current.data, retry };
}
