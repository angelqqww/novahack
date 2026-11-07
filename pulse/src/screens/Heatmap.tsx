import { useState } from "react";
import { Bike, Clock, ReceiptText, ShieldCheck, Sparkles, TrendingUp } from "lucide-react";
import { useApp } from "@/app/state";
import { api } from "@/data/api";
import { useResource } from "@/hooks/useResource";
import { Card } from "@/components/Card";
import { HeatLegend, HeatmapGrid } from "@/components/HeatmapGrid";
import { FoodPhoto } from "@/components/FoodPhoto";
import { Segmented } from "@/components/ui/segmented";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { DAYS_LONG } from "@/data/mock";
import { cellDetail, hourLabel, type HeatmapData, type Metric, type Range } from "@/lib/analytics";
import { fmtInt, fmtUsd } from "@/lib/format";
import { cn } from "@/lib/utils";

export function HeatmapScreen() {
  const { ctx, dataMode } = useApp();
  const [metric, setMetric] = useState<Metric>("orders");
  const [range, setRange] = useState<Range>("4w");
  const [sel, setSel] = useState<{ dow: number; hour: number } | null>(null);
  const heat = useResource(`heat:${metric}:${range}`, () => api.heatmap(ctx, metric, range));
  const d = heat.data;

  return (
    <div className="flex h-full flex-col gap-4 p-5">
      <Card
        title={range === "next" ? "Predicted next week" : `Busy patterns · last ${range === "4w" ? 4 : 12} weeks`}
        takeaway={d?.takeaway}
        status={heat.status}
        onRetry={heat.retry}
        className="min-h-0 flex-1"
        bodyClassName="flex flex-col gap-4"
        empty={{ title: "Not enough orders yet", text: "The heatmap fills in as orders come in." }}
        right={
          <div className="flex flex-col items-end gap-2">
            <div className="flex items-center gap-2">
              <Segmented
                aria-label="Metric"
                value={metric}
                onChange={setMetric}
                options={[
                  { value: "orders", label: "Orders" },
                  { value: "revenue", label: "Revenue" },
                  { value: "prep", label: "Prep time" },
                ]}
              />
              <Segmented
                aria-label="Time range"
                value={range}
                onChange={setRange}
                options={[
                  { value: "4w", label: "Last 4 weeks" },
                  { value: "12w", label: "Last 12 weeks", disabled: dataMode === "learning" },
                  { value: "next", label: <><Sparkles className="h-3.5 w-3.5" /> Predicted next week</> },
                ]}
              />
            </div>
            {range === "next" && d?.confidence && (
              <span className={cn("inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold", d.confidence.label === "High" ? "bg-success-soft text-success" : d.confidence.label === "Medium" ? "bg-warning-soft text-[#8a6100] dark:text-warning" : "bg-danger-soft text-danger")}>
                <ShieldCheck className="h-3.5 w-3.5" /> {d.confidence.label} confidence · ±{d.confidence.pct}% · from {d.weeksUsed} weeks of data
              </span>
            )}
          </div>
        }
        skeleton={<div className="skeleton h-full min-h-80 w-full rounded-xl" />}
      >
        {d && (
          <>
            <div className="min-h-0 flex-1 pt-3">
              <HeatmapGrid data={d} metric={metric} selected={sel} onCellTap={(dow, hour) => setSel({ dow, hour })} highlightDow={d.peak.dow} />
            </div>
            <div className="flex items-center justify-between gap-4">
              <HeatLegend metric={metric} min={d.min} max={d.max} predicted={range === "next"} />
              <span className="text-xs font-medium text-muted-foreground">Tap any hour for details</span>
            </div>
          </>
        )}
      </Card>
      <CellSheet sel={sel} onClose={() => setSel(null)} range={range} data={d} />
    </div>
  );
}

