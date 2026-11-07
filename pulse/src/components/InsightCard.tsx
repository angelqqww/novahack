import { useState } from "react";
import { Check, CloudRain, Moon, PackageX, Sparkles, TrendingUp, Users, Clock } from "lucide-react";
import type { Insight } from "@/lib/analytics";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useApp } from "@/app/state";

const ICONS = { rain: CloudRain, soldout: PackageX, moon: Moon, staff: Users, trend: TrendingUp, quiet: Clock };
const TINT: Record<Insight["icon"], string> = {
  rain: "bg-[#e8f1ff] text-[#1f6feb] dark:bg-[#14243d] dark:text-[#6aa6ff]",
  soldout: "bg-danger-soft text-danger",
  moon: "bg-[#f1ecfd] text-[#6b3fd4] dark:bg-[#251a3d] dark:text-[#b49bff]",
  staff: "bg-warning-soft text-[#a77400] dark:text-warning",
  trend: "bg-success-soft text-success",
  quiet: "bg-muted text-muted-foreground",
};

/** One AI insight: icon, plain-English sentence, an action, and where it came from. */
export function InsightCard({ insight, onAction, compact }: { insight: Insight; onAction: (i: Insight) => void; compact?: boolean }) {
  const { accepted } = useApp();
  const [doneLocal, setDone] = useState(false);
  const done = doneLocal || accepted.includes(insight.id);
  const Icon = ICONS[insight.icon];
  return (
    <div className={cn("flex items-center gap-3.5 rounded-xl border border-border bg-card", compact ? "px-3.5 py-2.5" : "p-4")}>
      <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-full", TINT[insight.icon])}>
        <Icon className="h-5 w-5" strokeWidth={2.25} />
      </div>
      <div className="min-w-0 flex-1">
        <p className={cn("font-semibold leading-snug", compact ? "text-[14.5px]" : "text-[15px]")}>
          {insight.title}
          {compact && <BasedOn n={insight.basedOn} className="ml-1.5 align-[1px]" />}
        </p>
        {!compact && (
          <>
            <p className="mt-0.5 text-sm text-muted-foreground">{insight.detail}</p>
            <BasedOn n={insight.basedOn} className="mt-1.5" />
          </>
        )}
      </div>
      <Button
        variant={done ? "secondary" : "outline"}
        size="sm"
        className={cn("h-12 shrink-0 px-4", done && "text-success")}
        onClick={() => {
          if (done) return;
          setDone(true);
          onAction(insight);
        }}
      >
        {done ? (
          <>
            <Check /> Done
          </>
        ) : (
          insight.action.label
        )}
      </Button>
    </div>
  );
}

export function InsightSkeleton() {
  return (
    <div className="flex items-center gap-4 rounded-xl border border-border px-4 py-3">
      <div className="skeleton h-11 w-11 rounded-full" />
      <div className="flex-1 space-y-2">
        <div className="skeleton h-4 w-[85%] rounded" />
        <div className="skeleton h-3 w-32 rounded" />
      </div>
      <div className="skeleton h-12 w-28 rounded-full" />
    </div>
  );
}

function BasedOn({ n, className }: { n: number; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground", className)}>
      <Sparkles className="h-3 w-3" /> Based on {n.toLocaleString("en-US")} orders
    </span>
  );
}
