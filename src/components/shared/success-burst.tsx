"use client";

import { useEffect } from "react";
import confetti from "canvas-confetti";
import { motion, useReducedMotion } from "framer-motion";

/** Pink confetti burst. Skipped entirely for reduced-motion users. */
export function fireConfetti() {
  if (typeof window === "undefined" || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  confetti({
    particleCount: 90,
    spread: 75,
    origin: { y: 0.65 },
    colors: ["#F72585", "#FF5C9A", "#FFC2D9", "#7209B7", "#FFB4A2"],
  });
}

/** Animated checkmark + confetti for booking / payment / homework success moments. */
export function SuccessCheck({ title, description }: { title: string; description?: string }) {
  const reduce = useReducedMotion();
  useEffect(() => {
    fireConfetti();
  }, []);
  return (
    <div className="flex flex-col items-center text-center" role="status">
      <svg width="88" height="88" viewBox="0 0 88 88" aria-hidden>
        <motion.circle
          cx="44" cy="44" r="40" fill="none" strokeWidth="6" className="stroke-brand-500"
          initial={{ pathLength: reduce ? 1 : 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.5 }}
        />
        <motion.path
          d="M26 45 l12 12 l24 -26" fill="none" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round"
          className="stroke-brand-500"
          initial={{ pathLength: reduce ? 1 : 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.4, delay: 0.4 }}
        />
      </svg>
      <h3 className="mt-3 text-xl font-extrabold">{title}</h3>
      {description && <p className="text-muted-foreground">{description}</p>}
    </div>
  );
}
