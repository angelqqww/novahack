import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { generateHistory, weatherForecast } from "@/data/mock";
import type { Ctx } from "@/lib/analytics";

export type Route = "live" | "insights" | "heatmap" | "menu" | "forecast" | "settings";
export type DataMode = "full" | "learning";
export type SimState = "live" | "loading" | "empty" | "error";

type AppState = {
  route: Route;
  go: (r: Route) => void;
  ctx: Ctx; // data snapshot for analytics
  dataVersion: string; // changes when the snapshot changes (cache key)
  theme: "light" | "dark";
  setTheme: (t: "light" | "dark") => void;
  online: boolean;
  setOnline: (v: boolean) => void;
  demoClock: boolean;
  setDemoClock: (v: boolean) => void;
  dataMode: DataMode;
  setDataMode: (m: DataMode) => void;
  sim: SimState;
  setSim: (s: SimState) => void;
  refresh: () => void;
  /** AI-insight actions the merchant accepted (e.g. "soldout" → pork belly added to the order list). */
  accepted: string[];
  accept: (insightId: string) => void;
};

const Ctx = createContext<AppState | null>(null);
/** The ticking clock lives in its own context so only the clock and live screens re-render every second. */
const NowCtx = createContext<Date>(new Date());

const DEMO_HOUR = 17;
const DEMO_MIN = 40;

function readHash(): Route {
  const h = window.location.hash.replace(/^#\/?/, "");
  return (["live", "insights", "heatmap", "menu", "forecast", "settings"] as Route[]).includes(h as Route) ? (h as Route) : "insights";
}

function load<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(`pulse:${key}`);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
}
function save(key: string, v: unknown) {
  try {
    localStorage.setItem(`pulse:${key}`, JSON.stringify(v));
  } catch {
    /* private mode: fine */
  }
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [route, setRoute] = useState<Route>(readHash);
  const [theme, setThemeState] = useState<"light" | "dark">(() => load("theme", "light"));
  const [online, setOnline] = useState(true);
  const [demoClock, setDemoClockState] = useState<boolean>(() => load("demoClock", true));
  const [dataMode, setDataModeState] = useState<DataMode>("full");
  const [sim, setSim] = useState<SimState>("live");
  const [refreshTick, setRefreshTick] = useState(0);
  const [accepted, setAccepted] = useState<string[]>([]);

  // Clock: in demo mode, today at 5:40 PM (dinner rush is about to start), then ticking in real time.
  const [startedAt] = useState(() => Date.now());
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const now = useMemo(() => {
    if (!demoClock) return new Date(nowMs);
    const d = new Date(startedAt);
    d.setHours(DEMO_HOUR, DEMO_MIN, 0, 0);
    return new Date(d.getTime() + (nowMs - startedAt));
  }, [demoClock, nowMs, startedAt]);

  // Data snapshot: fixed at the start of the session (or on refresh), so numbers don't jump while you present.
  const snapshotKey = `${demoClock}|${dataMode}|${refreshTick}`;
  const ctx = useMemo<Ctx>(() => {
    const at = demoClock ? (() => { const d = new Date(startedAt); d.setHours(DEMO_HOUR, DEMO_MIN, 0, 0); return d; })() : new Date();
    return { now: at, history: generateHistory(at, dataMode === "learning" ? 3 : 12), weather: weatherForecast(at) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapshotKey]);

  useEffect(() => {
    const onHash = () => setRoute(readHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.add("theme-transition");
    root.classList.toggle("dark", theme === "dark");
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme === "dark" ? "#18181b" : "#ffffff");
    const t = setTimeout(() => root.classList.remove("theme-transition"), 250);
    return () => clearTimeout(t);
  }, [theme]);

  const go = useCallback((r: Route) => {
    window.location.hash = `/${r}`;
    setRoute(r);
  }, []);

  const value = useMemo<AppState>(() => ({
    route,
    go,
    ctx,
    dataVersion: snapshotKey,
    theme,
    setTheme: (t: "light" | "dark") => {
      setThemeState(t);
      save("theme", t);
    },
    online,
    setOnline,
    demoClock,
    setDemoClock: (v: boolean) => {
      setDemoClockState(v);
      save("demoClock", v);
    },
    dataMode,
    setDataMode: setDataModeState,
    sim,
    setSim,
    refresh: () => setRefreshTick((x) => x + 1),
    accepted,
    accept: (id: string) => setAccepted((a) => (a.includes(id) ? a : [...a, id])),
  }), [route, go, ctx, snapshotKey, theme, online, demoClock, dataMode, sim, accepted]);
  return (
    <Ctx.Provider value={value}>
      <NowCtx.Provider value={now}>{children}</NowCtx.Provider>
    </Ctx.Provider>
  );
}

export function useApp() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useApp outside AppProvider");
  return v;
}

export function useNow() {
  return useContext(NowCtx);
}
