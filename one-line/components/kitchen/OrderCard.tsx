"use client";
import { Bike, Check, CheckCircle2, ChefHat, Link2 } from "lucide-react";
import type { Batch, MenuItem, Order } from "@/lib/types";
import { PRIORITY_STYLE, fmtCountdown, itemsText } from "../format";
import { ChannelBadge, Flag, PriorityChip } from "./Badges";
import { Chip, DarkButton, GrayButton, RedButton } from "../ui";

type Props = {
  order: Order;
  now: number;
  byId: Record<string, MenuItem>;
  batches: Batch[];
  flash: boolean;
  onStart: () => void;
};

export function OrderCard({ order: o, now, byId, batches, flash, onStart }: Props) {
  const p = PRIORITY_STYLE[o.priority ?? "hold"];
  const untilStart = (o.startAt ?? now) - now;
  const isHold = o.priority === "hold";
  const mine = batches.filter((b) => (o.batchIds ?? []).includes(b.id));

  let countLabel: string;
  let countValue: string;
  if (o.priority === "late") {
    countLabel = o.channel === "walkin" ? "Waiting" : "Late by";
    countValue = o.channel === "walkin" ? fmtCountdown(now - o.createdAt) : `${Math.max(1, Math.round(o.lateMin ?? 0))} min`;
  } else if (o.priority === "start_now") {
    countLabel = "Start";
    countValue = "Now";
  } else {
    countLabel = isHold ? "Hold for" : "Start in";
    countValue = fmtCountdown(untilStart);
  }

  return (
    <div className={`relative overflow-hidden rounded-3xl bg-card shadow-[var(--shadow-sheet)] ${flash ? "flash" : ""}`}>
      <div className={`absolute inset-y-0 left-0 w-2 ${p.stripe}`} />
      <div className={`flex gap-6 pl-8 pr-6 ${isHold ? "py-4" : "py-5"}`}>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <PriorityChip priority={o.priority ?? "hold"} />
            <ChannelBadge channel={o.channel} />
            {o.channel === "doordash" && (
              <span className="inline-flex items-center gap-1 text-sm font-bold text-ok">
                <CheckCircle2 size={16} strokeWidth={2.5} /> Auto-accepted
              </span>
            )}
          </div>
          <div className="mt-2 flex items-baseline gap-3">
            <span className={`font-black tabular tracking-tight ${isHold ? "text-3xl" : "text-4xl"}`}>{o.id}</span>
            <span className="truncate text-2xl font-semibold text-sub">{o.customerName}</span>
          </div>
          <div className={`mt-1 font-bold ${isHold ? "text-xl text-ink/80" : "text-2xl"}`}>{itemsText(o, byId)}</div>
          <div className={`mt-2 font-semibold leading-snug ${p.text} ${isHold ? "text-lg" : "text-xl"}`}>{o.reason}</div>
          {(mine.length > 0 || (o.flags?.length ?? 0) > 0 || o.notes) && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {mine.map((b) => (
                <Chip key={b.id} tone="teal">
                  <Link2 size={15} strokeWidth={2.75} /> Batch · {b.totalQty}× {byId[b.menuItemId]?.name} w/ {b.orderIds.filter((id) => id !== o.id).join(", ")}
                </Chip>
              ))}
              {o.flags?.map((f) => <Flag key={f} text={f} />)}
              {o.notes && <span className="text-base italic text-sub">“{o.notes}”</span>}
            </div>
          )}
        </div>
        <div className="flex w-56 shrink-0 flex-col items-end justify-between gap-3">
          <div className="text-right">
            <div className="text-sm font-bold text-sub">{countLabel}</div>
            <div className={`font-black tabular leading-none tracking-tight ${p.text} ${isHold ? "text-4xl" : "text-[3.25rem]"}`}>{countValue}</div>
            {o.channel === "doordash" && o.dasherEtaAt !== undefined && (
              <div className="mt-1.5 inline-flex items-center gap-1.5 text-base font-semibold text-sub tabular">
                <Bike size={17} /> {o.dasherName} · {o.dasherEtaAt > now ? fmtCountdown(o.dasherEtaAt - now) : "here"}
              </div>
            )}
          </div>
          {isHold ? (
            <GrayButton onClick={onStart} className="w-full">
              Start early
            </GrayButton>
          ) : (
            <RedButton onClick={onStart} size="lg" className="w-full">
              <ChefHat size={20} strokeWidth={2.5} /> Start cooking
            </RedButton>
          )}
        </div>
      </div>
    </div>
  );
}

export function CookingCard({ order: o, now, byId, onReady }: { order: Order; now: number; byId: Record<string, MenuItem>; onReady: () => void }) {
  const total = (o.predictedPrepMin ?? 8) * 60_000;
  const elapsed = now - (o.startedAt ?? now);
  const left = (o.readyAt ?? now) - now;
  const over = left < 0;
  const pct = Math.min(100, Math.max(3, (elapsed / total) * 100));
  return (
    <div className="flex min-w-[19rem] flex-1 flex-col gap-2 rounded-3xl bg-card p-4 shadow-[var(--shadow-sheet)]">
      <div className="flex items-center gap-2">
        <span className="text-2xl font-black tabular">{o.id}</span>
        <ChannelBadge channel={o.channel} size="sm" />
        {o.shelf && <Chip className="!px-2.5 !py-0.5 !text-xs">Shelf {o.shelf}</Chip>}
        <span className={`ml-auto text-base font-extrabold tabular ${over ? "text-late-text" : "text-ok"}`}>{over ? `+${fmtCountdown(left)}` : fmtCountdown(left)}</span>
      </div>
      <div className="truncate text-base font-semibold text-ink/80">{itemsText(o, byId)}</div>
      <div className="h-2 overflow-hidden rounded-full bg-chip">
        <div className={`h-full rounded-full transition-all duration-500 ${over ? "bg-late" : "bg-ok-bright"}`} style={{ width: `${pct}%` }} />
      </div>
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm text-sub">{over ? "over the estimate" : "until ready"}</span>
        <DarkButton onClick={onReady} size="sm">
          <Check size={16} strokeWidth={3} /> Mark ready
        </DarkButton>
      </div>
    </div>
  );
}
