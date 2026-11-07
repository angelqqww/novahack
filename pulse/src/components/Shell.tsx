import type { ReactNode } from "react";
import { BarChart3, Grid3x3, Moon, ReceiptText, Settings, Sun, TrendingUp, UtensilsCrossed } from "lucide-react";
import { toast } from "sonner";
import { useApp, useNow, type Route } from "@/app/state";
import { STORE } from "@/data/mock";
import { fmtDateLong, fmtTime } from "@/lib/format";
import { cn } from "@/lib/utils";

const NAV: { route: Route; label: string; icon: typeof BarChart3 }[] = [
  { route: "live", label: "Live Orders", icon: ReceiptText },
  { route: "insights", label: "Insights", icon: BarChart3 },
  { route: "heatmap", label: "Heatmap", icon: Grid3x3 },
  { route: "menu", label: "Menu", icon: UtensilsCrossed },
  { route: "forecast", label: "Forecast", icon: TrendingUp },
  { route: "settings", label: "Settings", icon: Settings },
];

export function PulseMark({ size = 36 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden>
      <rect width="32" height="32" rx="9" fill="#FF3008" />
      <path d="M5 17h5l3-7 5 13 3-6h6" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Shell({ children, liveCount }: { children: ReactNode; liveCount?: number }) {
  const { route, go } = useApp();
  return (
    <div className="flex h-full w-full overflow-hidden bg-background">
      <nav className="flex w-[92px] shrink-0 flex-col items-center gap-1 border-r border-border bg-card py-4" aria-label="Main">
        <div className="mb-4 flex flex-col items-center gap-1">
          <PulseMark />
          <span className="text-[11px] font-bold tracking-wide">Pulse</span>
        </div>
        {NAV.map(({ route: r, label, icon: Icon }) => {
          const active = route === r;
          return (
            <button
              key={r}
              type="button"
              onClick={() => go(r)}
              aria-current={active ? "page" : undefined}
              className={cn(
                "relative flex w-[76px] flex-col items-center gap-1 rounded-2xl py-2.5 text-[11.5px] font-semibold transition-colors duration-150",
                active ? "bg-primary-soft text-primary" : "text-muted-foreground hover:bg-muted active:bg-muted",
                r === "settings" && "mt-auto",
              )}
            >
              <Icon className="h-[22px] w-[22px]" strokeWidth={active ? 2.4 : 2} />
              {label}
              {r === "live" && !!liveCount && (
                <span className="absolute right-2.5 top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[11px] font-bold text-white tabular">{liveCount}</span>
              )}
            </button>
          );
        })}
      </nav>
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar />
        <main className="min-h-0 flex-1">{children}</main>
      </div>
    </div>
  );
}

function TopBar() {
  const { online, setOnline, theme, setTheme, dataMode } = useApp();
  const now = useNow();
  return (
    <header className="flex h-16 shrink-0 items-center gap-4 border-b border-border bg-card px-6">
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#fde8e4] text-lg dark:bg-[#3a1a14]" aria-hidden>
          🍜
        </div>
        <div className="min-w-0">
          <div className="truncate text-[17px] font-bold leading-tight">{STORE.name}</div>
          <div className="truncate text-xs text-muted-foreground">{STORE.address}</div>
        </div>
      </div>
      <button
        type="button"
        onClick={() => {
          const next = !online;
          setOnline(next);
          toast(next ? "Store is online" : "Store paused", {
            description: next ? "You're accepting new orders." : "New orders are on hold. Orders in progress continue.",
            action: { label: "Undo", onClick: () => setOnline(!next) },
          });
        }}
        className={cn(
          "inline-flex h-12 items-center gap-2 rounded-full px-4 text-sm font-semibold transition-colors duration-150",
          online ? "bg-success-soft text-success" : "bg-warning-soft text-[#8a6100] dark:text-warning",
        )}
        aria-label={online ? "Store online. Tap to pause." : "Store paused. Tap to go online."}
      >
        <span className={cn("h-2.5 w-2.5 rounded-full", online ? "bg-success" : "bg-warning")} />
        {online ? "Online" : "Paused"}
      </button>
      {dataMode === "learning" && <span className="hidden rounded-full bg-muted px-3 py-1.5 text-xs font-semibold text-muted-foreground xl:inline">Learning · 3 weeks of data</span>}
      <div className="ml-auto flex items-center gap-4">
        <div className="text-right leading-tight">
          <div className="text-[17px] font-bold tabular">{fmtTime(now)}</div>
          <div className="text-xs text-muted-foreground">{fmtDateLong(now)}</div>
        </div>
        <button
          type="button"
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          className="flex h-12 w-12 items-center justify-center rounded-full bg-muted transition-colors duration-150 hover:bg-border"
          aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
        >
          {theme === "dark" ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
        </button>
      </div>
    </header>
  );
}
