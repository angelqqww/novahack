import { memo, useMemo } from "react";
import { Area, AreaChart, ResponsiveContainer, YAxis } from "recharts";
import type { Kpi } from "@/lib/analytics";
import { useCountUp } from "@/hooks/useCountUp";
import { Trend } from "./Trend";
import { fmtInt, fmtUsd } from "@/lib/format";
import { cn } from "@/lib/utils";

const format = (id: Kpi["id"], v: number) => (id === "revenue" ? fmtUsd(v) : id === "aov" ? fmtUsd(v, 2) : id === "prep" ? v.toFixed(1) : fmtInt(v));

/** KPI with an animated count-up, change vs last week and a small sparkline. */
export const KpiTile = memo(function KpiTile({ kpi, className }: { kpi: Kpi; className?: string }) {
  const v = useCountUp(kpi.value);
  const good = Math.abs(kpi.deltaPct) < 1 ? null : kpi.deltaPct > 0 === kpi.goodWhenUp;
  const stroke = good === false ? "var(--danger)" : "var(--success)";
  const data = useMemo(() => kpi.spark.map((y, i) => ({ i, y })), [kpi.spark]);
  const gid = `spark-${kpi.id}`;
  return (
    <div className={cn("flex min-w-0 flex-col justify-between rounded-2xl border border-border bg-card px-5 py-4 shadow-[var(--shadow-card)]", className)}>
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-sm font-medium text-muted-foreground">{kpi.label}</span>
        <Trend pct={kpi.deltaPct} goodWhenUp={kpi.goodWhenUp} />
      </div>
      <div className="mt-1 flex items-end justify-between gap-2">
        <div className="min-w-0 text-[28px] font-bold leading-none tracking-tight tabular xl:text-[32px]">
          {format(kpi.id, v)}
          {kpi.id === "prep" && <span className="ml-1 text-base font-semibold text-muted-foreground xl:text-lg">min</span>}
        </div>
        <div className="h-10 w-16 shrink-0 xl:w-24" aria-hidden>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 2, right: 0, bottom: 2, left: 0 }}>
              <defs>
                <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={stroke} stopOpacity={0.22} />
                  <stop offset="100%" stopColor={stroke} stopOpacity={0} />
                </linearGradient>
              </defs>
              <YAxis hide domain={["dataMin", "dataMax"]} />
              <Area type="monotone" dataKey="y" stroke={stroke} strokeWidth={2} fill={`url(#${gid})`} isAnimationActive animationDuration={700} dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
      <div className="mt-1.5 truncate text-xs text-muted-foreground">{kpi.compare}</div>
    </div>
  );
});

export function KpiTileSkeleton() {
  return (
    <div className="flex flex-col justify-between rounded-2xl border border-border bg-card p-5">
      <div className="skeleton h-4 w-28 rounded" />
      <div className="mt-3 flex items-end justify-between">
        <div className="skeleton h-8 w-24 rounded-md" />
        <div className="skeleton h-10 w-24 rounded-md" />
      </div>
    </div>
  );
}
