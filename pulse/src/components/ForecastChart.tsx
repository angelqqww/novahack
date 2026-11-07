import { memo } from "react";
import { Area, CartesianGrid, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { ForecastPoint } from "@/lib/analytics";
import { fmtInt } from "@/lib/format";

/** Daily orders: actual (solid), predicted (dashed) and an 80% confidence band. */
/** Memoized: the app clock ticks every second, and charts shouldn't redraw for that. */
export const ForecastChart = memo(function ForecastChart({ points, height = 300 }: { points: ForecastPoint[]; height?: number }) {
  const todayLabel = points.find((p) => p.label === "Today")?.label;
  return (
    <div style={{ height }} className="w-full animate-[fade-in_300ms_ease-out]">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={points} margin={{ top: 16, right: 12, bottom: 4, left: -8 }}>
          <defs>
            <linearGradient id="band" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.16} />
              <stop offset="100%" stopColor="var(--primary)" stopOpacity={0.08} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke="var(--border)" />
          <XAxis dataKey="label" tickLine={false} axisLine={false} interval={0} height={50} tick={<DayTick points={points} />} />
          <YAxis tickLine={false} axisLine={false} width={44} tick={{ fill: "var(--muted-foreground)", fontSize: 12 }} />
          <Tooltip content={<ChartTip />} cursor={{ stroke: "var(--border)", strokeWidth: 2 }} />
          {todayLabel && <ReferenceLine x={todayLabel} stroke="var(--muted-foreground)" strokeDasharray="3 4" label={{ value: "Now", position: "top", fill: "var(--muted-foreground)", fontSize: 11, fontWeight: 600 }} />}
          <Area type="monotone" dataKey="band" stroke="none" fill="url(#band)" isAnimationActive={false} connectNulls />
          <Line type="monotone" dataKey="actual" stroke="var(--foreground)" strokeWidth={2.5} dot={false} activeDot={{ r: 5 }} isAnimationActive={false} connectNulls={false} />
          <Line type="monotone" dataKey="predicted" stroke="var(--primary)" strokeWidth={2.5} strokeDasharray="7 6" dot={{ r: 3.5, fill: "var(--card)", stroke: "var(--primary)", strokeWidth: 2 }} activeDot={{ r: 6 }} isAnimationActive={false} connectNulls />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
});

function DayTick(props: { x?: number; y?: number; payload?: { value: string; index: number }; points: ForecastPoint[] }) {
  const { x = 0, y = 0, payload, points } = props;
  if (!payload) return null;
  const p = points[payload.index];
  const [dow, md] = payload.value === "Today" ? ["Today", ""] : payload.value.split(" ");
  const future = p?.predicted !== undefined && p?.actual === undefined;
  return (
    <g transform={`translate(${x},${y + 4})`}>
      <text textAnchor="middle" y={10} fontSize={11.5} fontWeight={future ? 700 : 500} fill={future ? "var(--foreground)" : "var(--muted-foreground)"}>
        {dow}
      </text>
      {md && (
        <text textAnchor="middle" y={24} fontSize={10.5} fill="var(--muted-foreground)">
          {md}
        </text>
      )}
      {p?.rain && future && (
        <text textAnchor="middle" y={38} fontSize={10} fontWeight={700} fill="#1f6feb">
          Rain
        </text>
      )}
    </g>
  );
}

function ChartTip({ active, payload }: { active?: boolean; payload?: { payload: ForecastPoint }[] }) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  const isFuture = p.actual === undefined;
  return (
    <div className="rounded-xl border border-border bg-card px-3.5 py-2.5 text-sm shadow-[var(--shadow-sheet)]">
      <div className="font-semibold">
        {p.label}
        {p.rain ? " · rain" : ""}
      </div>
      {!isFuture && <div className="tabular">Actual: {fmtInt(p.actual!)} orders</div>}
      {isFuture && p.predicted !== undefined && (
        <>
          <div className="tabular font-semibold text-primary">Predicted: {fmtInt(p.predicted)} orders</div>
          {p.band && <div className="tabular text-muted-foreground">Likely {fmtInt(p.band[0])}–{fmtInt(p.band[1])}</div>}
          {p.soFar !== undefined && <div className="tabular text-muted-foreground">{fmtInt(p.soFar)} so far</div>}
        </>
      )}
    </div>
  );
}
