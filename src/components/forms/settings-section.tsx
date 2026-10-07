import { Card } from "@/components/ui/card";

const tones = {
  pink: "bg-brand-100 text-brand-700 dark:bg-brand-900 dark:text-brand-200",
  violet: "bg-violet/10 text-violet dark:bg-violet/30 dark:text-brand-200",
  peach: "bg-saffron-soft text-saffron-deep",
  green: "bg-success-soft text-success",
} as const;

/** Settings card with a pastel icon bubble, title, one-line description and an optional badge on the right. */
export function SettingsSection({ icon: Icon, tone, title, description, aside, children, id }: {
  icon: React.ComponentType<{ className?: string }>;
  tone: keyof typeof tones;
  title: string;
  description: string;
  aside?: React.ReactNode;
  children: React.ReactNode;
  id?: string;
}) {
  return (
    <Card id={id} className="scroll-mt-24 space-y-5">
      <div className="flex items-start gap-3 border-b border-border pb-4">
        <span className={`grid size-11 shrink-0 place-items-center rounded-full ${tones[tone]}`}><Icon className="size-5" aria-hidden /></span>
        <div className="min-w-0 flex-1">
          <h2 className="text-xl font-extrabold">{title}</h2>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
        {aside}
      </div>
      {children}
    </Card>
  );
}

/** Sticky "Unsaved changes / Discard / Save" bar. Leaves room on the right for the mobile quick-actions button. */
export function SaveBar({ dirty, pending, onDiscard }: { dirty: boolean; pending: boolean; onDiscard: () => void }) {
  return (
    <div className="sticky bottom-20 z-10 md:bottom-4">
      <div className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-card/95 p-3 pr-[4.5rem] shadow-lift backdrop-blur md:pr-3">
        <div className="min-w-0 pl-1">
          <p className="flex items-center gap-2 text-sm font-bold">
            <span className={`size-2 shrink-0 rounded-full ${dirty ? "bg-brand-500 pulse-pink" : "bg-success"}`} aria-hidden />
            {dirty ? "Unsaved changes" : "All changes saved"}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {dirty && <button type="button" onClick={onDiscard} className="rounded-full px-4 py-2 text-sm font-semibold hover:bg-muted">Discard</button>}
          <button
            type="submit"
            disabled={(!dirty && !pending) || pending}
            className="inline-flex h-9 items-center justify-center rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground shadow-soft transition-colors hover:bg-brand-700 disabled:opacity-50 dark:hover:bg-brand-400"
          >
            {pending ? "Saving…" : "Save changes"}
          </button>
        </div>
      </div>
    </div>
  );
}
