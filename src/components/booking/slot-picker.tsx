"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { CalendarX, ChevronLeft, ChevronRight, Clock, Globe } from "lucide-react";
import { DateTime } from "luxon";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/shared/empty-state";
import { browserZone, formatMoney, formatRange, inZone } from "@/lib/time";
import { SELECT_TRIAL_EVENT } from "./trial-cta";
import { cn } from "@/lib/utils";

export interface SlotPickerProps {
  slug: string;
  durations: number[];
  trial: { enabled: boolean; durationMin: number };
  hourlyPriceCents: number;
  currency: string;
  /** "book" navigates to the booking page; "select" calls onPick (used for rescheduling). */
  mode?: "book" | "select";
  fixedDuration?: number;
  excludeBookingId?: string;
  initialTrial?: boolean;
  /** The tutor is full: only the free trial can be booked, so it stays selected and cannot be switched off. */
  paidUnavailable?: boolean;
  /** Viewer's saved zone (logged-in users). Anonymous visitors get the browser zone. */
  knownZone?: string;
  onPick?: (startsAtIso: string) => void;
  ctaLabel?: string;
}

/**
 * Time-zone-aware slot picker.
 * Layout: lesson length -> time zone -> week/day navigation -> (week view) a 7-day strip ->
 * the chosen day's times grouped into Morning / Afternoon / Evening. One day at a time keeps it
 * readable in a narrow card and on phones.
 */
