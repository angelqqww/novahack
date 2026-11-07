import { DAYS, DAYS_LONG, HOURS } from "@/data/mock";
import { hourLabel, hourShort, type HeatmapData, type Metric } from "@/lib/analytics";
import { heatColor, heatText } from "@/lib/format";
import { useApp } from "@/app/state";
import { cn } from "@/lib/utils";

export const metricValue = (metric: Metric, v: number) =>
  metric === "revenue" ? (v >= 1000 ? `$${(v / 1000).toFixed(1)}k` : `$${Math.round(v)}`) : metric === "prep" ? v.toFixed(1) : `${Math.round(v)}`;
const metricUnit = (metric: Metric) => (metric === "revenue" ? "in sales" : metric === "prep" ? "min prep" : "orders");

type Props = {
  data: HeatmapData;
  metric: Metric;
  compact?: boolean;
  selected?: { dow: number; hour: number } | null;
  onCellTap?: (dow: number, hour: number) => void;
  callouts?: boolean;
  highlightDow?: number;
};

/** Days × hours heatmap as a CSS grid. Light → deep DoorDash red by volume. */
export function HeatmapGrid({ data, metric, compact, selected, onCellTap, callouts = !compact, highlightDow }: Props) {
  const { theme } = useApp();
  const dark = theme === "dark";
  const span = Math.max(1e-6, data.max - data.min);
  const t = (v: number) => (v - data.min) / span;
  const col = (hour: number) => HOURS.indexOf(hour) + 2;

  return (
    <div
      className={cn("relative grid h-full w-full", compact ? "max-h-[210px] gap-[3px]" : "gap-1.5")}
      style={{ gridTemplateColumns: `${compact ? "28px" : "52px"} repeat(${HOURS.length}, minmax(0, 1fr))`, gridTemplateRows: `${compact ? "14px" : "22px"} repeat(7, minmax(${compact ? "12px" : "0"}, 1fr))` }}
      role="grid"
      aria-label="Orders by day and hour"
    >
      <div />
      {HOURS.map((h, i) => (
        <div key={h} className={cn("flex items-end justify-center font-medium text-muted-foreground tabular", compact ? "text-[9px]" : "text-xs")}>
          {compact ? (i % 3 === 0 ? hourShort(h) : "") : hourShort(h)}
        </div>
      ))}
      {data.cells.map((row, dow) => [
        <div key={`l${dow}`} className={cn("flex items-center font-semibold", compact ? "text-[10px] leading-none text-muted-foreground" : "text-sm", highlightDow === dow && "text-primary")} style={{ gridRow: dow + 2, gridColumn: 1 }}>
          {DAYS[dow]}
        </div>,
        ...row.map((c) => {
          const tt = t(c.value);
          const isSel = selected?.dow === c.dow && selected?.hour === c.hour;
          const label = `${DAYS_LONG[c.dow]} ${hourLabel(c.hour)}: ${metricValue(metric, c.value)} ${metricUnit(metric)}${c.predicted ? " (predicted)" : ""}`;
          const style = {
            gridRow: dow + 2,
            gridColumn: col(c.hour),
            background: heatColor(tt, dark),
            color: heatText(tt, dark),
            outline: c.predicted ? `1.5px dashed ${dark ? "rgb(255 255 255 / 0.35)" : "rgb(25 25 25 / 0.28)"}` : undefined,
            outlineOffset: c.predicted ? "-3px" : undefined,
          } as const;
          return compact ? (
            <div key={`${dow}-${c.hour}`} className="min-h-2 rounded-[4px]" style={style} title={label} />
          ) : (
            <button
              key={`${dow}-${c.hour}`}
              type="button"
              aria-label={label}
              onClick={() => onCellTap?.(c.dow, c.hour)}
              className={cn(
                "relative flex min-h-12 items-center justify-center rounded-lg text-[13px] font-semibold tabular transition-[transform,box-shadow] duration-150 active:scale-95 focus-visible:outline-none",
                isSel && "z-10 scale-[1.06] shadow-[0_0_0_3px_var(--card),0_0_0_5px_var(--foreground)]",
              )}
              style={style}
            >
              {metricValue(metric, c.value)}
            </button>
          );
        }),
      ])}

      {callouts && (
        <>
          <Callout dow={data.peak.dow} start={col(data.peak.start)} kind="peak" label={`Peak · ${metricValue(metric, data.peak.value / (metric === "prep" ? 2 : 1))}${metric === "orders" ? " orders" : ""}`} />
          <Callout dow={data.slow.dow} start={col(data.slow.start)} kind="slow" label="Quietest" />
        </>
      )}
    </div>
  );
}

function Callout({ dow, start, kind, label }: { dow: number; start: number; kind: "peak" | "slow"; label: string }) {
  const above = dow > 0;
  return (
    <div
      className={cn("pointer-events-none relative z-20 rounded-[10px]", kind === "peak" ? "border-[2.5px] border-foreground" : "border-2 border-dashed border-muted-foreground")}
      style={{ gridRow: dow + 2, gridColumn: `${start} / span 2`, margin: "-3px" }}
    >
      <span
        className={cn(
          "absolute left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full px-2.5 py-0.5 text-[11px] font-bold shadow-sm",
          above ? "-top-3.5" : "-bottom-3.5",
          kind === "peak" ? "bg-foreground text-background" : "border border-border bg-card text-muted-foreground",
        )}
      >
        {label}
      </span>
    </div>
  );
}

export function HeatLegend({ metric, min, max, predicted }: { metric: Metric; min: number; max: number; predicted?: boolean }) {
  const { theme } = useApp();
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs font-medium text-muted-foreground">
      <div className="flex items-center gap-2">
        <span className="tabular">{metricValue(metric, min)}</span>
        <div className="h-2.5 w-36 rounded-full" style={{ background: `linear-gradient(90deg, ${[0, 0.33, 0.66, 1].map((x) => heatColor(x, theme === "dark")).join(",")})` }} />
        <span className="tabular">{metricValue(metric, max)}</span>
        <span>{metricUnit(metric)} / hour</span>
      </div>
      <span className="flex items-center gap-1.5">
        <span className="inline-block h-3.5 w-5 rounded-[4px] border-[2.5px] border-foreground" /> Peak 2 hours
      </span>
      <span className="flex items-center gap-1.5">
        <span className="inline-block h-3.5 w-5 rounded-[4px] border-2 border-dashed border-muted-foreground" /> Quietest 2 hours
      </span>
      {predicted && (
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3.5 w-5 rounded-[4px] bg-muted outline-[1.5px] outline-dashed outline-muted-foreground" style={{ outlineOffset: -2 }} /> Predicted
        </span>
      )}
    </div>
  );
}
