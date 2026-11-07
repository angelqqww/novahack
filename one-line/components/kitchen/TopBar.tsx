"use client";
import Link from "next/link";
import { Brain, Flame, SlidersHorizontal, Sparkles } from "lucide-react";
import type { AppState, StationLoad } from "@/lib/types";
import { STATION_LABEL, fmtClock, fmtDay } from "../format";
import { Chip, FloatPill, GrayButton, Logo } from "../ui";

export function TopBar({ state, now, onExplain, explaining }: { state: AppState; now: number; onExplain: () => void; explaining: boolean }) {
  const queued = state.orders.filter((o) => o.status === "queued");
  const late = queued.filter((o) => o.priority === "late").length;
  const m = state.modelStats;
  return (
    <header className="sticky top-0 z-20 border-b border-line bg-card/95 backdrop-blur">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-3 px-6 py-3">
        <Logo />
        <FloatPill className="text-center">
          <div className="text-2xl font-black leading-tight tabular">{fmtClock(now)}</div>
          <div className="text-xs font-bold text-sub">
            {fmtDay(now)} · {state.sim.running ? `sim ${state.sim.speed}×` : "paused"}
          </div>
        </FloatPill>
        <div className="flex items-center gap-2">
          <span className="text-3xl font-black tabular">{queued.length}</span>
          <span className="text-base font-bold text-sub">in queue</span>
          {late > 0 && (
            <Chip tone="redSolid">
              <Flame size={15} fill="currentColor" /> {late} late
            </Chip>
          )}
          {state.sim.rush && (
            <Chip tone="red">
              <Flame size={15} fill="currentColor" /> Rush · 3× orders
            </Chip>
          )}
        </div>

        <div className="ml-auto flex items-center gap-3">
          <div className="text-right leading-tight">
            <div className="inline-flex items-center gap-1.5 text-base font-extrabold">
              <Brain size={18} className="text-ok" /> Learned from <span className="tabular text-ok">{m.learnedFromOrders}</span> live orders
            </div>
            <div className="max-w-[22rem] truncate text-xs font-medium text-sub">{m.lastLearned ?? `trained on ${m.historyRecords.toLocaleString()} past items`}</div>
          </div>
          <GrayButton onClick={onExplain} disabled={explaining} size="sm">
            <Sparkles size={16} /> {explaining ? "Thinking…" : "Explain"}
          </GrayButton>
          <Link href="/control" className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-chip hover:bg-chip-2" title="Control panel">
            <SlidersHorizontal size={18} />
          </Link>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-x-8 gap-y-2 border-t border-line px-6 py-2.5 md:grid-cols-4">
        {state.stations.map((s) => (
          <StationBars key={s.station} s={s} />
        ))}
      </div>
    </header>
  );
}

/** One bar per slot, like the peak-pay chart: green = cooking now, dark = planned now, light = free. */
function StationBars({ s }: { s: StationLoad }) {
  const full = s.plannedNow >= s.capacity;
  return (
    <div className="flex items-end gap-3">
      <div className="w-24 shrink-0">
        <div className="text-sm font-extrabold">{STATION_LABEL[s.station]}</div>
        {full ? (
          <span className="text-xs font-extrabold uppercase text-late-text">Full</span>
        ) : (
          <span className="text-xs font-bold text-sub tabular">
            {s.plannedNow}/{s.capacity} busy
          </span>
        )}
      </div>
      <div className="flex h-8 flex-1 items-end gap-[3px]">
        {Array.from({ length: s.capacity }, (_, i) => {
          const cooking = i < s.cookingNow;
          const planned = i < s.plannedNow;
          const cls = full ? (planned ? "bg-late" : "bg-chip") : cooking ? "bg-ok-bright" : planned ? "bg-ink/70" : "bg-chip-2";
          return <div key={i} className={`w-3.5 rounded-t-[4px] transition-all duration-500 ${cls}`} style={{ height: planned ? "100%" : "45%" }} />;
        })}
      </div>
    </div>
  );
}