export function SlotPicker(p: SlotPickerProps) {
  const router = useRouter();
  const mode = p.mode ?? "book";
  const [zone, setZone] = useState(p.knownZone ?? "UTC");
  const [zones, setZones] = useState<string[]>([]);
  const [ready, setReady] = useState(false);
  const [view, setView] = useState<"week" | "day">("week");
  const [anchor, setAnchor] = useState(""); // yyyy-MM-dd, in the viewer's zone
  const [trial, setTrial] = useState(Boolean((p.initialTrial || p.paidUnavailable) && p.trial.enabled));
  const [duration, setDuration] = useState(p.fixedDuration ?? p.durations[p.durations.length - 1] ?? 60);
  const [slots, setSlots] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [pickedDay, setPickedDay] = useState<string | null>(null); // week view: whose times are shown

  const effDuration = p.fixedDuration ?? (trial ? p.trial.durationMin : duration);

  // After mount: detect the viewer's zone and start at "today"
  useEffect(() => {
    const t = setTimeout(() => {
      const z = p.knownZone ?? browserZone();
      setZone(z);
      try { setZones(Intl.supportedValuesOf("timeZone")); } catch {}
      setAnchor(DateTime.now().setZone(z).toFormat("yyyy-MM-dd"));
      setReady(true);
    }, 0);
    return () => clearTimeout(t);
  }, [p.knownZone]);

  // The "Book a free trial" button on the page header asks us to switch to the trial
  useEffect(() => {
    if (!p.trial.enabled) return;
    const select = () => { setTrial(true); setSelected(null); setPickedDay(null); };
    window.addEventListener(SELECT_TRIAL_EVENT, select);
    return () => window.removeEventListener(SELECT_TRIAL_EVENT, select);
  }, [p.trial.enabled]);

  // Visible range in UTC
  const range = useMemo(() => {
    if (!anchor) return null;
    const a = DateTime.fromISO(anchor, { zone });
    const start = view === "week" ? a.startOf("week") : a.startOf("day");
    const end = start.plus({ days: view === "week" ? 7 : 1 });
    return { start, end };
  }, [anchor, view, zone]);

  useEffect(() => {
    if (!range) return;
    const ctrl = new AbortController();
    const qs = new URLSearchParams({ from: range.start.toUTC().toISO()!, to: range.end.toUTC().toISO()!, duration: String(effDuration) });
    if (p.excludeBookingId) qs.set("exclude", p.excludeBookingId);
    // Defer the state reset so we are not setting state synchronously inside the effect body
    const t = setTimeout(() => { setLoading(true); setError(""); }, 0);
    fetch(`/api/t/${p.slug}/slots?${qs}`, { signal: ctrl.signal })
      .then(async (r) => {
        if (!r.ok) throw new Error(r.status === 429 ? "Too many requests. Please wait a moment." : "Couldn't load times.");
        return r.json();
      })
      .then((d: { slots: string[] }) => { setSlots(d.slots); setLoading(false); })
      .catch((e: Error) => { if (e.name !== "AbortError") { setError(e.message); setLoading(false); } });
    return () => { clearTimeout(t); ctrl.abort(); };
  }, [range, effDuration, p.slug, p.excludeBookingId]);

  const byDay = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const s of slots) {
      const key = inZone(s, zone).toFormat("yyyy-MM-dd");
      map.set(key, [...(map.get(key) ?? []), s]);
    }
    return map;
  }, [slots, zone]);

  const days = useMemo(() => {
    if (!range) return [];
    return Array.from({ length: view === "week" ? 7 : 1 }, (_, i) => range.start.plus({ days: i }));
  }, [range, view]);

  // Week view shows ONE day's times at a time. Default to the first day that has any.
  const dayKeys = days.map((d) => d.toFormat("yyyy-MM-dd"));
  const activeDay =
    view === "day" ? dayKeys[0] : pickedDay && dayKeys.includes(pickedDay) ? pickedDay : dayKeys.find((k) => (byDay.get(k) ?? []).length > 0) ?? dayKeys[0];
  const activeSlots = byDay.get(activeDay) ?? [];
  const groups = [
    { label: "Morning", items: activeSlots.filter((t) => inZone(t, zone).hour < 12) },
    { label: "Afternoon", items: activeSlots.filter((t) => inZone(t, zone).hour >= 12 && inZone(t, zone).hour < 17) },
    { label: "Evening", items: activeSlots.filter((t) => inZone(t, zone).hour >= 17) },
  ].filter((g) => g.items.length > 0);

  const todayKey = DateTime.now().setZone(zone).toFormat("yyyy-MM-dd");
  const canGoBack = range ? range.start.toFormat("yyyy-MM-dd") > todayKey : false;
  const step = (dir: 1 | -1) => {
    if (!anchor) return;
    setAnchor(DateTime.fromISO(anchor, { zone }).plus({ days: dir * (view === "week" ? 7 : 1) }).toFormat("yyyy-MM-dd"));
    setPickedDay(null);
  };
  const price = trial ? 0 : Math.round((p.hourlyPriceCents * effDuration) / 60);

  function go() {
    if (!selected) return;
    if (mode === "select") return p.onPick?.(selected);
    const qs = new URLSearchParams({ start: selected, duration: String(effDuration) });
    if (trial) qs.set("trial", "1");
    router.push(`/t/${p.slug}/book?${qs}`);
  }

  if (!ready || !range) return <Skeleton className="h-80 w-full rounded-xl" />;

  return (
    <div className="space-y-5">
      {/* 1. Lesson length */}
      {!p.fixedDuration && (
        <div>
          <p className="mb-3 flex items-baseline justify-between text-sm font-extrabold">Step 1 · Lesson length <span className="text-xs font-semibold text-muted-foreground">1-on-1 online</span></p>
          <div role="group" aria-label="Lesson length" className="grid grid-cols-2 gap-2.5">
            {p.trial.enabled && (
              <button
                type="button"
                aria-pressed={trial}
                onClick={() => { if (p.paidUnavailable) return; setTrial(!trial); setSelected(null); }}
                className={cn("relative rounded-2xl border-2 p-3.5 text-left transition", trial ? "border-brand-500 bg-brand-50 dark:bg-brand-900/40" : "border-border bg-card hover:border-brand-300")}
              >
                <span className="absolute right-2.5 top-2.5 rounded-full bg-success-soft px-2 py-0.5 text-[10px] font-bold text-success">FREE</span>
                <span className="block font-heading font-extrabold">{p.trial.durationMin} min</span>
                <span className="block text-sm text-muted-foreground">Trial lesson</span>
              </button>
            )}
            {p.durations.map((d) => {
              const on = !trial && duration === d;
              return (
                <button
                  key={d}
                  type="button"
                  aria-pressed={on}
                  disabled={trial}
                  onClick={() => { setDuration(d); setSelected(null); }}
                  className={cn(
                    "rounded-2xl border-2 p-3.5 text-left transition disabled:opacity-40",
                    on ? "border-brand-500 bg-brand-50 dark:bg-brand-900/40" : "border-border bg-card hover:border-brand-300",
                  )}
                >
                  <span className="block font-heading font-extrabold">{d} min</span>
                  <span className="mono block text-sm text-muted-foreground">{formatMoney(Math.round((p.hourlyPriceCents * d) / 60), p.currency)}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* 2. Date + time zone */}
      <p className="-mb-2 text-sm font-extrabold">Step 2 · Select date</p>
      <label className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
        <Globe className="size-4 shrink-0" aria-hidden /> Times shown in
        <select
          value={zone}
          onChange={(e) => { setZone(e.target.value); setSelected(null); }}
          className="min-w-0 max-w-full flex-1 rounded-lg border border-border bg-card px-2 py-1.5 text-foreground sm:flex-none"
          aria-label="Your time zone"
        >
          {(zones.length ? (zones.includes(zone) ? zones : [zone, ...zones]) : [zone]).map((z) => (
            <option key={z} value={z}>{z.replace(/_/g, " ")}</option>
          ))}
        </select>
      </label>

      {/* 3. Navigation + week/day toggle */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-muted p-1.5">
        <Button type="button" variant="ghost" size="icon" className="size-9 shrink-0" aria-label={`Previous ${view}`} disabled={!canGoBack} onClick={() => step(-1)}>
          <ChevronLeft className="size-5" aria-hidden />
        </Button>
        <p className="min-w-0 flex-1 truncate text-center font-heading font-bold" aria-live="polite">
          {view === "week" ? `${range.start.toFormat("d LLL")} - ${range.end.minus({ days: 1 }).toFormat("d LLL")}` : range.start.toFormat("ccc d LLL")}
        </p>
        <Button type="button" variant="ghost" size="icon" className="size-9 shrink-0" aria-label={`Next ${view}`} onClick={() => step(1)}>
          <ChevronRight className="size-5" aria-hidden />
        </Button>
        <div role="group" aria-label="Calendar view" className="order-last flex w-full shrink-0 rounded-lg bg-card p-0.5 shadow-soft sm:order-none sm:w-auto">
          {(["week", "day"] as const).map((v) => (
            <button
              key={v}
              type="button"
              aria-pressed={view === v}
              onClick={() => { setView(v); setPickedDay(null); }}
              className={cn("flex-1 rounded-md px-3 py-1 text-sm font-semibold capitalize sm:flex-none", view === v ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}
            >
              {v}
            </button>
          ))}
        </div>
      </div>

      {/* 4. Day strip (week view): pick a day, then see its times */}
      {view === "week" && !error && (
        <div role="tablist" aria-label="Choose a day" className="grid grid-cols-7 gap-1.5">
          {days.map((d) => {
            const key = d.toFormat("yyyy-MM-dd");
            const count = (byDay.get(key) ?? []).length;
            const on = key === activeDay;
            return (
              <button
                key={key}
                role="tab"
                aria-selected={on}
                disabled={loading || count === 0}
                onClick={() => { setPickedDay(key); setSelected(null); }}
                className={cn(
                  "flex flex-col items-center rounded-2xl border px-1 py-2.5 transition disabled:cursor-not-allowed disabled:opacity-40",
                  on ? "border-transparent bg-primary text-primary-foreground shadow-glow" : "border-border bg-card hover:border-brand-400",
                )}
              >
                <span className="text-xs font-medium opacity-80">{d.toFormat("ccc")}</span>
                <span className="font-heading text-lg font-bold leading-tight">{d.toFormat("d")}</span>
                <span className="text-[10px] leading-tight opacity-80">{loading ? "…" : count === 0 ? "none" : `${count} free`}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* 5. Times for the chosen day */}
      {error ? (
        <p role="alert" className="rounded-xl bg-danger-soft px-4 py-3 font-medium text-danger">⚠ {error}</p>
      ) : loading ? (
        <div aria-busy="true" aria-label="Loading times" className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {Array.from({ length: 8 }, (_, i) => <Skeleton key={i} className="h-11" />)}
        </div>
      ) : activeSlots.length === 0 ? (
        <EmptyState
          icon={CalendarX}
          title={`No free times this ${view}`}
          description={`There are no open slots in this ${view}. Try the next ${view}.`}
          action={<Button type="button" variant="outline" onClick={() => step(1)}>Next {view}</Button>}
        />
      ) : (
        <motion.div
          key={`${activeDay}-${effDuration}-${zone}`}
          initial="hidden"
          animate="show"
          variants={{ show: { transition: { staggerChildren: 0.02 } } }}
          className="space-y-4"
        >
          <p className="text-sm font-extrabold">Step 3 · Available times <span className="font-semibold text-muted-foreground">for {DateTime.fromISO(activeDay, { zone }).toFormat("ccc d LLL")}</span></p>
          {groups.map((g) => (
            <div key={g.label}>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{g.label}</p>
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                {g.items.map((t) => {
                  const active = selected === t;
                  return (
                    <motion.button
                      key={t}
                      type="button"
                      aria-pressed={active}
                      onClick={() => setSelected(t)}
                      variants={{ hidden: { opacity: 0, y: 6 }, show: { opacity: 1, y: 0 } }}
                      whileTap={{ scale: 0.95 }}
                      className={cn(
                        "mono relative h-11 rounded-xl border text-sm font-semibold transition-colors",
                        active ? "border-transparent" : "border-border bg-card hover:border-brand-400 hover:bg-brand-50 dark:hover:bg-brand-900/40",
                      )}
                    >
                      {active && (
                        <motion.span layoutId="slot-highlight" className="absolute inset-0 rounded-xl bg-brand-600 dark:bg-brand-500" transition={{ type: "spring", stiffness: 500, damping: 35 }} />
                      )}
                      <span className={cn("relative", active && "text-primary-foreground")}>{inZone(t, zone).toFormat("HH:mm")}</span>
                    </motion.button>
                  );
                })}
              </div>
            </div>
          ))}
        </motion.div>
      )}

      {/* 6. Summary + continue */}
      <AnimatePresence>
        {selected && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
            className="sticky bottom-20 z-10 space-y-3 rounded-2xl border border-brand-300 bg-card p-4 shadow-lift md:bottom-4"
          >
            <div className="flex items-start justify-between gap-3 text-sm">
              <div>
                <p className="font-semibold">{effDuration}-minute 1-on-1 lesson{trial ? " (free trial)" : ""}</p>
                <p className="mono mt-0.5 flex items-center gap-1.5 text-muted-foreground">
                  <Clock className="size-3.5" aria-hidden />
                  {formatRange(selected, DateTime.fromISO(selected).plus({ minutes: effDuration }).toISO()!, zone)}
                </p>
              </div>
              <p className="mono font-semibold">{trial ? "Free" : formatMoney(price, p.currency)}</p>
            </div>
            <div className="flex items-center justify-between border-t border-border pt-3">
              <p className="font-extrabold">Total due today</p>
              <p className="mono text-xl font-bold text-brand-600 dark:text-brand-300">{trial ? formatMoney(0, p.currency) : formatMoney(price, p.currency)}</p>
            </div>
            <Button type="button" size="lg" className="w-full bg-hero hover:brightness-110" onClick={go}>{p.ctaLabel ?? (trial ? "Book free trial" : `Book lesson · ${formatMoney(price, p.currency)}`)}</Button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
