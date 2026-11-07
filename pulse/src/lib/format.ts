export const fmtInt = (v: number) => Math.round(v).toLocaleString("en-US");
export const fmtUsd = (v: number, dp = 0) => `$${v.toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp })}`;
export const fmtMin = (v: number) => `${v.toFixed(1)} min`;
export const fmtPct = (v: number, signed = true) => `${signed && v > 0 ? "+" : ""}${Math.round(v)}%`;
export const fmtTime = (d: Date) => d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
export const fmtDateLong = (d: Date) => d.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });

/** Heat color from light to deep DoorDash red. t in [0, 1]. */
export function heatColor(t: number, dark: boolean) {
  const stops = dark
    ? [
        [42, 30, 28],
        [140, 34, 16],
        [255, 48, 8],
        [255, 128, 96],
      ]
    : [
        [255, 243, 239],
        [255, 176, 156],
        [255, 48, 8],
        [168, 22, 0],
      ];
  const x = Math.max(0, Math.min(1, t)) * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(x));
  const f = x - i;
  const c = stops[i].map((v, k) => Math.round(v + (stops[i + 1][k] - v) * f));
  return `rgb(${c[0]} ${c[1]} ${c[2]})`;
}

export const heatText = (t: number, dark: boolean) => (dark ? (t > 0.55 ? "#1a0a06" : "#f4f4f5") : t > 0.45 ? "#ffffff" : "#191919");