function CellSheet({ sel, onClose, range, data }: { sel: { dow: number; hour: number } | null; onClose: () => void; range: Range; data?: HeatmapData }) {
  const { ctx } = useApp();
  const det = sel ? cellDetail(ctx, sel.dow, sel.hour, range) : null;
  const peakish = det && data ? det.orders >= (data.peak.value / 2) * 0.8 : false;
  const quiet = det ? det.vsAvgPct < -35 : false;
  return (
    <Sheet open={!!sel} onOpenChange={(o) => !o && onClose()}>
      <SheetContent>
        {det && sel && (
          <div className="flex h-full flex-col overflow-y-auto p-6 pt-7">
            <div className="pr-14">
              <div className="text-sm font-semibold text-muted-foreground">{range === "next" ? "Predicted · next week" : `Average · last ${range === "12w" ? 12 : 4} weeks`}</div>
              <SheetTitle className="mt-0.5 text-2xl">
                {DAYS_LONG[sel.dow]} · {hourLabel(sel.hour)}–{hourLabel(sel.hour + 1)}
              </SheetTitle>
              <SheetDescription className="mt-1 text-[15px]">
                {peakish ? "One of your busiest hours of the week." : quiet ? "A quiet hour, good for prep or a promo." : `${det.vsAvgPct >= 0 ? "Busier" : "Quieter"} than a typical ${hourLabel(sel.hour)} by ${Math.abs(Math.round(det.vsAvgPct))}%.`}
              </SheetDescription>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-3">
              <Tile icon={<ReceiptText className="h-4 w-4" />} label={range === "next" ? "Orders expected" : "Orders that hour"} value={fmtInt(det.orders)} sub={det.range ? `Likely ${fmtInt(det.range[0])}–${fmtInt(det.range[1])}` : `${fmtUsd(det.revenue)} in sales`} />
              <Tile icon={<Clock className="h-4 w-4" />} label="Avg prep time" value={`${det.prepMin.toFixed(1)} min`} sub={det.prepMin > 12.5 ? "Slower than usual" : "On pace"} tone={det.prepMin > 12.5 ? "warn" : undefined} />
              <Tile icon={<Bike className="h-4 w-4" />} label="Dashers waiting" value={det.dashersWaiting.toFixed(1)} sub="on average at the counter" tone={det.dashersWaiting >= 2 ? "warn" : undefined} />
              <Tile icon={<TrendingUp className="h-4 w-4" />} label="vs typical hour" value={`${det.vsAvgPct >= 0 ? "+" : ""}${Math.round(det.vsAvgPct)}%`} sub={`compared with other ${hourLabel(sel.hour)}s`} />
            </div>

            <h3 className="mt-6 text-[15px] font-semibold text-muted-foreground">Top items this hour</h3>
            <div className="mt-2 space-y-2">
              {det.topItems.map(({ item, avg }, i) => (
                <div key={item.id} className="flex items-center gap-3 rounded-xl border border-border p-2 pr-4">
                  <FoodPhoto src={item.photo} alt={item.name} className="h-14 w-14" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-semibold">{item.name}</div>
                    <div className="text-sm text-muted-foreground">#{i + 1} this hour</div>
                  </div>
                  <div className="text-right">
                    <div className="text-lg font-bold tabular">{avg.toFixed(1)}</div>
                    <div className="text-xs text-muted-foreground">per hour</div>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-6 rounded-2xl bg-primary-soft p-4">
              <div className="flex items-center gap-1.5 text-sm font-bold text-primary">
                <Sparkles className="h-4 w-4" /> Pulse suggests
              </div>
              <p className="mt-1 text-[15px] font-medium leading-snug">
                {peakish
                  ? `Have broth and ${det.topItems[0].item.name.split(" ")[0].toLowerCase()} prep ready by ${hourLabel(sel.hour - 1)}, and keep a third cook on the line until ${hourLabel(sel.hour + 2)}.`
                  : quiet
                    ? `Use this hour to prep for the next rush, or run a ${DAYS_LONG[sel.dow]} happy-hour deal to bring in more orders.`
                    : `Standard staffing works here. Prep ${det.topItems[0].item.name} ahead; it's your top seller this hour.`}
              </p>
            </div>
            <div className="h-6 shrink-0" />
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function Tile({ icon, label, value, sub, tone }: { icon: React.ReactNode; label: string; value: string; sub: string; tone?: "warn" }) {
  return (
    <div className="rounded-2xl border border-border p-4">
      <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className="mt-1 text-[28px] font-bold leading-none tabular">{value}</div>
      <div className={cn("mt-1.5 text-xs", tone === "warn" ? "font-semibold text-[#a77400] dark:text-warning" : "text-muted-foreground")}>{sub}</div>
    </div>
  );
}
