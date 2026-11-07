import { PackageX, Snail, Star, TrendingUp } from "lucide-react";
import type { Badge, ItemPerf } from "@/lib/analytics";
import { FoodPhoto } from "./FoodPhoto";
import { Trend } from "./Trend";
import { fmtInt, fmtUsd } from "@/lib/format";
import { cn } from "@/lib/utils";

const BADGE: Record<Badge, { icon: typeof Star; cls: string }> = {
  Star: { icon: Star, cls: "bg-foreground text-background" },
  Rising: { icon: TrendingUp, cls: "bg-success text-white" },
  "Slow mover": { icon: Snail, cls: "bg-card/95 text-foreground" },
  "Often sold out": { icon: PackageX, cls: "bg-primary text-white" },
};

export function BadgeChip({ badge, className }: { badge: Badge; className?: string }) {
  const b = BADGE[badge];
  const Icon = b.icon;
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold shadow-sm backdrop-blur", b.cls, className)}>
      <Icon className="h-3.5 w-3.5" strokeWidth={2.5} fill={badge === "Star" ? "currentColor" : "none"} />
      {badge}
    </span>
  );
}

/** Menu item with the merchant's photo, 7-day numbers and a performance badge. */
export function MenuItemCard({ perf, onOpen, rank }: { perf: ItemPerf; onOpen: () => void; rank?: number }) {
  const { item } = perf;
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group flex flex-col overflow-hidden rounded-2xl border border-border bg-card text-left shadow-[var(--shadow-card)] transition-[transform,box-shadow] duration-150 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div className="relative">
        <FoodPhoto src={item.photo} alt={item.name} className="aspect-[4/3] w-full" rounded="rounded-none" />
        {perf.badge && <BadgeChip badge={perf.badge} className="absolute left-3 top-3" />}
        {rank !== undefined && rank <= 3 && (
          <span className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full bg-card/95 text-sm font-bold shadow-sm">
            {rank}
          </span>
        )}
      </div>
      <div className="flex flex-1 flex-col p-4">
        <div className="flex items-baseline justify-between gap-2">
          <h3 className="truncate text-base font-bold">{item.name}</h3>
          <span className="shrink-0 text-sm font-medium text-muted-foreground tabular">{fmtUsd(item.price, 2)}</span>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2 border-t border-border pt-3">
          <Stat label="Orders 7d" value={fmtInt(perf.orders7d)} />
          <Stat label="Revenue" value={fmtUsd(perf.revenue7d)} />
          <div>
            <div className="text-[11px] font-medium text-muted-foreground">vs last wk</div>
            <Trend pct={perf.trendPct} className="mt-1" />
          </div>
        </div>
      </div>
    </button>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <div className="text-[11px] font-medium text-muted-foreground">{label}</div>
      <div className="mt-0.5 truncate text-[17px] font-bold tabular">{value}</div>
    </div>
  );
}

export function MenuItemSkeleton() {
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card">
      <div className="skeleton aspect-[4/3] w-full rounded-none" />
      <div className="space-y-3 p-4">
        <div className="skeleton h-5 w-2/3 rounded" />
        <div className="skeleton h-10 w-full rounded" />
      </div>
    </div>
  );
}

