"use client";

import { useActionState, useState, useTransition } from "react";
import { FileUp, Link2, Mail, RotateCw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FormBanner, TextField } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { CopyButton } from "@/components/shared/copy-button";
import { importStudentsCsvAction, inviteStudentAction, resendInviteAction, revokeInviteAction, type ImportOutcome } from "@/lib/actions/students";
import { parseStudentCsv } from "@/lib/csv";
import { cn } from "@/lib/utils";

export interface PendingInvite { id: string; name: string; email: string | null; credits: number; link: string }

type Tab = "link" | "email" | "csv";

export function InvitePanel({ pending }: { pending: PendingInvite[] }) {
  const [tab, setTab] = useState<Tab>("email");
  const tabs: { id: Tab; label: string; icon: typeof Mail }[] = [
    { id: "email", label: "By email", icon: Mail },
    { id: "link", label: "By link", icon: Link2 },
    { id: "csv", label: "Import CSV", icon: FileUp },
  ];
  return (
    <div className="space-y-6">
      <Card>
        <div role="tablist" aria-label="How to invite" className="mb-5 flex flex-wrap gap-2 rounded-full bg-muted p-1">
          {tabs.map((t) => (
            <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)}
              className={cn("flex flex-1 items-center justify-center gap-2 rounded-full px-4 py-2 text-sm font-bold transition-colors", tab === t.id ? "bg-primary text-primary-foreground shadow-soft" : "text-muted-foreground hover:text-foreground")}>
              <t.icon className="size-4" aria-hidden /> {t.label}
            </button>
          ))}
        </div>
        {tab === "email" && <SingleInvite mode="email" />}
        {tab === "link" && <SingleInvite mode="link" />}
        {tab === "csv" && <CsvImport />}
      </Card>
      <PendingList pending={pending} />
    </div>
  );
}

const initial: Awaited<ReturnType<typeof inviteStudentAction>> = {};

