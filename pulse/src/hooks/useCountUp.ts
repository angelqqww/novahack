import { useEffect, useRef, useState } from "react";

/** Animate a number from 0 to `target` the first time it appears (ease-out, ~900ms). */
export function useCountUp(target: number | undefined, duration = 900) {
  const [value, setValue] = useState(0);
  const done = useRef(false);
  useEffect(() => {
    if (target === undefined) return;
    if (done.current || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      setValue(target);
      return;
    }
    let raf = 0;
    const start = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setValue(target * eased);
      if (p < 1) raf = requestAnimationFrame(tick);
      else done.current = true;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return value;
}
