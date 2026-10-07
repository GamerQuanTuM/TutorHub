"use client";

import { motion } from "framer-motion";

/** Animated horizontal bar. Exposes its value to assistive tech. */
export function ProgressBar({ value, label }: { value: number; label: string }) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
      className="h-2.5 w-full overflow-hidden rounded-full bg-muted"
    >
      <motion.div
        className="h-full rounded-full bg-primary"
        initial={{ width: 0 }}
        animate={{ width: `${pct}%` }}
        transition={{ duration: 0.8, ease: "easeOut" }}
      />
    </div>
  );
}

/** Animated ring, e.g. package credits (3 of 5 left). The number is always shown, never colour alone. */
export function ProgressRing({ value, max, label, size = 96 }: { value: number; max: number; label: string; size?: number }) {
  const stroke = 10;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = max === 0 ? 0 : Math.min(1, value / max);
  return (
    <div
      role="img"
      aria-label={`${label}: ${value} of ${max}`}
      className="relative grid place-items-center"
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} className="stroke-muted" />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          className="stroke-primary"
          strokeDasharray={c}
          initial={{ strokeDashoffset: c }}
          animate={{ strokeDashoffset: c * (1 - pct) }}
          transition={{ duration: 0.9, ease: "easeOut" }}
        />
      </svg>
      <span className="absolute font-heading text-lg font-bold">
        {value}/{max}
      </span>
    </div>
  );
}
