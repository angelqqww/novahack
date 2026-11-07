import { useMemo, useState } from "react";
import { Sparkles } from "lucide-react";
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis, Area, AreaChart } from "recharts";
import { toast } from "sonner";
import { useApp } from "@/app/state";
import { api } from "@/data/api";
import { useResource } from "@/hooks/useResource";
import { Card } from "@/components/Card";
import { BadgeChip, MenuItemCard, MenuItemSkeleton } from "@/components/MenuItemCard";
import { FoodPhoto } from "@/components/FoodPhoto";
import { Trend } from "@/components/Trend";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/segmented";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { hourLabel, itemDetail, sortMenu, type SortKey } from "@/lib/analytics";
import { DAYS_LONG } from "@/data/mock";
import { fmtInt, fmtUsd } from "@/lib/format";

export function MenuScreen() {
  const { ctx } = useApp();
  const [sort, setSort] = useState<SortKey>("orders");
  const [open, setOpen] = useState<string | null>(null);
  const menu = useResource("menu", () => api.menu(ctx), (d) => d.every((p) => p.orders7d === 0));
  const sorted = useMemo(() => (menu.data ? sortMenu(menu.data, sort) : []), [menu.data, sort]);
  const ranks = useMemo(() => new Map(menu.data ? sortMenu(menu.data, "orders").map((p, i) => [p.item.id, i + 1]) : []), [menu.data]);

  const top2 = menu.data ? sortMenu(menu.data, "orders").slice(0, 2) : [];
  const total = menu.data?.reduce((a, p) => a + p.orders7d, 0) ?? 1;
  const takeaway = top2.length === 2 ? `${top2[0].item.name} and ${top2[1].item.name} make up ${Math.round(((top2[0].orders7d + top2[1].orders7d) / total) * 100)}% of items sold this week.` : undefined;

  return (
    <div className="h-full overflow-y-auto p-5">
      <Card
        title="Menu performance · last 7 days"
        takeaway={takeaway}
        status={menu.status}
        onRetry={menu.retry}
        padded
        className="mb-4"
        empty={{ title: "No sales in the last 7 days", text: "Menu performance appears after your first week of orders." }}
        right={
          <Segmented
            aria-label="Sort menu"
            value={sort}
            onChange={setSort}
            options={[
              { value: "orders", label: "Most ordered" },
              { value: "revenue", label: "Revenue" },
              { value: "trending", label: "Trending" },
              { value: "least", label: "Least ordered" },
            ]}
          />
        }
        skeleton={<div />}
      >
        <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
          <span>Badges:</span>
          <span><b className="text-foreground">Star</b> top 3 by orders</span>·
          <span><b className="text-foreground">Rising</b> growing faster than the rest of the menu</span>·
          <span><b className="text-foreground">Slow mover</b> bottom 2</span>·
          <span><b className="text-foreground">Often sold out</b> 3+ sell-outs in 4 weeks</span>
        </div>
      </Card>

      <div className="grid grid-cols-3 gap-4 xl:grid-cols-4">
        {menu.status === "loading" && Array.from({ length: 8 }, (_, i) => <MenuItemSkeleton key={i} />)}
        {menu.status === "ready" && sorted.map((p) => <MenuItemCard key={p.item.id} perf={p} rank={ranks.get(p.item.id)} onOpen={() => setOpen(p.item.id)} />)}
      </div>
      <ItemSheet id={open} onClose={() => setOpen(null)} />
    </div>
  );
}

