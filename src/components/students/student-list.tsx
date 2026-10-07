"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight, CalendarClock, Search, Ticket, Users } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { cn } from "@/lib/utils";

export interface StudentListItem {
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  level: string;
  goal: string;
  credits: number;
  nextLesson: string | null;
  status: "active" | "archived";
  isMinor: boolean;
}

type Filter = "all" | "active" | "archived";

/** Student cards with filter chips and instant search (name, email, level or goal). */
export function StudentList({ students }: { students: StudentListItem[] }) {
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("active");
  const counts = useMemo(
    () => ({ all: students.length, active: students.filter((s) => s.status === "active").length, archived: students.filter((s) => s.status === "archived").length }),
    [students],
  );
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return students.filter((s) => (filter === "all" || s.status === filter) && (!needle || `${s.name} ${s.email} ${s.level} ${s.goal}`.toLowerCase().includes(needle)));
  }, [students, q, filter]);

  const chips: { id: Filter; label: string }[] = [
    { id: "all", label: "All" },
    { id: "active", label: "Active" },
    { id: "archived", label: "Archived" },
  ];

  return (
    <div className="space-y-5">
      <div className="space-y-4 rounded-2xl border border-border bg-card p-4 shadow-soft sm:p-5">
        <div role="group" aria-label="Filter students" className="flex flex-wrap gap-2">
          {chips.map((c) => (
            <button
              key={c.id}
              type="button"
              aria-pressed={filter === c.id}
              onClick={() => setFilter(c.id)}
              className={cn(
                "rounded-full border px-4 py-2 text-sm font-semibold transition-colors",
                filter === c.id ? "border-transparent bg-primary text-primary-foreground shadow-soft" : "border-border bg-card hover:bg-muted",
              )}
            >
              {c.label} <span className="mono opacity-80">({counts[c.id]})</span>
            </button>
          ))}
        </div>
        <div className="relative">
          <Search className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <label htmlFor="student-search" className="sr-only">Search students</label>
          <input
            id="student-search"
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by name, email, level or goal"
            className="w-full rounded-full border border-border bg-brand-50 py-3 pl-11 pr-4 dark:bg-muted"
          />
        </div>
      </div>

      {shown.length === 0 ? (
        <EmptyState
          icon={Users}
          title={q ? "No students match your search" : "No students here yet"}
          description={q ? "Try a different name or clear the search." : "Invite your first student by link, email or CSV."}
          action={q ? <Button variant="outline" onClick={() => setQ("")}>Clear search</Button> : <Button asChild><Link href="/tutor/students/invite">Invite a student</Link></Button>}
        />
      ) : (
        <motion.ul initial="hidden" animate="show" variants={{ show: { transition: { staggerChildren: 0.05 } } }} className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {shown.map((s) => (
            <motion.li key={s.id} variants={{ hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0 } }}>
              <Link href={`/tutor/students/${s.id}`} className="lift flex h-full flex-col rounded-2xl border border-border bg-card p-5 shadow-soft">
                <div className="flex items-start gap-3">
                  <Avatar name={s.name} src={s.avatarUrl} size="lg" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-heading text-lg font-extrabold">{s.name}</p>
                    <p className="truncate text-sm text-muted-foreground">{s.goal || s.email}</p>
                  </div>
                  <Badge variant={s.status === "archived" ? "neutral" : "success"}>{s.status === "archived" ? "Archived" : "Active"}</Badge>
                </div>
                <div className="mt-4 flex flex-wrap gap-1.5">
                  <Badge variant="accent">Level {s.level}</Badge>
                  {s.isMinor && <Badge variant="warning">Under 18</Badge>}
                </div>
                <dl className="mt-4 space-y-2 text-sm">
                  <div className="flex items-center justify-between gap-3 rounded-xl bg-muted px-3 py-2">
                    <dt className="flex items-center gap-2 text-muted-foreground"><CalendarClock className="size-4" aria-hidden /> Next lesson</dt>
                    <dd className={cn("mono text-right font-semibold", !s.nextLesson && "text-muted-foreground")}>{s.nextLesson ?? "None booked"}</dd>
                  </div>
                  <div className="flex items-center justify-between gap-3 rounded-xl bg-muted px-3 py-2">
                    <dt className="flex items-center gap-2 text-muted-foreground"><Ticket className="size-4" aria-hidden /> Lesson credits</dt>
                    <dd className={cn("mono font-bold", s.credits > 0 ? "text-success" : "text-muted-foreground")}>{s.credits}</dd>
                  </div>
                </dl>
                <p className="mt-auto flex items-center justify-end gap-1 pt-4 text-sm font-bold text-brand-600 dark:text-brand-300">
                  View profile <ArrowRight className="size-4" aria-hidden />
                </p>
              </Link>
            </motion.li>
          ))}
        </motion.ul>
      )}
    </div>
  );
}
