import { cn } from "@/lib/utils";

// shadcn/ui Skeleton with a soft shimmer.
export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("skeleton rounded-lg", className)} {...props} />;
}
