import { useEffect, useMemo, useState } from "react";
import { ArrowUp, ArrowDown, Cloud, CloudRain, Download, Sparkles, Sun, Target, Users, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { useApp } from "@/app/state";
import { api } from "@/data/api";
import { useResource } from "@/hooks/useResource";
import { Card } from "@/components/Card";
import { ForecastChart } from "@/components/ForecastChart";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DAYS, DAYS_LONG } from "@/data/mock";
import { forecastDays, type ShoppingRow } from "@/lib/analytics";
import { fmtInt } from "@/lib/format";
import { cn } from "@/lib/utils";

export function ForecastScreen() {
  const { ctx, accepted } = useApp();
  const fc = useResource("forecast", () => api.forecast(ctx));
  const shop = useResource("shopping", () => api.shopping(ctx), (d) => d.length === 0);
  const prep = useResource("prep", () => api.prepPlan(ctx));
  const staff = useResource("staff", () => api.staffing(ctx));

  const future = fc.data?.points.filter((p) => p.actual === undefined && p.label !== "Today") ?? [];
  const busiest = future.reduce<(typeof future)[number] | null>((b, p) => (!b || (p.predicted ?? 0) > (b.predicted ?? 0) ? p : b), null);
  const weekTotal = future.reduce((a, p) => a + (p.predicted ?? 0), 0);

  return (
    <div className="h-full overflow-y-auto p-5">
      <div className="grid grid-cols-[minmax(0,1fr)_300px] gap-4">
        <Card
          title="Demand forecast · next 7 days"
          takeaway={busiest ? `Next ${DAYS_LONG[busiest.dow]} should be your busiest day, about ${fmtInt(busiest.predicted!)} orders.` : undefined}
          status={fc.status}
          onRetry={fc.retry}
          right={
            fc.data?.accuracy ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-success-soft px-3 py-1.5 text-xs font-semibold text-success">
                <Target className="h-3.5 w-3.5" /> {fc.data.accuracy}% accurate last week
              </span>
            ) : undefined
          }
          skeleton={<div className="skeleton h-[300px] w-full rounded-xl" />}
          empty={{ title: "Not enough history to forecast", text: "Forecasts start after 2 weeks of orders." }}
        >
          {fc.data && (
            <>
              <ForecastChart points={fc.data.points} height={290} />
              <div className="mt-2 flex flex-wrap items-center gap-5 text-xs font-medium text-muted-foreground">
                <Legend swatch={<span className="h-0.5 w-6 rounded bg-foreground" />} label="Actual orders" />
                <Legend swatch={<span className="h-0 w-6 border-t-[2.5px] border-dashed border-primary" />} label="Predicted" />
                <Legend swatch={<span className="h-3 w-6 rounded bg-primary/15" />} label="80% confidence range" />
                <Legend swatch={<CloudRain className="h-4 w-4 text-[#1f6feb]" />} label="Rain forecast" />
              </div>
            </>
          )}
        </Card>

        <Card title="This week" takeaway={fc.data ? `About ${fmtInt(weekTotal)} orders expected.` : undefined} status={fc.status} onRetry={fc.retry}>
          {fc.data && (
            <div className="space-y-1">
              {fc.data.weather.map((w) => {
                const p = future.find((x) => x.date === w.date);
                const Icon = w.condition === "rain" ? CloudRain : w.condition === "cloud" ? Cloud : Sun;
                return (
                  <div key={w.date} className={cn("flex items-center gap-3 rounded-xl px-3 py-2", w.condition === "rain" && "bg-[#e8f1ff] dark:bg-[#14243d]")}>
                    <span className="w-9 text-sm font-semibold">{DAYS[w.dow]}</span>
                    <Icon className={cn("h-5 w-5", w.condition === "rain" ? "text-[#1f6feb] dark:text-[#6aa6ff]" : w.condition === "sun" ? "text-warning" : "text-muted-foreground")} />
                    <span className="w-10 text-sm text-muted-foreground tabular">{w.highF}°</span>
                    <span className="ml-auto text-[15px] font-bold tabular">{fmtInt(p?.predicted ?? 0)}</span>
                    <span className="w-12 text-xs text-muted-foreground">orders</span>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </div>

      <div className="mt-4 grid grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)] gap-4">
        <ShoppingList rows={shop.data} status={shop.status} onRetry={shop.retry} porkFromInsight={accepted.includes("soldout")} />
        <div className="flex flex-col gap-4">
          <Card
            title="Prep plan"
            takeaway={prep.data ? prepTakeaway(prep.data) : undefined}
            status={prep.status}
            onRetry={prep.retry}
            skeleton={<div className="skeleton h-64 w-full rounded-xl" />}
          >
            <div className="divide-y divide-border">
              {prep.data?.map((p) => {
                const planned = p.rain && accepted.includes("rain");
                return (
                  <div key={p.date} className="flex items-center gap-3 py-2.5">
                    <span className="w-24 text-[15px] font-semibold">{p.label}</span>
                    {p.rain ? <CloudRain className="h-4 w-4 shrink-0 text-[#1f6feb] dark:text-[#6aa6ff]" /> : <span className="w-4" />}
                    <span className={cn("min-w-0 flex-1 text-sm", p.flag ? "font-semibold" : "text-muted-foreground")}>{p.note}</span>
                    {planned && (
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-success">
                        <CheckCircle2 className="h-4 w-4" /> Planned
                      </span>
                    )}
                    {p.flag && !planned && <span className="rounded-full bg-primary-soft px-2 py-0.5 text-xs font-bold text-primary tabular">+{p.extra}</span>}
                  </div>
                );
              })}
            </div>
          </Card>
          <Card
            title={
              <span className="inline-flex items-center gap-1.5">
                <Users className="h-4 w-4" /> Staffing
              </span>
            }
            takeaway={staff.data?.length ? `${[...staff.data].sort((a, b) => b.peakOrders - a.peakOrders)[0].text}.` : "Your usual team covers next week."}
            status={staff.status}
            onRetry={staff.retry}
          >
            <div className="space-y-2">
              {staff.data?.map((s) => (
                <StaffRow key={`${s.date}-${s.start}`} text={s.text} detail={`Up to ${s.peakOrders} orders/hr expected; 2 cooks handle about 32.`} />
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

function prepTakeaway(days: { label: string; extra: number; rain: boolean; byTime: string; flag: boolean }[]) {
  const big = [...days].sort((a, b) => b.extra - a.extra)[0];
  return big && big.flag ? `${big.label}: prep ${big.extra} extra ramen bowls by ${big.byTime}${big.rain ? ", rain is forecast" : ""}.` : "Normal prep all week.";
}

function StaffRow({ text, detail }: { text: string; detail: string }) {
  const [sent, setSent] = useState(false);
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border px-4 py-2.5">
      <div className="min-w-0 flex-1">
        <div className="text-[15px] font-semibold">{text}</div>
        <div className="text-xs text-muted-foreground">{detail}</div>
      </div>
      <Button
        variant={sent ? "secondary" : "outline"}
        size="sm"
        className="h-12"
        onClick={() => {
          setSent(true);
          toast.success("Shift request drafted", { description: text });
        }}
      >
        {sent ? "Requested" : "Request shift"}
      </Button>
    </div>
  );
}

function Legend({ swatch, label }: { swatch: React.ReactNode; label: string }) {
  return (
    <span className="inline-flex items-center gap-2">
      {swatch}
      {label}
    </span>
  );
}

function ShoppingList({ rows, status, onRetry, porkFromInsight }: { rows?: ShoppingRow[]; status: "loading" | "ready" | "empty" | "error"; onRetry: () => void; porkFromInsight: boolean }) {
  const { ctx } = useApp();
  const [checked, setChecked] = useState<Set<string>>(new Set());
  // Pre-check the rows Pulse flags (and pork belly if you accepted that AI insight).
  useEffect(() => {
    if (!rows) return;
    setChecked(new Set(rows.filter((r) => r.reason || (porkFromInsight && r.ingredient.id === "pork_belly")).map((r) => r.ingredient.id)));
  }, [rows, porkFromInsight]);
  const pork = rows?.find((r) => r.ingredient.id === "pork_belly");
  const days = useMemo(() => forecastDays(ctx).filter((p) => p.actual === undefined && p.label !== "Today"), [ctx]);
  const span = days.length ? `${DAYS[days[0].dow]}–${DAYS[days[days.length - 1].dow]}` : "next 7 days";

  const exportCsv = () => {
    if (!rows) return;
    const pick = rows.filter((r) => checked.has(r.ingredient.id));
    const lines = [["Ingredient", "Needed", "Unit", "Usual", "On hand", "Order", "Supplier", "Why"], ...pick.map((r) => [r.ingredient.name, r.needed, r.ingredient.unit, r.usual, r.ingredient.onHand, r.toBuy, r.ingredient.supplier, r.reason ?? ""])];
    const csv = lines.map((l) => l.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "sakura-ramen-order-list.csv";
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${pick.length} items`, { description: "sakura-ramen-order-list.csv is ready to send to your suppliers." });
  };

  return (
    <Card
      title={
        <span className="inline-flex items-center gap-1.5">
          <Sparkles className="h-4 w-4 text-primary" /> Smart shopping list · {span}
        </span>
      }
      takeaway={pork ? `Pork belly: ${fmtInt(pork.needed)} lb needed (${pork.delta >= 0 ? "↑" : "↓"}${fmtInt(Math.abs(pork.delta))} lb vs usual).` : undefined}
      status={status}
      onRetry={onRetry}
      right={
        <Button variant="dark" onClick={exportCsv} disabled={!checked.size}>
          <Download /> Export list ({checked.size})
        </Button>
      }
      skeleton={
        <div className="space-y-2">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="skeleton h-14 w-full rounded-xl" />
          ))}
        </div>
      }
      empty={{ title: "Nothing to order", text: "You're stocked for the week." }}
    >
      <div className="mb-1 grid grid-cols-[48px_minmax(0,1fr)_120px_118px] gap-2 px-1 text-xs font-semibold text-muted-foreground">
        <span />
        <span>Ingredient</span>
        <span className="text-right">Needed vs usual</span>
        <span className="text-right">To order</span>
      </div>
      <div className="divide-y divide-border">
        {rows?.map((r) => {
          const on = checked.has(r.ingredient.id);
          const up = r.delta > 0;
          return (
            <label key={r.ingredient.id} className="grid min-h-14 cursor-pointer grid-cols-[48px_minmax(0,1fr)_120px_118px] items-center gap-2 px-1 py-1.5">
              <span className="flex h-12 w-12 items-center justify-center">
                <Checkbox
                  checked={on}
                  onCheckedChange={(v) =>
                    setChecked((s) => {
                      const n = new Set(s);
                      if (v) n.add(r.ingredient.id);
                      else n.delete(r.ingredient.id);
                      return n;
                    })
                  }
                  aria-label={r.ingredient.name}
                />
              </span>
              <span className="min-w-0">
                <span className="block truncate text-[15px] font-semibold">
                  {r.ingredient.name} <span className="font-normal text-muted-foreground">· {fmtInt(r.needed)} {r.ingredient.unit}</span>
                </span>
                <span className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
                  <span className="truncate">{fmtInt(r.ingredient.onHand)} on hand · {r.ingredient.supplier}</span>
                  {(r.reason || (porkFromInsight && r.ingredient.id === "pork_belly")) && (
                    <span className="whitespace-nowrap rounded-full bg-primary-soft px-2 py-0.5 font-semibold text-primary">{porkFromInsight && r.ingredient.id === "pork_belly" ? "From AI insight" : r.reason}</span>
                  )}
                </span>
              </span>
              <span className={cn("inline-flex items-center justify-end gap-0.5 whitespace-nowrap text-sm font-semibold tabular", Math.abs(r.delta) < r.usual * 0.03 ? "text-muted-foreground" : up ? "text-foreground" : "text-success")}>
                {Math.abs(r.delta) >= r.usual * 0.03 && (up ? <ArrowUp className="h-3.5 w-3.5" /> : <ArrowDown className="h-3.5 w-3.5" />)}
                {Math.abs(r.delta) < r.usual * 0.03 ? "as usual" : `${fmtInt(Math.abs(r.delta))} ${r.ingredient.unit}`}
              </span>
              <span className={cn("whitespace-nowrap text-right text-[15px] font-bold tabular", r.toBuy === 0 && "font-medium text-muted-foreground")}>{r.toBuy === 0 ? "Stocked" : `${fmtInt(r.toBuy)} ${r.ingredient.unit}`}</span>
            </label>
          );
        })}
      </div>
    </Card>
  );
}
