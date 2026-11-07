import { Bike, ChefHat, Clock, Info, Layers, Store, Timer } from "lucide-react";
import { menuItem, priorityLevel, type ScoredOrder } from "@/lib/analytics";
import { FoodPhoto } from "./FoodPhoto";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const LEVEL_STYLE = {
  Urgent: "bg-danger text-white",
  High: "bg-warning text-[#3d2c00]",
  Normal: "bg-muted text-foreground",
  Low: "bg-muted text-muted-foreground",
};

export type OrderStage = "queued" | "cooking" | "ready";

/** One live order in the smart queue. */
export function OrderCard({
  order,
  rank,
  stage,
  onWhy,
  onAdvance,
}: {
  order: ScoredOrder;
  rank: number;
  stage: OrderStage;
  onWhy: () => void;
  onAdvance: () => void;
}) {
  const level = priorityLevel(order.score);
  const moved = order.arrivalRank - rank;
  const inStore = order.channel === "kiosk";
  const behind = order.prepMin > order.pickupInMin && stage !== "ready";
  return (
    <div className={cn("flex items-center gap-4 rounded-2xl border bg-card p-4 shadow-[var(--shadow-card)] transition-colors duration-200", rank === 1 && stage === "queued" ? "border-foreground/80" : "border-border", stage === "ready" && "opacity-60")}>
      <div className="flex w-12 shrink-0 flex-col items-center">
        <span className="text-[26px] font-bold leading-none tabular">{rank}</span>
        {moved !== 0 && stage === "queued" && (
          <span className={cn("mt-1 text-[11px] font-semibold tabular", moved > 0 ? "text-success" : "text-muted-foreground")}>{moved > 0 ? `↑${moved}` : `↓${-moved}`}</span>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 whitespace-nowrap">
          <span className="shrink-0 text-lg font-bold">{order.customer}</span>
          <span className="text-sm font-medium text-muted-foreground tabular">#{order.id}</span>
          <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-bold tabular", LEVEL_STYLE[level])}>
            {level} · {order.score}
          </span>
        </div>
        <div className="mt-2 flex items-center gap-3">
          <div className="flex shrink-0 -space-x-2">
            {order.items.slice(0, 4).map((it) => (
              <FoodPhoto key={it.itemId} src={menuItem(it.itemId).photo} alt={menuItem(it.itemId).name} className="h-11 w-11 ring-2 ring-card" rounded="rounded-full" />
            ))}
          </div>
          <div className="min-w-0">
            <div className="truncate text-sm text-muted-foreground">
              {order.items.map((it) => `${it.qty}× ${menuItem(it.itemId).name}`).join(", ")}
            </div>
            <div className="mt-1 flex min-w-0 items-center gap-2 overflow-hidden whitespace-nowrap">
              {inStore ? (
                <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[#e8f1ff] px-2 py-0.5 text-xs font-bold text-[#1f6feb] dark:bg-[#14243d] dark:text-[#6aa6ff]">
                  <Store className="h-3.5 w-3.5" /> In store · Kiosk {order.kiosk}
                </span>
              ) : (
                <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-primary-soft px-2 py-0.5 text-xs font-bold text-primary">
                  <Bike className="h-3.5 w-3.5" /> DoorDash
                </span>
              )}
              {order.batchWith && (
                <span className="inline-flex min-w-0 items-center gap-1 text-xs font-semibold text-primary">
                  <Layers className="h-3.5 w-3.5 shrink-0" /> <span className="truncate">Batch #{order.batchWith}</span>
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="grid w-[246px] shrink-0 grid-cols-3 gap-1.5 text-sm">
        <Meta icon={<Timer className="h-4 w-4" />} label="Elapsed" value={`${order.placedMinAgo} min`} tone={inStore && behind ? "danger" : undefined} />
        {inStore ? (
          <Meta icon={<Store className="h-4 w-4" />} label="Quoted" value={order.pickupInMin <= 0 ? "Now" : `${order.pickupInMin} min`} tone={behind ? "danger" : undefined} />
        ) : (
          <Meta icon={<Bike className="h-4 w-4" />} label="Dasher" value={order.pickupInMin <= 0 ? "Here" : `${order.pickupInMin} min`} tone={behind ? "danger" : undefined} />
        )}
        <Meta icon={<Clock className="h-4 w-4" />} label="Prep" value={`${order.prepMin} min`} />
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <Button variant="outline" size="icon" onClick={onWhy} aria-label={`Why is ${order.customer}'s order ranked ${rank}?`}>
          <Info />
        </Button>
        <Button variant={stage === "queued" ? (rank === 1 ? "default" : "dark") : stage === "cooking" ? "outline" : "secondary"} onClick={onAdvance} className="w-[132px]" disabled={stage === "ready"}>
          {stage === "queued" ? (
            <>
              <ChefHat /> Start
            </>
          ) : stage === "cooking" ? (
            "Mark ready"
          ) : (
            "Ready ✓"
          )}
        </Button>
      </div>
    </div>
  );
}

function Meta({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: string; tone?: "danger" }) {
  return (
    <div className="min-w-0 rounded-xl bg-muted px-2.5 py-2">
      <div className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className={cn("text-base font-bold tabular", tone === "danger" && "text-danger")}>{value}</div>
    </div>
  );
}
