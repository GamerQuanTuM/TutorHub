"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Gift, Plus, Sparkles, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FormBanner, TextField } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { EmptyState } from "@/components/shared/empty-state";
import { createPackageAction, deletePackageAction, togglePackageAction } from "@/lib/actions/packages";
import type { ActionState } from "@/lib/actions/helpers";

export interface PackageItem {
  id: string; name: string; lessonCount: number; priceLabel: string; perLessonLabel: string; saving: number; active: boolean; sold: number;
}

const initial: ActionState = {};

export function PackagesManager({ packages, currencySymbol, hourlyCents }: { packages: PackageItem[]; currencySymbol: string; hourlyCents: number }) {
  const [state, action, pending] = useActionState(createPackageAction, initial);
  const [, start] = useTransition();
  const { toast } = useToast();
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const shown = useRef(state);
  const err = state.fieldErrors ?? {};
  const [draft, setDraft] = useState({ count: 10, price: 0 });
  const normal = (hourlyCents / 100) * draft.count; // same number of 60-minute lessons at the normal rate
  const perLesson = draft.count > 0 && draft.price > 0 ? draft.price / draft.count : 0;
  const saved = normal - draft.price;
  const money = (n: number) => `${currencySymbol}${n.toFixed(2)}`;

  useEffect(() => {
    if (state !== shown.current && state.ok) { toast({ kind: "success", title: "Package created" }); formRef.current?.reset(); router.refresh(); }
    shown.current = state;
  }, [state, toast, router]);

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_1.4fr]">
      <Card>
        <h2 className="mb-1 text-lg font-extrabold">New package</h2>
        <p className="mb-4 text-sm text-muted-foreground">Students pay once and get lesson credits. Each booking uses one credit.</p>
        <form ref={formRef} action={action} className="space-y-4" noValidate
          onChange={(e) => { const f = new FormData(e.currentTarget); setDraft({ count: Number(f.get("lessonCount")) || 0, price: Number(f.get("price")) || 0 }); }}>
          <FormBanner error={state.error} />
          <TextField label="Name" name="name" placeholder="e.g. 10 lessons" error={err.name} />
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField label="Number of lessons" name="lessonCount" type="number" min={2} defaultValue={10} error={err.lessonCount} />
            <TextField label={`Total price (${currencySymbol})`} name="price" type="number" min={1} step="0.5" error={err.price} />
          </div>
          <div className="space-y-2 rounded-2xl border border-brand-200 bg-brand-50/70 p-4 dark:border-brand-700 dark:bg-brand-900/30">
            <p className="flex items-center gap-2 text-sm font-extrabold"><Sparkles className="size-4 text-brand-600 dark:text-brand-300" aria-hidden /> Live breakdown</p>
            <p className="flex items-baseline justify-between gap-3 text-sm"><span>Effective rate</span><span className="mono text-xl font-extrabold text-brand-600 dark:text-brand-300">{perLesson ? money(perLesson) : "–"}<span className="text-xs font-semibold text-muted-foreground"> / lesson</span></span></p>
            <p className="flex items-center justify-between gap-3 text-sm text-muted-foreground"><span>Your hourly rate</span><span className="mono font-semibold">{money(hourlyCents / 100)}</span></p>
            {perLesson > 0 && (saved > 0
              ? <p className="rounded-xl bg-success-soft px-3 py-2 text-sm font-semibold text-success">Students save {Math.round((saved / normal) * 100)}% ({money(saved)} in total)</p>
              : <p className="rounded-xl bg-muted px-3 py-2 text-sm text-muted-foreground">No discount compared with your hourly rate.</p>)}
          </div>
          <Button type="submit" loading={pending} className="w-full"><Plus className="size-4" aria-hidden /> Create package</Button>
        </form>
      </Card>

      <div>
        {packages.length === 0 ? (
          <EmptyState icon={Gift} title="No packages yet" description="Offer 5 or 10 lessons at a discount. It encourages students to commit and gets you paid up front." />
        ) : (
          <div className="space-y-4">
            <h2 className="flex items-center gap-2 text-2xl font-extrabold">Active packages <span className="mono rounded-full bg-muted px-2.5 py-0.5 text-sm font-bold text-muted-foreground">{packages.length}</span></h2>
            <ul className="space-y-3">
              {packages.map((p) => (
                <li key={p.id} className={`lift flex flex-wrap items-center gap-x-4 gap-y-3 rounded-2xl border bg-card p-5 shadow-soft ${p.active ? "border-border" : "border-dashed border-border opacity-80"}`}>
                  <div className="min-w-0 flex-1 basis-56">
                    <p className="flex flex-wrap items-baseline gap-x-2 font-heading text-xl font-extrabold">{p.name} <span className="mono text-brand-600 dark:text-brand-300">{p.priceLabel}</span> <span className="mono text-sm font-semibold text-muted-foreground">({p.perLessonLabel} each)</span></p>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      {p.saving > 0 && <Badge variant="success">Save {p.saving}%</Badge>}
                      {!p.active && <Badge variant="neutral">Hidden from your page</Badge>}
                      <span className="mono text-xs text-muted-foreground">{p.lessonCount} lessons · sold {p.sold}×</span>
                    </div>
                  </div>
                  <button type="button" role="switch" aria-checked={p.active} aria-label={`${p.active ? "Hide" : "Show"} ${p.name}`}
                    onClick={() => start(async () => { await togglePackageAction(p.id, !p.active); router.refresh(); })}
                    className="inline-flex items-center gap-2 text-xs font-bold text-muted-foreground">
                    {p.active ? "Active" : "Hidden"}
                    <span className={`flex h-6 w-11 items-center rounded-full p-0.5 transition-colors ${p.active ? "bg-success" : "bg-muted-foreground/40"}`}>
                      <span className={`size-5 rounded-full bg-white shadow transition-transform ${p.active ? "translate-x-5" : ""}`} />
                    </span>
                  </button>
                  <Button size="sm" variant="ghost" aria-label={`Delete ${p.name}`}
                    onClick={() => { if (confirm(`Delete "${p.name}"?`)) start(async () => { const r = await deletePackageAction(p.id); toast({ kind: "info", title: r.message ?? "Deleted" }); router.refresh(); }); }}>
                    <Trash2 className="size-4 text-danger" aria-hidden />
                  </Button>
                </li>
              ))}
            </ul>
            <p className="rounded-2xl bg-brand-50 p-4 text-sm text-brand-900 dark:bg-brand-900/30 dark:text-brand-100">Students pay once and get lesson credits that are used automatically when they book.</p>
          </div>
        )}
      </div>
    </div>
  );
}
