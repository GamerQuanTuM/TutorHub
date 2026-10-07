"use client";

import { useEffect } from "react";
import { animate, motion, useMotionValue, useReducedMotion, useTransform } from "framer-motion";


/** Counts up to `value` (major units when `currency` is set). Shows the final number immediately for reduced-motion users. */
export function AnimatedNumber({ value, currency }: { value: number; currency?: string }) {
  // Props must be serialisable (this is rendered from server components), so we take a currency code, not a function
  const format = (n: number) =>
    currency
      ? new Intl.NumberFormat("en", { style: "currency", currency: currency.toUpperCase(), maximumFractionDigits: 0 }).format(n)
      : Math.round(n).toLocaleString("en");
  const reduce = useReducedMotion();
  const mv = useMotionValue(reduce ? value : 0);
  const text = useTransform(mv, format);

  useEffect(() => {
    if (reduce) {
      mv.set(value);
      return;
    }
    const controls = animate(mv, value, { duration: 0.9, ease: "easeOut" });
    return () => controls.stop();
  }, [value, reduce, mv]);

  return <motion.span>{text}</motion.span>;
}
