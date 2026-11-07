"use client";
import { Bike, ChevronRight, Link2, PackageCheck, Store, X } from "lucide-react";
import type { Batch, MenuItem, NearMiss, Order } from "@/lib/types";
import { MIN } from "@/lib/config";
import { STATION_LABEL, fmtCountdown } from "../format";
import { Chip, IconCircle, RedButton, Sheet } from "../ui";

export function BatchPanel({ batches, nearMisses, now, byId, onStart }: { batches: Batch[]; nearMisses: NearMiss[]; now: number; byId: Record<string, MenuItem>; onStart: (id: string) => void }) {
  return (
    <Sheet
      title="Batches"
      right={
        batches.length > 0 && (
          <Chip tone="teal">
            <Link2 size={14} strokeWidth={3} /> {batches.length} active
          </Chip>
        )
      }
    >
      {batches.length === 0 && <p className="text-base text-sub">No batches right now.</p>}
      <div className="divide-y divide-line">
        {batches.map((b) => {
          const d = b.startAt - now;
          const cooking = !!b.startedAt;
          const item = byId[b.menuItemId];
          const when = cooking ? "Cooking now" : d <= MIN ? "Start now" : `Start in ${fmtCountdown(d)}`;
          return (
            <div key={b.id} className="py-3 first:pt-0">
              <div className="flex items-center gap-2 text-sm font-semibold text-sub">
                <span className={cooking ? "text-ok" : d <= MIN ? "font-extrabold text-now-text" : ""}>{when}</span>
                <span>·</span>
                <span>{item ? STATION_LABEL[item.station] : ""}</span>
              </div>
              <div className="mt-0.5 flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <div className="text-xl font-extrabold leading-tight">
                    Cook {b.totalQty} {b.totalQty === 1 ? item?.name : (item?.plural ?? `${item?.name}s`)} together
                  </div>
                  <div className="text-base font-semibold text-ink/70">for {b.orderIds.join(", ")}</div>
                </div>
                {!cooking && (
                  <RedButton size="sm" onClick={() => onStart(b.id)}>
                    Start <ChevronRight size={16} strokeWidth={3} />
                  </RedButton>
                )}
              </div>
              {batchDetail(b.reason) && <p className="mt-1 text-sm leading-snug text-sub">{batchDetail(b.reason)}</p>}
            </div>
          );
        })}
      </div>
      {nearMisses.length > 0 && (
        <div className="mt-3 rounded-2xl bg-chip/70 p-3">
          <div className="mb-1 text-xs font-extrabold uppercase tracking-wider text-sub">Not batched</div>
          <ul className="space-y-1.5">
            {nearMisses.slice(0, 4).map((n) => (
              <li key={n.orderIds.join("-") + n.menuItemId} className="flex gap-2 text-sm leading-snug text-ink/75">
                <X size={15} className="mt-0.5 shrink-0 text-faint" strokeWidth={3} />
                <span>{n.reason.replace(/^Not batched: /, "")}</span>
              </li>
            ))}
          </ul>
          {nearMisses.length > 4 && <div className="mt-1.5 pl-6 text-sm font-semibold text-faint">+{nearMisses.length - 4} more</div>}
        </div>
      )}
    </Sheet>
  );
}

export function DasherPanel({ orders, now }: { orders: Order[]; now: number }) {
  const dashers = orders.filter((o) => o.channel === "doordash" && o.dasherEtaAt !== undefined).sort((a, b) => a.dasherEtaAt! - b.dasherEtaAt!);
  return (
    <Sheet title="Dashers arriving" right={dashers.length > 0 && <Chip>{dashers.length}</Chip>}>
      {dashers.length === 0 && <p className="text-base text-sub">No dashers on the way.</p>}
      <ul className="divide-y divide-line">
        {dashers.slice(0, 7).map((o) => {
          const d = o.dasherEtaAt! - now;
          const here = d <= 0;
          const waiting = here && o.status !== "ready";
          const soon = !here && d < 3 * MIN && o.status !== "ready";
          const status = o.status === "ready" ? `Ready · shelf ${o.shelf ?? "—"}` : o.status === "cooking" ? "Cooking" : o.priority === "hold" ? "On hold" : "Not started";
          return (
            <li key={o.id} className="flex items-center gap-3 py-2.5">
              <IconCircle className={waiting ? "!bg-dd-tint !text-late-text" : ""}>
                <Bike size={19} />
              </IconCircle>
              <div className="min-w-0 flex-1">
                <div className="text-lg font-extrabold leading-tight">
                  {o.dasherName} <span className="font-semibold text-sub">for</span> <span className="tabular">{o.id}</span>
                </div>
                <div className={`text-sm font-semibold ${o.status === "ready" ? "text-ok" : "text-sub"}`}>{status}</div>
              </div>
              <div className="flex items-center gap-2">
                <span className={`text-2xl font-black tabular ${waiting ? "text-late-text" : here ? "text-ok" : soon ? "text-now-text" : ""}`}>
                  {waiting ? `+${fmtCountdown(d)}` : here ? "Here" : fmtCountdown(d)}
                </span>
                {(waiting || soon) && <span className="pulse-dot h-2.5 w-2.5 rounded-full bg-dd" />}
              </div>
            </li>
          );
        })}
      </ul>
    </Sheet>
  );
}

export function PickupPanel({ orders, byId }: { orders: Order[]; byId: Record<string, MenuItem> }) {
  const ready = orders.filter((o) => o.status === "ready");
  if (!ready.length) return null;
  return (
    <Sheet title="Ready for pickup" right={<Chip tone="green">{ready.length}</Chip>}>
      <ul className="divide-y divide-line">
        {ready.map((o) => (
          <li key={o.id} className="flex items-center gap-3 py-2.5">
            <IconCircle className="!bg-ok-tint !text-ok">{o.channel === "walkin" ? <Store size={19} /> : <PackageCheck size={19} />}</IconCircle>
            <div className="min-w-0 flex-1">
              <div className="text-lg font-extrabold tabular">{o.id}</div>
              <div className="truncate text-sm text-sub">{o.items.map((i) => `${i.qty}× ${byId[i.menuItemId]?.name}`).join(", ")}</div>
            </div>
            <Chip tone={o.channel === "walkin" ? "blue" : "green"}>{o.channel === "walkin" ? `Call ${o.customerName}` : `Shelf ${o.shelf ?? "—"}`}</Chip>
          </li>
        ))}
      </ul>
    </Sheet>
  );
}

/** Strip the headline + timing from a batch reason, keeping the detail ("#203's portion waits ≤2 min…"). */
function batchDetail(reason: string): string {
  return reason
    .replace(/^Cook(ing)? .*? together for [^—]*—\s*/, "")
    .replace(/^start (now|in [^.]*)\.\s*/, "")
    .trim();
}
