"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { Bike, Brain, Check, ChefHat, Clapperboard, Flame, Pause, Play, Plus, RotateCcw, Shuffle, Store, TimerReset } from "lucide-react";
import { useOneLine, orderPath } from "@/components/useOneLine";
import { ChannelBadge, PriorityChip } from "@/components/kitchen/Badges";
import { fmtClock, fmtCountdown, itemsText } from "@/components/format";
import { Chip, DarkButton, FloatPill, GrayButton, Logo, RedButton, Segmented, Sheet, Switch } from "@/components/ui";
import { TabBar } from "@/components/TabBar";
import type { Channel, MenuItem } from "@/lib/types";

const SPEEDS = [1, 2, 5, 10];
const QUICK_NOTES = ["extra crispy", "nut allergy", "no onions", "sauce on the side"];
const AVATAR = ["#eb1700", "#00838f", "#1f6feb", "#008a4b", "#c94f00", "#191919"];

export default function ControlPage() {
  const { state, now, post } = useOneLine();
  const [notes, setNotes] = useState("");
  const [channel, setChannel] = useState<Channel>("doordash");
  const [toast, setToast] = useState<string>("");
  const byId = useMemo<Record<string, MenuItem>>(() => Object.fromEntries((state?.menu ?? []).map((m) => [m.id, m])), [state?.menu]);
  if (!state) return <div className="p-8 font-bold text-sub">Loading…</div>;

  const say = (t: string) => {
    setToast(t);
    setTimeout(() => setToast((cur) => (cur === t ? "" : cur)), 2500);
  };
  const sim = (payload: object, label: string) => {
    say(label);
    return post("/api/sim", payload);
  };
  const add = () => {
    say(`Added ${channel === "walkin" ? "walk-in" : "DoorDash"} order${notes ? ` — “${notes}”` : ""}`);
    post("/api/orders", { channel, ...(notes ? { notes } : {}) });
    setNotes("");
  };
  const active = state.orders.filter((o) => o.status !== "picked_up");
  const dashers = active.filter((o) => o.channel === "doordash").sort((a, b) => (a.dasherEtaAt ?? 0) - (b.dasherEtaAt ?? 0));

  return (
    <div className="pb-28 md:pb-10">
      <header className="sticky top-0 z-20 border-b border-line bg-card/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3">
          <Logo size={32} />
          <FloatPill className="ml-auto !px-4 !py-1.5 text-sm font-extrabold tabular">
            {fmtClock(now)} · {state.sim.running ? `${state.sim.speed}×` : "paused"}
          </FloatPill>
          <Link href="/kitchen" target="_blank" className="hidden md:block">
            <DarkButton size="sm">
              <ChefHat size={16} /> Open kitchen ↗
            </DarkButton>
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 pt-5">
        <h1 className="text-4xl font-black tracking-tight">Demo controls</h1>
        <div className="mt-2 flex flex-wrap gap-2">
          <Chip>{state.sim.scenario ? `Scenario: ${state.sim.scenario}` : "No scenario"}</Chip>
          <Chip tone={state.sim.llmEnabled ? "teal" : "gray"}>
            <Brain size={14} /> {state.sim.llmEnabled ? "LLM on" : "LLM off · keyword rules"}
          </Chip>
          {state.sim.rush && (
            <Chip tone="redSolid">
              <Flame size={14} fill="currentColor" /> Rush
            </Chip>
          )}
        </div>

        <div className="mt-5 grid gap-5 md:grid-cols-2">
          {/* Scenario promo banner */}
          <section className="relative overflow-hidden rounded-3xl bg-[#fde4df] p-5 md:col-span-2">
            <div className="max-w-xl">
              <div className="inline-flex items-center gap-1.5 text-sm font-extrabold text-late-text">
                <Clapperboard size={16} /> 3-minute demo
              </div>
              <h2 className="mt-1 text-2xl font-black leading-tight">Load the scripted Friday rush</h2>
              <p className="mt-1 text-base text-ink/75">
                9 orders: #202 + #203 tacos batch (2 min apart), #206 + #207 quesadillas don’t (9 min apart), #204 has a nut allergy, #208 holds, #209 is late.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <DarkButton onClick={() => sim({ action: "scenario", name: "demo" }, "Demo scenario loaded")}>
                  <Play size={16} fill="currentColor" /> Load scenario
                </DarkButton>
                <GrayButton onClick={() => sim({ action: "reset" }, "Reset")} className="!bg-white/70 hover:!bg-white">
                  <RotateCcw size={16} /> Reset
                </GrayButton>
              </div>
            </div>
            <TicketsArt />
          </section>

          <Sheet title="Sim clock">
            <div className="flex flex-wrap items-center gap-3">
              {state.sim.running ? (
                <GrayButton onClick={() => sim({ action: "pause" }, "Paused")}>
                  <Pause size={16} fill="currentColor" /> Pause
                </GrayButton>
              ) : (
                <RedButton onClick={() => sim({ action: "start" }, "Running")}>
                  <Play size={16} fill="currentColor" /> Start
                </RedButton>
              )}
              <Segmented options={SPEEDS.map((s) => ({ value: s, label: `${s}×` }))} value={state.sim.speed} onChange={(s) => sim({ action: "speed", speed: s }, `Speed ${s}×`)} />
            </div>
            <div className="mt-3 divide-y divide-line">
              <Switch on={state.sim.randomOrders} onClick={() => sim({ action: "random", on: !state.sim.randomOrders }, `Random orders ${state.sim.randomOrders ? "off" : "on"}`)} label="Random orders" hint="New walk-in and DoorDash orders every ~2 sim-minutes" />
              <Switch on={state.sim.autoCook} onClick={() => sim({ action: "autocook", on: !state.sim.autoCook }, `Auto-cook ${state.sim.autoCook ? "off" : "on"}`)} label="Auto-cook" hint="Robot kitchen starts and finishes orders on schedule" />
            </div>
          </Sheet>

          <Sheet title="Add an order">
            <div className="grid grid-cols-2 gap-3">
              {(["walkin", "doordash"] as Channel[]).map((c) => {
                const sel = channel === c;
                return (
                  <button key={c} onClick={() => setChannel(c)} className={`relative rounded-2xl p-3 text-left transition ${sel ? "ring-2 ring-ink" : "ring-1 ring-line hover:ring-chip-2"}`}>
                    <div className="flex items-center gap-2 text-lg font-extrabold">
                      {c === "walkin" ? <Store size={18} className="text-walkin" /> : <Bike size={18} className="text-dd" />}
                      {c === "walkin" ? "Walk-in" : "DoorDash"}
                    </div>
                    <div className="text-sm text-sub">{c === "walkin" ? "At the counter now" : "Dasher 5–20 min out"}</div>
                    <span className={`absolute right-3 top-3 flex h-5 w-5 items-center justify-center rounded-full ${sel ? "bg-ink text-white" : "ring-1 ring-chip-2"}`}>{sel && <Check size={13} strokeWidth={3.5} />}</span>
                  </button>
                );
              })}
            </div>
            <input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Order note (optional)"
              className="mt-3 w-full rounded-full bg-chip px-5 py-3 text-base outline-none placeholder:text-faint focus:ring-2 focus:ring-ink"
            />
            <div className="mt-2 flex flex-wrap gap-2">
              {QUICK_NOTES.map((n) => (
                <button key={n} onClick={() => setNotes(n)} className={`rounded-full px-3 py-1.5 text-sm font-bold ${notes === n ? "bg-ink text-white" : "bg-chip hover:bg-chip-2"}`}>
                  {n}
                </button>
              ))}
            </div>
            <RedButton onClick={add} className="mt-4 w-full" size="lg">
              <Plus size={20} strokeWidth={3} /> Add order
            </RedButton>
          </Sheet>

          <Sheet title="Sad paths" className="md:col-span-2">
            <Switch danger on={state.sim.rush} onClick={() => sim({ action: "rush", on: !state.sim.rush }, state.sim.rush ? "Rush mode off" : "Rush mode on — 3× orders + a burst")} label="Rush mode" hint="Triples the order rate and drops in 6 orders now. Stations fill; reasons switch to capacity." />
            <div className="mt-4 flex items-center gap-2 text-lg font-extrabold">
              <TimerReset size={20} /> Dasher delayed +8 min
            </div>
            {dashers.length === 0 && <p className="mt-1 text-sub">No DoorDash orders yet.</p>}
            <ul className="mt-1 grid gap-x-6 divide-y divide-line md:grid-cols-2 md:divide-y-0">
              {dashers.map((o, i) => (
                <li key={o.id} className="flex items-center gap-3 py-2.5 md:border-b md:border-line">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-lg font-black text-white" style={{ background: AVATAR[i % AVATAR.length] }}>
                    {o.dasherName?.[0] ?? "D"}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-base font-extrabold">
                      {o.dasherName} <span className="font-semibold text-sub">for</span> {o.id}
                    </div>
                    <div className="text-sm text-sub tabular">
                      {(o.dasherEtaAt ?? now) > now ? `${fmtCountdown((o.dasherEtaAt ?? now) - now)} away` : "arrived"} · {o.status === "queued" ? (o.priority ?? "").replace("_", " ") : o.status}
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      say(`${o.dasherName} delayed +8 min on ${o.id}`);
                      post(`${orderPath(o.id)}/delay`, { minutes: 8 });
                    }}
                    className="rounded-full bg-dd-tint px-4 py-2 text-sm font-extrabold text-late-text hover:bg-[#ffe0d9] active:scale-95"
                  >
                    +8 min
                  </button>
                </li>
              ))}
            </ul>
          </Sheet>
        </div>

        <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_24rem]">
          <Sheet title="Live queue" right={<Chip>{active.length} active</Chip>}>
            <ul className="divide-y divide-line">
              {active.map((o) => (
                <li key={o.id} className="flex items-start gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-lg font-black tabular">{o.id}</span>
                      <ChannelBadge channel={o.channel} size="sm" />
                      {o.priority ? <PriorityChip priority={o.priority} size="sm" /> : <Chip tone="green" className="!px-2.5 !py-0.5 !text-xs uppercase">{o.status}</Chip>}
                    </div>
                    <div className="mt-0.5 text-sm font-semibold">{itemsText(o, byId)}</div>
                    <div className="text-sm text-sub">{o.reason}</div>
                  </div>
                  {o.status === "queued" && <GrayButton size="sm" onClick={() => post(`${orderPath(o.id)}/status`, { status: "cooking" })}>Start</GrayButton>}
                  {o.status === "cooking" && <DarkButton size="sm" onClick={() => post(`${orderPath(o.id)}/status`, { status: "ready" })}>Ready</DarkButton>}
                  {o.status === "ready" && <GrayButton size="sm" onClick={() => post(`${orderPath(o.id)}/status`, { status: "picked_up" })}>Picked up</GrayButton>}
                </li>
              ))}
            </ul>
          </Sheet>

          <Sheet title="Prep-time model" right={<Chip tone="green">{state.modelStats.learnedFromOrders} learned</Chip>}>
            <p className="text-sm text-sub">
              prep = (a + b × load) × peak, trained on {state.modelStats.historyRecords.toLocaleString()} synthetic past items.
            </p>
            {state.modelStats.lastLearned && <div className="mt-2 rounded-2xl bg-ok-tint px-3 py-2 text-sm font-bold text-ok">Last update · {state.modelStats.lastLearned}</div>}
            <ul className="mt-2 divide-y divide-line">
              {state.modelStats.items.map((i) => (
                <li key={i.id} className="flex items-center justify-between py-2 text-sm">
                  <span className="font-bold">{i.name}</span>
                  <span className="tabular text-sub">
                    {i.a.toFixed(1)} + {i.b.toFixed(2)}·load · ×{i.peakFactor.toFixed(2)}
                  </span>
                </li>
              ))}
            </ul>
          </Sheet>
        </div>
      </main>

      {toast && (
        <div className="fixed inset-x-0 bottom-20 z-40 flex justify-center px-4 md:bottom-6">
          <div className="flex items-center gap-2 rounded-full bg-teal-dark px-5 py-3 text-base font-bold text-white shadow-lg">
            <Check size={18} strokeWidth={3} /> {toast}
          </div>
        </div>
      )}
      <TabBar />
    </div>
  );
}

/** Decorative stack of order tickets for the scenario banner. */
function TicketsArt() {
  return (
    <svg className="pointer-events-none absolute -bottom-4 right-4 hidden h-44 w-56 md:block" viewBox="0 0 220 170" aria-hidden>
      <g transform="rotate(-8 110 85)">
        <rect x="40" y="30" width="120" height="120" rx="14" fill="#fff" opacity=".7" />
      </g>
      <g transform="rotate(5 110 85)">
        <rect x="60" y="20" width="120" height="130" rx="14" fill="#fff" />
        <rect x="76" y="38" width="44" height="10" rx="5" fill="#eb1700" />
        <rect x="76" y="58" width="86" height="8" rx="4" fill="#191919" opacity=".85" />
        <rect x="76" y="74" width="70" height="8" rx="4" fill="#191919" opacity=".25" />
        <rect x="76" y="90" width="78" height="8" rx="4" fill="#191919" opacity=".25" />
        <rect x="76" y="114" width="60" height="18" rx="9" fill="#def4f6" />
        <rect x="84" y="120" width="44" height="6" rx="3" fill="#00838f" />
      </g>
    </svg>
  );
}
