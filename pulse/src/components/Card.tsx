import type { ReactNode } from "react";
import { AlertTriangle, Inbox, RotateCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import type { Status } from "@/hooks/useResource";

type CardProps = {
  title?: ReactNode;
  /** One clear takeaway sentence, shown above the content. */
  takeaway?: ReactNode;
  right?: ReactNode;
  status?: Status;
  skeleton?: ReactNode;
  empty?: { title: string; text?: string; icon?: ReactNode };
  onRetry?: () => void;
  className?: string;
  bodyClassName?: string;
  children?: ReactNode;
  padded?: boolean;
  /** Use the one-row empty/error layout (for short cards). */
  compactStates?: boolean;
};

/** Card with a title, a one-line takeaway, and built-in loading / empty / error states. */
export function Card({ title, takeaway, right, status = "ready", skeleton, empty, onRetry, className, bodyClassName, children, padded = true, compactStates }: CardProps) {
  return (
    <section className={cn("flex min-h-0 flex-col rounded-2xl border border-border bg-card shadow-[var(--shadow-card)]", padded && "p-6", className)}>
      {(title || right) && (
        <header className="mb-3 flex items-start justify-between gap-3">
          <div className="min-w-0">
            {title && <h2 className="text-[15px] font-semibold text-muted-foreground">{title}</h2>}
            {takeaway && status === "ready" && <p className="mt-0.5 text-lg font-bold leading-snug tracking-tight text-foreground">{takeaway}</p>}
            {takeaway && status === "loading" && <div className="skeleton mt-1.5 h-5 w-72 max-w-full rounded-md" />}
          </div>
          {right && <div className="flex shrink-0 items-center gap-2">{right}</div>}
        </header>
      )}
      <div className={cn("min-h-0 flex-1", bodyClassName)}>
        {status === "loading" && (skeleton ?? <div className="skeleton h-full min-h-24 w-full rounded-xl" />)}
        {status === "empty" && <EmptyState {...(empty ?? { title: "Nothing here yet" })} compact={compactStates} />}
        {status === "error" && <ErrorState onRetry={onRetry} compact={compactStates} />}
        {status === "ready" && children}
      </div>
    </section>
  );
}

export function EmptyState({ title, text, icon, compact }: { title: string; text?: string; icon?: ReactNode; compact?: boolean }) {
  if (compact)
    return (
      <div className="flex items-center gap-3 rounded-xl bg-muted/60 px-4 py-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-card text-muted-foreground">{icon ?? <Inbox className="h-5 w-5" />}</div>
        <div className="min-w-0">
          <div className="text-[15px] font-semibold">{title}</div>
          {text && <p className="text-sm text-muted-foreground">{text}</p>}
        </div>
      </div>
    );
  return (
    <div className="flex h-full min-h-24 flex-col items-center justify-center gap-2 rounded-xl bg-muted/60 px-6 py-5 text-center">
      <div className="flex h-11 w-11 items-center justify-center rounded-full bg-card text-muted-foreground">{icon ?? <Inbox className="h-5 w-5" />}</div>
      <div className="text-[15px] font-semibold">{title}</div>
      {text && <p className="max-w-xs text-sm text-muted-foreground">{text}</p>}
    </div>
  );
}

export function ErrorState({ onRetry, compact }: { onRetry?: () => void; compact?: boolean }) {
  if (compact)
    return (
      <div className="flex items-center gap-3 rounded-xl bg-danger-soft/60 px-4 py-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-card text-danger">
          <AlertTriangle className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[15px] font-semibold">Couldn’t load this</div>
          <p className="text-sm text-muted-foreground">Check the connection. Orders are not affected.</p>
        </div>
        {onRetry && (
          <Button variant="outline" size="sm" onClick={onRetry} className="h-12 shrink-0">
            <RotateCw /> Try again
          </Button>
        )}
      </div>
    );
  return (
    <div className="flex h-full min-h-24 flex-col items-center justify-center gap-2 rounded-xl bg-danger-soft/60 px-6 py-5 text-center">
      <div className="flex h-11 w-11 items-center justify-center rounded-full bg-card text-danger">
        <AlertTriangle className="h-5 w-5" />
      </div>
      <div className="text-[15px] font-semibold">Couldn’t load this</div>
      <p className="max-w-xs text-sm text-muted-foreground">Check the tablet’s connection. Your orders are not affected.</p>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry} className="mt-1 h-12">
          <RotateCw /> Try again
        </Button>
      )}
    </div>
  );
}
