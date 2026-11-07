import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, Bike, CheckCircle2, Timer, Clock, Flame, Grid3x3, Layers, Sparkles, Store, TrendingUp, UtensilsCrossed, Zap } from "lucide-react";
import { toast } from "sonner";
import { useApp, useNow } from "@/app/state";
import { api } from "@/data/api";
import { useResource } from "@/hooks/useResource";
import { Card } from "@/components/Card";
import { OrderCard, type OrderStage } from "@/components/OrderCard";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/segmented";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { forecastHour, hourLabel, menuItem, prioritize, priorityLevel, type Factor, type ScoredOrder } from "@/lib/analytics";
import { liveOrders } from "@/data/mock";
import { cn } from "@/lib/utils";

const FACTOR_ICON: Record<Factor["key"], typeof Bike> = { dasher: Bike, quote: Timer, guest: Store, prep: Clock, rush: TrendingUp, batch: Layers, waiting: Clock };

export function LiveOrdersScreen() {
  const { ctx, go } = useApp();
  const now = useNow();
  const q = useResource("queue", () => api.queue(ctx), (d) => d.orders.length === 0);
  const [stage, setStage] = useState<Record<string, OrderStage>>({});
  const [why, setWhy] = useState<ScoredOrder | null>(null);
  const [mode, setMode] = useState<"ai" | "arrival">("ai");
  const [brothStarted, setBrothStarted] = useState(false);

  // Minutes since the data snapshot, so Dasher ETAs and kiosk wait times update live.
  const elapsed = Math.max(0, Math.floor((now.getTime() - ctx.now.getTime()) / 60_000));
  // Re-score every minute so priorities track pickup times as they count down.
  const live = useMemo(() => {
    const base = liveOrders(ctx.now).map((o) => ({ ...o, pickupInMin: o.pickupInMin - elapsed, placedMinAgo: o.placedMinAgo + elapsed }));
    return prioritize({ ...ctx, now: new Date(ctx.now.getTime() + elapsed * 60_000) }, base);
  }, [ctx, elapsed]);
  const rush = q.data ? live.rush : null;

  const list = useMemo(() => {
    if (!q.data) return [];
    const base = mode === "ai" ? live.orders : [...live.orders].sort((a, b) => a.arrivalRank - b.arrivalRank);
    const rank = (o: ScoredOrder) => (stage[o.id] === "ready" ? 2 : stage[o.id] === "cooking" ? 0 : 1);
    return [...base].sort((a, b) => rank(a) - rank(b));
  }, [q.data, live, mode, stage]);
  const queued = list.filter((o) => (stage[o.id] ?? "queued") === "queued");

  const advance = (o: ScoredOrder) => {
    const cur = stage[o.id] ?? "queued";
    const next: OrderStage = cur === "queued" ? "cooking" : "ready";
    setStage((s) => ({ ...s, [o.id]: next }));
    if (next === "ready")
      toast.success(`${o.customer}'s order is ready`, { description: o.channel === "kiosk" ? `Call ${o.customer} to the pickup counter (kiosk ${o.kiosk}).` : `Bagged for ${o.dasherName}.` });
  };

  const curPrep = forecastHour(ctx, ctx.now, ctx.now.getHours(), "prep").mean;
  const batchCount = live.orders.filter((o) => o.batchWith).length;

  return (
    <div className="grid h-full grid-cols-[minmax(0,1fr)_330px] grid-rows-[minmax(0,1fr)] gap-4 p-5">
      <div className="flex min-h-0 flex-col gap-3">
        {rush && rush.inMin <= 45 && (
          <div className={cn("flex shrink-0 items-center gap-4 rounded-2xl border px-5 py-3.5 transition-colors duration-200", brothStarted ? "border-success/30 bg-success-soft" : "border-primary/25 bg-primary-soft")}>
            <div className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-full", brothStarted ? "bg-success text-white" : "pulse-ring bg-primary text-white")}>
              {brothStarted ? <CheckCircle2 className="h-5 w-5" /> : <Flame className="h-5 w-5" />}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[17px] font-bold">{brothStarted ? "Broth prep started. You're ahead of the rush." : `Rush expected in ${rush.inMin} min. Start prepping broth now.`}</div>
              <div className="text-sm text-muted-foreground">
                Forecast: {rush.expected} orders at {hourLabel(rush.hour)} vs {rush.current} this hour. Ramen tickets are moved up so they clear before the wave.
              </div>
            </div>
            {!brothStarted && (
              <Button
                onClick={() => {
                  setBrothStarted(true);
                  toast.success("Broth prep started", { description: `Timer set for ${rush.inMin} min. We'll remind the line at ${hourLabel(rush.hour)}.` });
                }}
              >
                <Zap /> Start broth prep
              </Button>
            )}
          </div>
        )}

        <div className="flex shrink-0 items-center justify-between">
          <div>
            <h1 className="text-xl font-bold tracking-tight">{queued.length} orders in queue</h1>
            <p className="text-sm text-muted-foreground">{mode === "ai" ? "Ranked by Pulse priority score, not arrival time." : "Showing arrival order, the way most tablets do it."}</p>
          </div>
          <Segmented
            aria-label="Queue order"
            value={mode}
            onChange={setMode}
            options={[
              { value: "ai", label: <><Sparkles className="h-3.5 w-3.5" /> Smart order</> },
              { value: "arrival", label: "Arrival order" },
            ]}
          />
        </div>

        <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto pb-2">
          {q.status === "loading" && (
            <div className="space-y-3">
              {Array.from({ length: 5 }, (_, i) => (
                <div key={i} className="skeleton h-[92px] w-full rounded-2xl" />
              ))}
            </div>
          )}
          {q.status !== "loading" && q.status !== "ready" && (
            <Card status={q.status} onRetry={q.retry} empty={{ title: "No active orders", text: "New DoorDash orders will appear here, already ranked.", icon: <UtensilsCrossed className="h-5 w-5" /> }} />
          )}
          {q.status === "ready" && (
            <motion.div layout className="space-y-3">
              <AnimatePresence initial={false}>
                {list.map((o, i) => (
                  <motion.div key={o.id} layout transition={{ type: "spring", stiffness: 380, damping: 34 }} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                    <OrderCard order={o} rank={i + 1} stage={stage[o.id] ?? "queued"} onWhy={() => setWhy(o)} onAdvance={() => advance(o)} />
                  </motion.div>
                ))}
              </AnimatePresence>
            </motion.div>
          )}
        </div>
      </div>

      <div className="flex min-h-0 flex-col gap-4 overflow-y-auto no-scrollbar">
        <Card title="How Pulse ranks orders" takeaway="Your analytics feed the queue in real time." status={q.status === "ready" ? "ready" : q.status === "loading" ? "loading" : "ready"}>
          <div className="space-y-2.5">
            <Signal icon={<TrendingUp className="h-4 w-4" />} source="Forecast" text={rush ? `Rush at ${hourLabel(rush.hour)}: ${rush.expected} orders expected` : "No rush in the next hour"} effect="Ramen tickets move up" onOpen={() => go("forecast")} />
            <Signal icon={<Grid3x3 className="h-4 w-4" />} source="Heatmap" text={`Prep runs ${curPrep.toFixed(1)} min at this hour`} effect="Sets each prep time" onOpen={() => go("heatmap")} />
            <Signal icon={<Layers className="h-4 w-4" />} source="Menu" text={`${batchCount} orders share items`} effect="Cook them together" onOpen={() => go("menu")} />
            <Signal icon={<Store className="h-4 w-4" />} source="Kiosk" text={`${live.orders.filter((o) => o.channel === "kiosk").length} guests waiting in the store`} effect="In-person guests get a boost" />
            <Signal icon={<Bike className="h-4 w-4" />} source="Dasher ETAs" text="Live from DoorDash" effect="Food ready as they arrive" />
          </div>
        </Card>
        <Card title="Priority scale">
          <div className="space-y-2 text-sm">
            {(
              [
                ["Urgent · someone will wait", "70+", "bg-danger"],
                ["High · start now", "50–69", "bg-warning"],
                ["Normal · start soon", "25–49", "bg-muted-foreground/40"],
                ["Low · plenty of time", "under 25", "bg-border"],
              ] as const
            ).map(([l, r, c]) => (
              <div key={l} className="flex items-center gap-2.5">
                <span className={cn("h-3 w-3 rounded-full", c)} />
                <span className="font-semibold">{l}</span>
                <span className="ml-auto text-muted-foreground tabular">{r}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <WhySheet order={why ? live.orders.find((o) => o.id === why.id) ?? why : null} onClose={() => setWhy(null)} />
    </div>
  );
}

function Signal({ icon, source, text, effect, onOpen }: { icon: React.ReactNode; source: string; text: string; effect: string; onOpen?: () => void }) {
  const Comp = onOpen ? "button" : "div";
  return (
    <Comp type={onOpen ? "button" : undefined} onClick={onOpen} className="flex w-full min-h-12 items-start gap-3 rounded-xl bg-muted/70 p-3 text-left transition-colors duration-150 hover:bg-muted">
      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-card text-primary">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{source}</span>
        <span className="block text-sm font-semibold leading-snug">{text}</span>
        <span className="mt-0.5 inline-flex items-center gap-1 text-xs font-medium text-primary">
          <ArrowRight className="h-3 w-3" /> {effect}
        </span>
      </span>
    </Comp>
  );
}

function WhySheet({ order, onClose }: { order: ScoredOrder | null; onClose: () => void }) {
  const max = 70;
  return (
    <Sheet open={!!order} onOpenChange={(o) => !o && onClose()}>
      <SheetContent>
        {order && (
          <div className="flex h-full flex-col overflow-y-auto p-6 pt-7">
            <div className="pr-14">
              <div className="text-sm font-semibold text-muted-foreground">Why this order is ranked here</div>
              <SheetTitle className="mt-0.5 text-2xl">
                {order.customer} · #{order.id}
              </SheetTitle>
              <SheetDescription className="mt-1 text-[15px]">
                Priority score <b className="text-foreground">{order.score}</b> ({priorityLevel(order.score)}). By arrival time it would be #{order.arrivalRank}.
              </SheetDescription>
            </div>

            <div className="mt-5 flex gap-2">
              {order.items.map((it) => (
                <span key={it.itemId} className="rounded-full bg-muted px-3 py-1.5 text-sm font-semibold">
                  {it.qty}× {menuItem(it.itemId).name}
                </span>
              ))}
            </div>

            <h3 className="mt-6 text-[15px] font-semibold text-muted-foreground">What moved it up</h3>
            <div className="mt-2 space-y-3">
              {order.factors.map((f) => {
                const Icon = FACTOR_ICON[f.key];
                return (
                  <div key={f.key} className="rounded-2xl border border-border p-4">
                    <div className="flex items-center gap-3">
                      <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary-soft text-primary">
                        <Icon className="h-4 w-4" />
                      </span>
                      <span className="flex-1 font-semibold">{f.label}</span>
                      <span className="text-sm font-bold tabular">+{f.points}</span>
                    </div>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                      <div className="h-full rounded-full bg-primary transition-all duration-500" style={{ width: `${Math.min(100, (f.points / max) * 100)}%` }} />
                    </div>
                    <p className="mt-2 text-sm text-muted-foreground">{f.detail}</p>
                  </div>
                );
              })}
              {!order.factors.length && <p className="text-sm text-muted-foreground">Nothing urgent: pickup is a while away and prep is quick. Pulse keeps it lower so urgent tickets go first.</p>}
            </div>

            <div className="mt-6 rounded-2xl bg-muted p-4 text-sm leading-relaxed text-muted-foreground">
              <b className="text-foreground">How the score works:</b> The biggest part (up to 70) is pickup timing: 50 points if the food would be ready exactly when the Dasher walks in (or at the time the kiosk quoted an in-store guest), 5 more for every minute they'd wait, 5 fewer for every minute of slack. Guests waiting in the store get +10. Small boosts: a predicted rush (Forecast, +10), long prep items (+5), batching with another order (Menu data, +5), time waiting (up to +5). Orders already cooking only count the prep time they have left, which comes from your Heatmap for this hour.
            </div>
            <div className="h-6 shrink-0" />
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