function ItemSheet({ id, onClose }: { id: string | null; onClose: () => void }) {
  const { ctx } = useApp();
  const det = useMemo(() => (id ? itemDetail(ctx, id) : null), [ctx, id]);
  const first = det?.weekly[0]?.orders ?? 0;
  const last = det?.weekly[det.weekly.length - 1]?.orders ?? 0;
  const growth = first ? ((last - first) / first) * 100 : 0;
  return (
    <Sheet open={!!id} onOpenChange={(o) => !o && onClose()}>
      <SheetContent width="w-[540px]">
        {det && (
          <div className="flex h-full flex-col overflow-y-auto">
            <div className="relative">
              <FoodPhoto src={det.item.photo} alt={det.item.name} className="aspect-[16/10] w-full" rounded="rounded-none" />
              {det.perf.badge && <BadgeChip badge={det.perf.badge} className="absolute bottom-4 left-6" />}
            </div>
            <div className="p-6">
              <div className="flex items-baseline justify-between gap-3">
                <SheetTitle className="text-2xl">{det.item.name}</SheetTitle>
                <span className="text-lg font-semibold text-muted-foreground tabular">{fmtUsd(det.item.price, 2)}</span>
              </div>
              <SheetDescription className="mt-1">{det.item.category} · about {det.item.prepMin} min to prep</SheetDescription>

              <div className="mt-4 grid grid-cols-3 gap-3">
                <Mini label="Orders · 7 days" value={fmtInt(det.perf.orders7d)} extra={<Trend pct={det.perf.trendPct} />} />
                <Mini label="Revenue · 7 days" value={fmtUsd(det.perf.revenue7d)} />
                <Mini label="Busiest" value={hourLabel(det.peakHour.hour)} extra={<span className="text-xs text-muted-foreground">{DAYS_LONG[det.bestDow]}s</span>} />
              </div>

              <Section title="Orders over time" takeaway={`${growth >= 0 ? "Up" : "Down"} ${Math.abs(Math.round(growth))}% over ${det.weekly.length} weeks.`}>
                <div className="h-36">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={det.weekly} margin={{ top: 6, right: 4, bottom: 0, left: -24 }}>
                      <defs>
                        <linearGradient id="itemArea" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.25} />
                          <stop offset="100%" stopColor="var(--primary)" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} interval={1} />
                      <YAxis tickLine={false} axisLine={false} tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} />
                      <Tooltip content={<Tip unit="orders" prefix="Week of " />} cursor={{ stroke: "var(--border)" }} />
                      <Area type="monotone" dataKey="orders" stroke="var(--primary)" strokeWidth={2.5} fill="url(#itemArea)" animationDuration={600} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </Section>

              <Section title="Busiest hours" takeaway={`Peaks around ${hourLabel(det.peakHour.hour)}, about ${det.peakHour.orders.toFixed(1)} an hour.`}>
                <div className="h-32">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={det.byHour} margin={{ top: 6, right: 4, bottom: 0, left: -24 }}>
                      <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} interval={1} />
                      <YAxis tickLine={false} axisLine={false} tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} />
                      <Tooltip content={<Tip unit="per hour" />} cursor={{ fill: "var(--muted)" }} />
                      <Bar dataKey="orders" radius={[5, 5, 0, 0]} animationDuration={600}>
                        {det.byHour.map((h) => (
                          <Cell key={h.hour} fill={h.hour === det.peakHour.hour ? "var(--primary)" : "var(--border)"} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </Section>

              <Section title="Often ordered with" takeaway={det.pairings[0] ? `${det.pairings[0].pct}% of these orders add ${det.pairings[0].item.name}.` : undefined}>
                <div className="grid grid-cols-3 gap-3">
                  {det.pairings.map((p) => (
                    <div key={p.itemId} className="overflow-hidden rounded-xl border border-border">
                      <FoodPhoto src={p.item.photo} alt={p.item.name} className="aspect-[4/3] w-full" rounded="rounded-none" />
                      <div className="p-2.5">
                        <div className="truncate text-sm font-semibold">{p.item.name}</div>
                        <div className="text-xs text-muted-foreground tabular">in {p.pct}% of orders</div>
                      </div>
                    </div>
                  ))}
                </div>
              </Section>

              <div className="mt-6 rounded-2xl bg-primary-soft p-4">
                <div className="flex items-center gap-1.5 text-sm font-bold text-primary">
                  <Sparkles className="h-4 w-4" /> AI suggestion
                </div>
                <p className="mt-1 text-[15px] font-medium leading-snug">{det.suggestion}</p>
                <Button
                  className="mt-3"
                  onClick={() =>
                    toast.success(det.perf.badge === "Often sold out" ? "Prep target raised" : "Combo draft created", {
                      description: det.perf.badge === "Often sold out" ? `${det.item.name}: +25% prep on busy days.` : `${det.item.name} + ${det.pairings[0]?.item.name ?? "a drink"}. Review it in your DoorDash promotions.`,
                    })
                  }
                >
                  {det.perf.badge === "Often sold out" ? "Raise prep target" : "Create combo"}
                </Button>
              </div>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function Section({ title, takeaway, children }: { title: string; takeaway?: string; children: React.ReactNode }) {
  return (
    <div className="mt-6">
      <h3 className="text-[15px] font-semibold text-muted-foreground">{title}</h3>
      {takeaway && <p className="mb-2 text-base font-bold">{takeaway}</p>}
      {children}
    </div>
  );
}

function Mini({ label, value, extra }: { label: string; value: string; extra?: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-border p-3">
      <div className="text-xs font-semibold text-muted-foreground">{label}</div>
      <div className="mt-0.5 text-xl font-bold tabular">{value}</div>
      {extra && <div className="mt-1">{extra}</div>}
    </div>
  );
}

function Tip({ active, payload, unit, prefix = "" }: { active?: boolean; payload?: { value: number; payload: { label: string } }[]; unit: string; prefix?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-border bg-card px-3 py-2 text-sm shadow-[var(--shadow-sheet)]">
      <div className="text-muted-foreground">
        {prefix}
        {payload[0].payload.label}
      </div>
      <div className="font-semibold tabular">
        {payload[0].value.toFixed(payload[0].value < 10 ? 1 : 0)} {unit}
      </div>
    </div>
  );
}