function SingleInvite({ mode }: { mode: "email" | "link" }) {
  const [state, action, pending] = useActionState(inviteStudentAction, initial);
  const err = state.fieldErrors ?? {};
  return (
    <form action={action} className="space-y-4" noValidate>
      <input type="hidden" name="mode" value={mode} />
      <p className="text-muted-foreground">
        {mode === "email" ? "We'll email them a personal invitation. They accept it and are added to your students." : "Create a private one-time link and send it on WhatsApp, a message, or anywhere you like."}
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField label={mode === "email" ? "Student's name" : "Name (optional)"} name="fullName" error={err.fullName} />
        {mode === "email" && <TextField label="Email" name="email" type="email" error={err.email} />}
        <TextField label="Starting lesson credits" name="credits" type="number" min={0} max={100} defaultValue={0} hint="Optional: e.g. a package they already paid for" error={err.credits} />
      </div>
      <FormBanner error={state.error} message={state.ok ? state.message : undefined} />
      {state.ok && state.link && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl bg-muted p-3">
          <code className="min-w-0 flex-1 truncate text-sm">{state.link}</code>
          <CopyButton text={state.link} />
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4"><p className="text-xs text-muted-foreground">{mode === "email" ? "They get a personal link to join you." : "One private link per student."}</p><Button type="submit" loading={pending}>{mode === "email" ? "Send invitation" : "Create invite link"}</Button></div>
    </form>
  );
}

const SAMPLE = "name,email,credits\nMaria Lopez,maria@example.com,5\nJan Kowalski,jan@example.com,0";

function CsvImport() {
  const [text, setText] = useState("");
  const [result, setResult] = useState<ImportOutcome | null>(null);
  const [pending, start] = useTransition();
  const { toast } = useToast();
  const preview = text.trim() ? parseStudentCsv(text) : null;

  function onFile(file: File | undefined) {
    if (!file) return;
    if (file.size > 200_000) return toast({ kind: "error", title: "That file is too large (max 200 KB)." });
    file.text().then(setText);
  }

  return (
    <div className="space-y-4">
      <p className="text-muted-foreground">Upload a CSV with the columns <strong>name, email, credits</strong>. Each student gets an invitation email, and the credits are added when they accept.</p>
      <div className="flex flex-wrap items-center gap-3">
        <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-border bg-card px-4 py-2.5 font-semibold hover:bg-muted">
          <FileUp className="size-4" aria-hidden /> Choose CSV file
          <input type="file" accept=".csv,text/csv" className="sr-only" onChange={(e) => onFile(e.target.files?.[0])} />
        </label>
        <Button type="button" variant="ghost" size="sm" onClick={() => setText(SAMPLE)}>Use example</Button>
      </div>
      <label htmlFor="csv" className="sr-only">CSV contents</label>
      <textarea id="csv" rows={6} value={text} onChange={(e) => setText(e.target.value)} placeholder={SAMPLE} className="w-full rounded-xl border border-border bg-card p-3 font-mono text-sm" />

      {preview && (
        <div className="space-y-2" aria-live="polite">
          {preview.errors.length > 0 && (
            <ul className="space-y-1 rounded-xl bg-danger-soft p-3 text-sm text-danger" role="alert">
              {preview.errors.slice(0, 6).map((e) => <li key={e.line + e.message}>⚠ Line {e.line}: {e.message}</li>)}
              {preview.errors.length > 6 && <li>…and {preview.errors.length - 6} more</li>}
            </ul>
          )}
          {preview.rows.length > 0 && (
            <div className="relative overflow-x-auto rounded-xl border border-border">
              <table className="w-full text-left text-sm">
                <caption className="sr-only">Students to import</caption>
                <thead className="bg-muted"><tr><th className="px-3 py-2">Name</th><th className="px-3 py-2">Email</th><th className="px-3 py-2">Credits</th></tr></thead>
                <tbody>{preview.rows.slice(0, 8).map((r) => <tr key={r.email} className="border-t border-border"><td className="px-3 py-2">{r.name}</td><td className="px-3 py-2">{r.email}</td><td className="px-3 py-2">{r.credits}</td></tr>)}</tbody>
              </table>
              {preview.rows.length > 8 && <p className="border-t border-border px-3 py-2 text-sm text-muted-foreground">…and {preview.rows.length - 8} more</p>}
            </div>
          )}
        </div>
      )}
      <FormBanner error={result?.error} message={result?.ok ? result.message : undefined} />
      <Button type="button" disabled={!preview || preview.errors.length > 0 || preview.rows.length === 0} loading={pending}
        onClick={() => start(async () => { const r = await importStudentsCsvAction(text); setResult(r); if (r.ok) setText(""); })}>
        Import {preview?.rows.length ? `${preview.rows.length} student${preview.rows.length === 1 ? "" : "s"}` : "students"}
      </Button>
    </div>
  );
}

function PendingList({ pending }: { pending: PendingInvite[] }) {
  const [, start] = useTransition();
  const { toast } = useToast();
  if (!pending.length) return null;
  return (
    <Card>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xl font-extrabold">Pending invites</h2>
        <span className="rounded-full bg-muted px-3 py-1 text-xs font-bold text-muted-foreground">{pending.length} awaiting response</span>
      </div>
      <ul className="space-y-3">
        {pending.map((p) => (
          <li key={p.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl border border-border p-3.5">
            <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-full bg-violet/10 text-sm font-extrabold text-violet dark:bg-violet/30 dark:text-brand-200">{p.name.split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase()}</span>
            <div className="min-w-0 flex-1 basis-48">
              <p className="truncate font-heading font-bold">{p.name}</p>
              <p className="truncate text-sm text-muted-foreground">{p.email ?? "Invite link"}{p.credits > 0 ? ` · ${p.credits} credits` : ""}</p>
            </div>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-saffron-soft px-3 py-1 text-xs font-bold text-saffron-deep"><i className="size-1.5 rounded-full bg-saffron-deep" /> Pending</span>
            <CopyButton text={p.link} label="Copy link" />
            {p.email && (
              <Button size="sm" variant="ghost" onClick={() => start(async () => { const r = await resendInviteAction(p.id); toast({ kind: r.error ? "error" : "success", title: r.error ?? r.message ?? "Sent" }); })}><RotateCw className="size-4" aria-hidden /> Resend</Button>
            )}
            <Button size="sm" variant="ghost" aria-label={`Revoke invitation for ${p.name}`} onClick={() => start(async () => { await revokeInviteAction(p.id); toast({ kind: "info", title: "Invitation revoked" }); })}><Trash2 className="size-4 text-danger" aria-hidden /></Button>
          </li>
        ))}
      </ul>
    </Card>
  );
}
