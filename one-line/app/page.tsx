import Link from "next/link";
import { ChefHat, Flame, Link2, SlidersHorizontal, Sparkles } from "lucide-react";
import { MapArt } from "@/components/MapArt";
import { Chip, DarkButton, FloatPill, Logo, RedButton } from "@/components/ui";
import { TabBar } from "@/components/TabBar";

// Orders per half hour on a Friday (illustrative), with the dinner rush highlighted — like the peak-pay chart.
const BARS = [3, 4, 6, 9, 11, 8, 5, 4, 5, 7, 10, 13, 15, 14, 12, 9, 6, 4];
const PEAK = [11, 12, 13];

export default function Home() {
  return (
    <div className="min-h-screen pb-24 md:pb-10">
      <div className="relative h-[46vh] min-h-[320px] overflow-hidden">
        <MapArt className="absolute inset-0 h-full w-full" />
        <div className="absolute inset-x-0 top-0 flex items-center justify-between p-4 md:p-6">
          <FloatPill className="!px-3 !py-2">
            <Logo size={30} />
          </FloatPill>
          <FloatPill className="text-center">
            <div className="text-xl font-black leading-tight">Fri 6:00 PM</div>
            <div className="text-xs font-bold text-sub">Dinner rush</div>
          </FloatPill>
          <span className="w-[120px]" />
        </div>
        <div className="absolute left-[18%] top-[38%] hidden md:block">
          <Chip tone="redSolid" className="shadow-[var(--shadow-pill)]">
            <Flame size={14} fill="currentColor" /> Busy · 9 orders
          </Chip>
        </div>
        <div className="absolute right-[16%] top-[56%] hidden md:block">
          <Chip tone="redSolid" className="shadow-[var(--shadow-pill)]">
            <Flame size={14} fill="currentColor" /> Very busy · 14 orders
          </Chip>
        </div>
      </div>

      <main className="relative z-10 mx-auto -mt-16 max-w-3xl px-4">
        <section className="rounded-[2rem] bg-card p-6 shadow-[0_-2px_24px_rgb(0_0_0/0.12)] md:p-8">
          <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-chip-2" />
          <h1 className="text-4xl font-black leading-[1.05] tracking-tight md:text-5xl">Every order, one line.</h1>
          <p className="mt-2 text-lg text-sub md:text-xl">
            Walk-in and DoorDash orders in one queue. DoorDash orders are auto-accepted, and the kitchen is told exactly when to start each one, and why.
          </p>

          <div className="mt-6">
            <div className="mb-2 flex items-center gap-2">
              <span className="text-sm font-bold text-sub">5–7 PM</span>
              <Chip tone="green" className="!py-0.5 !text-xs">
                Rush the scheduler plans for
              </Chip>
            </div>
            <div className="flex h-24 items-end gap-1.5">
              {BARS.map((v, i) => (
                <div key={i} className={`flex-1 rounded-t-md ${PEAK.includes(i) ? "bg-ok-bright" : "bg-chip-2"}`} style={{ height: `${(v / 15) * 100}%` }} />
              ))}
            </div>
            <div className="mt-1 flex justify-between text-xs font-semibold text-faint">
              <span>11a</span>
              <span>2p</span>
              <span>5p</span>
              <span>8p</span>
            </div>
          </div>

          <ul className="mt-6 grid gap-3 md:grid-cols-3">
            <Feature icon={<Sparkles size={18} />} title="Start at the right time" text="Ready as the dasher walks in, not cold on the shelf." />
            <Feature icon={<Link2 size={18} />} title="Batch the same item" text="5 tacos for 2 orders, when it won't make either late." />
            <Feature icon={<Flame size={18} />} title="Handles the rush" text="Station capacity, late dashers and allergies built in." />
          </ul>

          <div className="mt-7 flex items-center gap-3">
            <Link href="/kitchen" className="flex-1">
              <RedButton size="lg" className="w-full !py-4 text-xl">
                <ChefHat size={22} /> Open kitchen
              </RedButton>
            </Link>
            <Link href="/control" aria-label="Demo controls">
              <DarkButton size="lg" className="!px-5 !py-4">
                <SlidersHorizontal size={22} />
                <span className="hidden sm:inline">Demo controls</span>
              </DarkButton>
            </Link>
          </div>
        </section>
        <p className="mt-4 text-center text-sm text-faint">Hackathon demo · DoorDash × Nova · simulated data</p>
      </main>
      <TabBar />
    </div>
  );
}

function Feature({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) {
  return (
    <li className="rounded-2xl bg-chip/70 p-4">
      <div className="flex items-center gap-2 font-extrabold">
        <span className="text-dd">{icon}</span>
        {title}
      </div>
      <p className="mt-1 text-sm text-sub">{text}</p>
    </li>
  );
}
