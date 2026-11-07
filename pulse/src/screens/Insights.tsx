import { ArrowRight, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { useState } from "react";
import { useApp } from "@/app/state";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { api } from "@/data/api";
import { useResource } from "@/hooks/useResource";
import { Card, EmptyState, ErrorState } from "@/components/Card";
import { KpiTile, KpiTileSkeleton } from "@/components/KpiTile";
import { InsightCard, InsightSkeleton } from "@/components/InsightCard";
import { HeatmapGrid } from "@/components/HeatmapGrid";
import { FoodPhoto } from "@/components/FoodPhoto";
import { Trend } from "@/components/Trend";
import { Button } from "@/components/ui/button";
import { sortMenu, totalOrdersAnalyzed, weeksOfData, type Insight } from "@/lib/analytics";
import { fmtInt } from "@/lib/format";

export function InsightsScreen() {
  const { ctx, go, dataMode, accept } = useApp();
  const [allOpen, setAllOpen] = useState(false);
  const kpis = useResource("kpis", () => api.kpis(ctx), (d) => d[0].value === 0);
  const insights = useResource("insights", () => api.insights(ctx), (d) => d.length === 0);
  const heat = useResource("heat:orders:4w", () => api.heatmap(ctx, "orders", "4w"));
  const menu = useResource("menu", () => api.menu(ctx));

  const onAction = (i: Insight) => {
    accept(i.id);
    const msgs: Record<Insight["action"]["kind"], [string, string]> = {
      plan_prep: ["Added to the prep plan", "Extra ramen bowls and broth are on the rain-day plan."],
      add_to_order: ["Pork belly added to your order list", "+20% for the weekend. Review it in Forecast."],
      create_promo: ["Promo draft created", "Late-night Karaage + Yuzu Lemonade, Fri–Sat 9–11pm."],
      plan_staff: ["Shift request drafted", "We'll remind you to post it when you build next week's schedule."],
    };
    const [title, description] = msgs[i.action.kind];
    toast.success(title, { description, action: i.action.kind === "create_promo" ? undefined : { label: "View", onClick: () => go("forecast") } });
  };

  const top = menu.data ? sortMenu(menu.data, "orders").slice(0, 6) : [];
  const totalWeek = menu.data?.reduce((a, p) => a + p.orders7d, 0) ?? 0;

  return (
    <div className="flex h-full flex-col gap-4 p-5">
      {dataMode === "learning" && <LearningBanner weeks={weeksOfData(ctx)} orders={totalOrdersAnalyzed(ctx)} />}

      {/* KPIs */}
      <div className="grid shrink-0 grid-cols-4 gap-4">
        {kpis.status === "loading" && Array.from({ length: 4 }, (_, i) => <KpiTileSkeleton key={i} />)}
        {kpis.status === "ready" && kpis.data!.map((k) => <KpiTile key={k.id} kpi={k} />)}
        {kpis.status === "empty" && (
          <div className="col-span-4 rounded-2xl border border-border bg-card p-2">
            <EmptyState compact title="No orders yet today" text="Today's numbers appear after your first order." />
          </div>
        )}
        {kpis.status === "error" && (
          <div className="col-span-4 rounded-2xl border border-border bg-card p-2">
            <ErrorState compact onRetry={kpis.retry} />
          </div>
        )}
      </div>

      {/* AI insights + mini heatmap */}
      <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)] gap-4">
        <Card
          title={
            <span className="inline-flex items-center gap-1.5 text-foreground">
              <Sparkles className="h-4 w-4 text-primary" /> AI Insights
            </span>
          }
          right={
            insights.data && insights.data.length > 2 ? (
              <Button variant="ghost" size="sm" className="-my-3 h-12 text-primary" onClick={() => setAllOpen(true)}>
                See all {insights.data.length} <ArrowRight />
              </Button>
            ) : (
              <span className="text-xs font-medium text-muted-foreground">Updated 2 min ago</span>
            )
          }
          status={insights.status}
          onRetry={insights.retry}
          empty={{ title: "No insights yet", text: "Pulse needs about 2 weeks of orders to spot patterns.", icon: <Sparkles className="h-5 w-5" /> }}
          skeleton={
            <div className="space-y-2.5">
              {Array.from({ length: 3 }, (_, i) => (
                <InsightSkeleton key={i} />
              ))}
            </div>
          }
          bodyClassName="overflow-y-auto no-scrollbar"
          className="py-5"
          compactStates
        >
          <div className="space-y-2.5">
            {insights.data?.slice(0, 3).map((i, idx) => (
              <div key={i.id} className={idx === 2 ? (dataMode === "learning" ? "hidden" : "hidden xl:block") : undefined}>
                <InsightCard insight={i} onAction={onAction} compact />
              </div>
            ))}
          </div>
        </Card>
        <Sheet open={allOpen} onOpenChange={setAllOpen}>
          <SheetContent width="w-[560px]">
            <div className="flex h-full flex-col overflow-y-auto p-6 pt-7">
              <div className="pr-14">
                <SheetTitle className="flex items-center gap-2 text-2xl">
                  <Sparkles className="h-5 w-5 text-primary" /> AI Insights
                </SheetTitle>
                <SheetDescription className="mt-1 text-[15px]">What Pulse found in your last {weeksOfData(ctx)} weeks of orders.</SheetDescription>
              </div>
              <div className="mt-5 space-y-3">
                {insights.data?.map((i) => (
                  <InsightCard key={i.id} insight={i} onAction={onAction} />
                ))}
              </div>
            </div>
          </SheetContent>
        </Sheet>

        <button type="button" onClick={() => go("heatmap")} className="min-h-0 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-2xl">
          <Card
            title="Busiest hours · last 4 weeks"
            takeaway={heat.data?.takeaway.replace(/, about.*$/, ".")}
            status={heat.status}
            onRetry={heat.retry}
            className="h-full"
            bodyClassName="flex flex-col"
            compactStates
            empty={{ title: "Not enough orders yet", text: "The heatmap fills in as orders come in." }}
            right={<ArrowRight className="h-5 w-5 text-muted-foreground" />}
          >
            {heat.data && (
              <div className="flex min-h-0 flex-1 flex-col justify-between gap-3">
                <div className="min-h-0 flex-1">
                  <HeatmapGrid data={heat.data} metric="orders" compact />
                </div>
                <span className="inline-flex items-center gap-1 text-sm font-semibold text-primary">
                  Open heatmap <ArrowRight className="h-4 w-4" />
                </span>
              </div>
            )}
          </Card>
        </button>
      </div>

      {/* Top sellers */}
      <Card
        title="Top sellers this week"
        takeaway={top[0] ? `${top[0].item.name} led with ${fmtInt(top[0].orders7d)} orders, ${Math.round((top[0].orders7d / Math.max(1, totalWeek)) * 100)}% of all items sold.` : undefined}
        right={
          <Button variant="ghost" size="sm" className="-my-2 h-12 text-primary" onClick={() => go("menu")}>
            All items <ArrowRight />
          </Button>
        }
        status={menu.status}
        onRetry={menu.retry}
        className="shrink-0 py-5"
        compactStates
        empty={{ title: "No sales this week yet" }}
        skeleton={
          <div className="flex gap-3">
            {Array.from({ length: 4 }, (_, i) => (
              <div key={i} className="skeleton h-[88px] w-[250px] shrink-0 rounded-xl" />
            ))}
          </div>
        }
      >
        <div className="no-scrollbar -mx-6 flex snap-x gap-3 overflow-x-auto px-6">
          {top.map((p, i) => (
            <button
              key={p.item.id}
              type="button"
              onClick={() => go("menu")}
              className="flex w-[250px] shrink-0 snap-start items-center gap-3 rounded-xl border border-border bg-card p-2 pr-3 text-left transition-transform duration-150 active:scale-[0.98]"
            >
              <div className="relative">
                <FoodPhoto src={p.item.photo} alt={p.item.name} className="h-[72px] w-[72px]" />
                <span className="absolute -left-1.5 -top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-foreground text-xs font-bold text-background">{i + 1}</span>
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[15px] font-semibold">{p.item.name}</div>
                <div className="mt-0.5 flex items-center gap-2">
                  <span className="text-xl font-bold tabular">{fmtInt(p.orders7d)}</span>
                  <span className="text-xs text-muted-foreground">orders</span>
                </div>
                <Trend pct={p.trendPct} className="mt-0.5" />
              </div>
            </button>
          ))}
        </div>
      </Card>
    </div>
  );
}

function LearningBanner({ weeks, orders }: { weeks: number; orders: number }) {
  return (
    <div className="flex shrink-0 items-center gap-4 rounded-2xl border border-border bg-card px-5 py-2.5 shadow-[var(--shadow-card)]">
      <div className="pulse-ring flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary-soft text-primary">
        <Sparkles className="h-[18px] w-[18px]" />
      </div>
      <div className="min-w-0 flex-1 truncate text-[15px]">
        <b>Pulse is learning your patterns. {weeks} weeks of data analyzed.</b>{" "}
        <span className="text-muted-foreground">{fmtInt(orders)} orders so far; forecasts sharpen after 8 weeks.</span>
      </div>
      <div className="flex w-44 shrink-0 items-center gap-2">
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
          <div className="h-full rounded-full bg-primary transition-all duration-500" style={{ width: `${(weeks / 8) * 100}%` }} />
        </div>
        <span className="text-xs font-semibold text-muted-foreground tabular">{weeks} of 8 wks</span>
      </div>
    </div>
  );
}
