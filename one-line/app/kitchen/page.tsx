"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { Sparkles, X } from "lucide-react";
import { useOneLine, orderPath } from "@/components/useOneLine";
import { TopBar } from "@/components/kitchen/TopBar";
import { OrderCard, CookingCard } from "@/components/kitchen/OrderCard";
import { BatchPanel, DasherPanel, PickupPanel } from "@/components/kitchen/SidePanels";
import { RedButton } from "@/components/ui";
import type { MenuItem, Order } from "@/lib/types";

type Filter = "all" | "doordash" | "walkin" | "batched";
const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "doordash", label: "DoorDash" },
  { value: "walkin", label: "Walk-in" },
  { value: "batched", label: "Batched" },
];
const count = (orders: Order[], f: Filter) =>
  orders.filter((o) => (f === "all" ? true : f === "batched" ? (o.batchIds?.length ?? 0) > 0 : o.channel === f)).length;

export default function KitchenPage() {
  const { state, now, error, post } = useOneLine();
  const [explain, setExplain] = useState<{ text: string; source: string } | null>(null);
  const [explaining, setExplaining] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");
  const flashes = useReorderFlashes(state?.orders.filter((o) => o.status === "queued").map((o) => `${o.id}|${o.priority}`) ?? []);
  const byId = useMemo<Record<string, MenuItem>>(() => Object.fromEntries((state?.menu ?? []).map((m) => [m.id, m])), [state?.menu]);

  if (!state) {
    return <div className="flex min-h-screen items-center justify-center text-2xl font-bold text-sub">{error ? `Can't reach the server (${error})` : "Loading…"}</div>;
  }

  const allQueued = state.orders.filter((o) => o.status === "queued");
  const queued = allQueued.filter((o) => (filter === "all" ? true : filter === "batched" ? (o.batchIds?.length ?? 0) > 0 : o.channel === filter));
  const cooking = state.orders.filter((o) => o.status === "cooking");

  const onExplain = async () => {
    setExplaining(true);
    setExplain((await post("/api/explain")) as { text: string; source: string } | null);
    setExplaining(false);
  };

  return (
    <div className="flex min-h-screen flex-col">
      <TopBar state={state} now={now} onExplain={onExplain} explaining={explaining} />
      {error && <div className="bg-dd-btn px-6 py-1.5 text-sm font-bold text-white">Connection lost — retrying…</div>}

      <div className="grid flex-1 grid-cols-1 gap-6 p-6 lg:grid-cols-[minmax(0,1fr)_27rem]">
        <main className="min-w-0">
          {explain && (
            <div className="mb-5 flex items-start gap-3 rounded-3xl bg-teal-dark p-5 text-white shadow-[var(--shadow-sheet)]">
              <Sparkles className="mt-1 shrink-0 text-[#9be3e8]" size={22} />
              <div className="flex-1">
                <div className="text-xs font-extrabold uppercase tracking-wider text-white/60">{explain.source === "llm" ? "AI summary" : "Summary"}</div>
                <p className="mt-0.5 text-xl font-semibold leading-snug">{explain.text}</p>
              </div>
              <button onClick={() => setExplain(null)} className="text-white/60 hover:text-white" aria-label="Dismiss">
                <X size={20} />
              </button>
            </div>
          )}

          {cooking.length > 0 && (
            <section className="mb-6">
              <div className="mb-3">
                <SectionTitle title="On the line" count={cooking.length} />
              </div>
              <div className="flex flex-wrap gap-3">
                <AnimatePresence initial={false}>
                  {cooking.map((o) => (
                    <motion.div key={o.id} layout initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.96 }} className="flex min-w-[19rem] flex-1">
                      <CookingCard order={o} now={now} byId={byId} onReady={() => post(`${orderPath(o.id)}/status`, { status: "ready" })} />
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            </section>
          )}

          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <SectionTitle title="Queue" count={allQueued.length} sub="sorted by when to start" />
            <div className="flex flex-wrap gap-2">
              {FILTERS.map((f) => (
                <button
                  key={f.value}
                  onClick={() => setFilter(f.value)}
                  className={`rounded-full px-4 py-2 text-sm font-bold transition ${filter === f.value ? "bg-ink text-white" : "bg-card text-ink shadow-[var(--shadow-pill)] hover:bg-chip"}`}
                >
                  {f.label}
                  <span className={`ml-1.5 tabular ${filter === f.value ? "text-white/60" : "text-faint"}`}>{count(allQueued, f.value)}</span>
                </button>
              ))}
            </div>
          </div>
          {queued.length === 0 && allQueued.length > 0 && <p className="rounded-3xl bg-card p-8 text-center text-lg text-sub shadow-[var(--shadow-sheet)]">No orders match this filter.</p>}
          {allQueued.length === 0 && (
            <div className="flex flex-col items-center gap-4 rounded-3xl bg-card p-12 text-center shadow-[var(--shadow-sheet)]">
              <div className="text-3xl font-black">All caught up</div>
              <p className="max-w-md text-lg text-sub">New walk-in and DoorDash orders will land here automatically.</p>
              <Link href="/control">
                <RedButton size="lg">Open the demo controls</RedButton>
              </Link>
            </div>
          )}
          <motion.div layout className="flex flex-col gap-4">
            <AnimatePresence initial={false}>
              {queued.map((o) => (
                <motion.div
                  key={o.id}
                  layout
                  initial={{ opacity: 0, y: -16 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, x: 60 }}
                  transition={{ layout: { type: "spring", stiffness: 260, damping: 30 }, duration: 0.3 }}
                >
                  <OrderCard order={o} now={now} byId={byId} batches={state.batches} flash={flashes.has(o.id)} onStart={() => post(`${orderPath(o.id)}/status`, { status: "cooking" })} />
                </motion.div>
              ))}
            </AnimatePresence>
          </motion.div>
        </main>

        <aside className="flex min-w-0 flex-col gap-5">
          <BatchPanel batches={state.batches} nearMisses={state.nearMisses} now={now} byId={byId} onStart={(batchId) => post("/api/batches/start", { batchId })} />
          <DasherPanel orders={state.orders} now={now} />
          <PickupPanel orders={state.orders} byId={byId} />
        </aside>
      </div>
    </div>
  );
}

function SectionTitle({ title, count, sub }: { title: string; count?: number; sub?: string }) {
  return (
    <div className="flex items-baseline gap-2">
      <h2 className="text-2xl font-black tracking-tight">{title}</h2>
      {count !== undefined && <span className="text-2xl font-black text-faint tabular">{count}</span>}
      {sub && <span className="text-base font-semibold text-sub">· {sub}</span>}
    </div>
  );
}

/** Orders whose position or priority changed get a short highlight, so reorders are visible from across the kitchen. */
function useReorderFlashes(keys: string[]): Set<string> {
  const prev = useRef<Map<string, { idx: number; key: string }>>(new Map());
  const [flashing, setFlashing] = useState<Set<string>>(new Set());
  const sig = keys.join(",");
  useEffect(() => {
    const next = new Map(keys.map((k, idx) => [k.split("|")[0], { idx, key: k }]));
    const changed: string[] = [];
    if (prev.current.size) {
      for (const [id, v] of next) {
        const p = prev.current.get(id);
        if (p && (p.key !== v.key || Math.abs(p.idx - v.idx) >= 2)) changed.push(id);
      }
    }
    prev.current = next;
    if (changed.length) {
      setFlashing(new Set(changed));
      const t = setTimeout(() => setFlashing(new Set()), 2600);
      return () => clearTimeout(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig]);
  return flashing;
}
