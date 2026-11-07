import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { cn } from "@/lib/utils";

/** "↗ 12%" in green/red. `goodWhenUp=false` flips the colors (e.g. prep time). */
export function Trend({ pct, goodWhenUp = true, className }: { pct: number; goodWhenUp?: boolean; className?: string }) {
  const flat = Math.abs(pct) < 1;
  const good = flat ? null : pct > 0 === goodWhenUp;
  const Icon = flat ? Minus : pct > 0 ? ArrowUpRight : ArrowDownRight;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[13px] font-semibold tabular",
        good === null ? "bg-muted text-muted-foreground" : good ? "bg-success-soft text-success" : "bg-danger-soft text-danger",
        className,
      )}
    >
      <Icon className="h-3.5 w-3.5" strokeWidth={2.5} />
      {Math.abs(Math.round(pct))}%
    </span>
  );
}
