// Small DoorDash-style building blocks: sheets, pill buttons, chips, segmented control, switch.
import type { ReactNode } from "react";

const cx = (...c: (string | false | undefined | null)[]) => c.filter(Boolean).join(" ");

export function Sheet({ children, className, title, right }: { children: ReactNode; className?: string; title?: ReactNode; right?: ReactNode }) {
  return (
    <section className={cx("rounded-3xl bg-card p-5 shadow-[var(--shadow-sheet)]", className)}>
      {(title || right) && (
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-xl font-extrabold tracking-tight">{title}</h2>
          {right}
        </div>
      )}
      {children}
    </section>
  );
}

type BtnProps = { children: ReactNode; onClick?: () => void; className?: string; size?: "sm" | "md" | "lg"; disabled?: boolean; title?: string };
const SIZES = { sm: "px-3.5 py-2 text-sm", md: "px-5 py-3 text-base", lg: "px-6 py-4 text-lg" };

/** The red "Dash" pill. */
export function RedButton({ children, onClick, className, size = "md", disabled, title }: BtnProps) {
  return (
    <button title={title} disabled={disabled} onClick={onClick} className={cx("inline-flex items-center justify-center gap-2 rounded-full bg-dd-btn font-extrabold text-white shadow-[0_2px_8px_rgb(235_23_0/0.3)] transition hover:brightness-110 active:scale-[0.97] disabled:opacity-50", SIZES[size], className)}>
      {children}
    </button>
  );
}

export function DarkButton({ children, onClick, className, size = "md", disabled, title }: BtnProps) {
  return (
    <button title={title} disabled={disabled} onClick={onClick} className={cx("inline-flex items-center justify-center gap-2 rounded-full bg-ink font-extrabold text-white transition hover:bg-black active:scale-[0.97] disabled:opacity-50", SIZES[size], className)}>
      {children}
    </button>
  );
}

export function GrayButton({ children, onClick, className, size = "md", disabled, title }: BtnProps) {
  return (
    <button title={title} disabled={disabled} onClick={onClick} className={cx("inline-flex items-center justify-center gap-2 rounded-full bg-chip font-bold text-ink transition hover:bg-chip-2 active:scale-[0.97] disabled:opacity-50", SIZES[size], className)}>
      {children}
    </button>
  );
}

/** White floating pill, like the "$87.42 Today" earnings chip. */
export function FloatPill({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx("rounded-full bg-card px-5 py-2 shadow-[var(--shadow-pill)] ring-1 ring-black/5", className)}>{children}</div>;
}

export function Chip({ children, tone = "gray", className }: { children: ReactNode; tone?: "gray" | "red" | "redSolid" | "green" | "blue" | "teal" | "dark" | "amber" | "orange"; className?: string }) {
  const tones = {
    gray: "bg-chip text-ink",
    red: "bg-dd-tint text-late-text",
    redSolid: "bg-dd-btn text-white",
    green: "bg-ok-tint text-ok",
    blue: "bg-walkin-tint text-walkin",
    teal: "bg-teal-tint text-teal",
    dark: "bg-ink text-white",
    amber: "bg-upcoming text-ink",
    orange: "bg-now text-white",
  };
  return <span className={cx("inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-bold whitespace-nowrap", tones[tone], className)}>{children}</span>;
}

/** Gray track with a black selected pill ("Earn per offer | Earn by time"). */
export function Segmented<T extends string | number>({ options, value, onChange, className }: { options: { value: T; label: ReactNode }[]; value: T; onChange: (v: T) => void; className?: string }) {
  return (
    <div className={cx("inline-flex rounded-full bg-chip p-1", className)}>
      {options.map((o) => (
        <button
          key={String(o.value)}
          onClick={() => onChange(o.value)}
          className={cx("rounded-full px-4 py-2 text-sm font-bold transition", o.value === value ? "bg-ink text-white shadow" : "text-ink hover:bg-chip-2")}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Switch({ on, onClick, label, hint, danger }: { on: boolean; onClick: () => void; label: ReactNode; hint?: ReactNode; danger?: boolean }) {
  return (
    <button onClick={onClick} className="flex w-full items-center gap-4 rounded-2xl px-1 py-2 text-left">
      <span className="min-w-0 flex-1">
        <span className="block font-bold">{label}</span>
        {hint && <span className="block text-sm text-sub">{hint}</span>}
      </span>
      <span className={cx("relative h-7 w-12 shrink-0 rounded-full transition", on ? (danger ? "bg-dd-btn" : "bg-ok-bright") : "bg-chip-2")}>
        <span className={cx("absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-all", on ? "left-[1.375rem]" : "left-0.5")} />
      </span>
    </button>
  );
}

export function IconCircle({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cx("inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-chip text-ink", className)}>{children}</span>;
}

/** One Line mark: a red rounded square with three stacked "tickets" merging into one line. */
export function Logo({ size = 36, withText = true, className }: { size?: number; withText?: boolean; className?: string }) {
  return (
    <span className={cx("inline-flex items-center gap-2.5", className)}>
      <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden>
        <rect width="40" height="40" rx="11" fill="#FF3008" />
        <path d="M9 13h9M9 20h9M9 27h9" stroke="#fff" strokeWidth="3.2" strokeLinecap="round" opacity=".75" />
        <path d="M18 13c5 0 5 7 9 7M18 27c5 0 5-7 9-7M18 20h13" stroke="#fff" strokeWidth="3.2" strokeLinecap="round" fill="none" />
      </svg>
      {withText && <span className="text-2xl font-black tracking-tight">One Line</span>}
    </span>
  );
}
