"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { Check, Circle, ChevronRight } from "lucide-react";
import { ProgressBar } from "@/components/shared/progress";
import { Card } from "@/components/ui/card";

export interface ChecklistItem {
  label: string;
  hint: string;
  href: string;
  done: boolean;
}

/** Tutor onboarding checklist with an animated progress bar. */
export function OnboardingChecklist({ items }: { items: ChecklistItem[] }) {
  const done = items.filter((i) => i.done).length;
  const pct = Math.round((done / items.length) * 100);
  return (
    <Card>
      <div className="mb-1 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-extrabold">{done === items.length ? "You're all set! 🎉" : "Get set up"}</h2>
          <p className="text-sm text-muted-foreground">{done}/{items.length} steps done</p>
        </div>
        <span className="mono rounded-full bg-brand-100 px-3 py-1 text-sm font-bold text-brand-700 dark:bg-brand-900 dark:text-brand-200">{pct}%</span>
      </div>
      <div className="mt-3"><ProgressBar value={pct} label="Setup progress" /></div>
      <ul className="mt-4 space-y-1">
        {items.map((item, i) => (
          <motion.li key={item.label} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.06 }}>
            <Link href={item.href} className="flex items-center gap-3 rounded-xl p-2.5 transition-colors hover:bg-muted">
              {item.done ? (
                <span className="grid size-6 shrink-0 place-items-center rounded-full bg-success text-primary-foreground"><Check className="size-4" aria-hidden /></span>
              ) : (
                <Circle className="size-6 shrink-0 text-brand-300" aria-hidden />
              )}
              <span className="min-w-0 flex-1">
                <span className={item.done ? "font-medium text-muted-foreground line-through" : "font-semibold"}>{item.label}</span>
                {!item.done && <span className="block text-sm text-muted-foreground">{item.hint}</span>}
              </span>
              {!item.done && <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />}
              <span className="sr-only">{item.done ? "Completed" : "Not completed"}</span>
            </Link>
          </motion.li>
        ))}
      </ul>
    </Card>
  );
}
