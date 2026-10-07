"use client";

import { useActionState, useState, useTransition } from "react";
import { Plus, Trash2, CalendarOff, CalendarX2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FormBanner, TextField } from "@/components/ui/field";
import { EmptyState } from "@/components/shared/empty-state";
import {
  addAvailabilityRuleAction, addBlockedDateAction, removeAvailabilityRuleAction, removeBlockedDateAction,
} from "@/lib/actions/tutor";
import type { ActionState } from "@/lib/actions/helpers";

interface Rule { id: string; weekday: number; startTime: string; endTime: string }
interface Block { id: string; label: string; reason: string; days: number }

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const TIMES = Array.from({ length: 48 }, (_, i) => `${String(Math.floor(i / 2)).padStart(2, "0")}:${i % 2 ? "30" : "00"}`);

/** Weekly hours: each add/remove saves immediately and shows a "Saved" indicator. */
export function AvailabilityEditor({ rules, zone }: { rules: Rule[]; zone: string }) {
  const [pending, start] = useTransition();
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [draft, setDraft] = useState<Record<number, { s: string; e: string }>>({});

  function run(fn: () => Promise<ActionState>) {
    setError("");
    start(async () => {
      const res = await fn();
      if (res.error) setError(res.error);
      else {
        setSaved(true);
        setTimeout(() => setSaved(false), 1800);
      }
    });
  }

  return (
    <Card>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-extrabold">Weekly hours</h2>
          <p className="text-sm text-muted-foreground">Students book inside these hours. Times are in your time zone ({zone.replace(/_/g, " ")}).</p>
        </div>
        <span aria-live="polite" className="min-w-16 text-sm font-semibold text-success">{pending ? "Saving…" : saved ? "✓ Saved" : ""}</span>
      </div>
      <FormBanner error={error} />
      <ul className="mt-2 divide-y divide-border">
        {DAYS.map((name, i) => {
          const weekday = i + 1;
          const dayRules = rules.filter((r) => r.weekday === weekday).sort((a, b) => a.startTime.localeCompare(b.startTime));
          const d = draft[weekday] ?? { s: "09:00", e: "17:00" };
          return (
            <li key={name} className={`flex flex-col gap-3 py-4 md:flex-row md:items-start ${dayRules.length === 0 ? "opacity-80" : ""}`}>
              <p className="w-28 pt-2 font-heading font-extrabold">{name}</p>
              <div className="flex flex-1 flex-wrap items-center gap-2">
                {dayRules.length === 0 && <span className="mt-1 inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1 text-sm font-semibold text-muted-foreground"><i className="size-1.5 rounded-full bg-muted-foreground" /> Not available</span>}
                {dayRules.map((r) => (
                  <span key={r.id} className="mono inline-flex items-center gap-1 rounded-full border border-brand-200 bg-brand-50 py-1 pl-3 pr-1 text-sm font-semibold text-brand-900 dark:border-brand-700 dark:bg-brand-900/50 dark:text-brand-100">
                    {r.startTime}-{r.endTime}
                    <button
                      type="button"
                      aria-label={`Remove ${name} ${r.startTime} to ${r.endTime}`}
                      onClick={() => run(() => removeAvailabilityRuleAction(r.id))}
                      className="grid size-7 place-items-center rounded-full hover:bg-brand-200 dark:hover:bg-brand-700"
                    >
                      <Trash2 className="size-4" aria-hidden />
                    </button>
                  </span>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <select aria-label={`${name} start`} value={d.s} onChange={(e) => setDraft({ ...draft, [weekday]: { ...d, s: e.target.value } })} className="rounded-xl border border-border bg-card px-2 py-2">
                  {TIMES.map((t) => <option key={t}>{t}</option>)}
                </select>
                <span aria-hidden>to</span>
                <select aria-label={`${name} end`} value={d.e} onChange={(e) => setDraft({ ...draft, [weekday]: { ...d, e: e.target.value } })} className="rounded-xl border border-border bg-card px-2 py-2">
                  {[...TIMES, "23:59"].map((t) => <option key={t}>{t}</option>)}
                </select>
                <Button type="button" size="sm" variant="outline" onClick={() => run(() => addAvailabilityRuleAction({ weekday, startTime: d.s, endTime: d.e }))}>
                  <Plus className="size-4" aria-hidden /> Add
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

const initial: ActionState = {};

export function BlockedDates({ blocks }: { blocks: Block[] }) {
  const [state, action, pending] = useActionState(addBlockedDateAction, initial);
  const [, start] = useTransition();
  const err = state.fieldErrors ?? {};
  return (
    <Card>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-extrabold">Blocked dates</h2>
          <p className="text-sm text-muted-foreground">Holidays or days off. Students cannot book these days.</p>
        </div>
        {blocks.length > 0 && <span className="rounded-full bg-brand-50 px-3 py-1 text-xs font-bold text-brand-700 dark:bg-brand-900/50 dark:text-brand-200">{blocks.length} upcoming {blocks.length === 1 ? "exception" : "exceptions"}</span>}
      </div>
      <form action={action} className="grid items-end gap-3 rounded-2xl bg-muted/60 p-4 sm:grid-cols-[1fr_1fr_1.4fr_auto]" noValidate>
        <TextField label="From" name="startDate" type="date" error={err.startDate} />
        <TextField label="To (inclusive)" name="endDate" type="date" error={err.endDate} />
        <TextField label="Reason (optional)" name="reason" placeholder="Holiday" />
        <Button type="submit" loading={pending}><Plus className="size-4" aria-hidden /> Add blocked date</Button>
      </form>
      <FormBanner error={state.error} message={state.ok ? state.message : undefined} />
      <div className="mt-4">
        {blocks.length === 0 ? (
          <EmptyState icon={CalendarOff} title="No blocked dates" description="Add a holiday or day off and it will disappear from your booking page." />
        ) : (
          <ul className="grid gap-3">
            {blocks.map((b) => (
              <li key={b.id} className="flex items-center gap-4 rounded-2xl border border-border bg-card p-4">
                <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-brand-100 text-brand-700 dark:bg-brand-900 dark:text-brand-200"><CalendarX2 className="size-5" aria-hidden /></span>
                <div className="min-w-0 flex-1">
                  <p className="font-heading font-extrabold">{b.label}</p>
                  {b.reason && <p className="text-sm text-muted-foreground">{b.reason}</p>}
                </div>
                <span className="mono rounded-full bg-muted px-2.5 py-0.5 text-xs font-bold text-muted-foreground">{b.days} {b.days === 1 ? "day" : "days"}</span>
                <Button variant="ghost" size="sm" aria-label={`Remove blocked date ${b.label}`} onClick={() => start(async () => { await removeBlockedDateAction(b.id); })}>
                  <Trash2 className="size-4 text-danger" aria-hidden />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}
