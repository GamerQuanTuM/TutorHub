import Link from "next/link";
import { GraduationCap } from "lucide-react";

/** Full-screen status page (404, errors, setup): logo header, geometric illustration, gradient code, message and actions. */
export function SystemPage({ icon, code, title, description, actions }: { icon: React.ReactNode; code?: string; title: string; description: string; actions?: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-muted/40">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-3">
          <Link href="/" className="flex items-center gap-2 font-heading text-xl font-extrabold">
            <span className="grid size-9 place-items-center rounded-full bg-primary text-primary-foreground shadow-soft"><GraduationCap className="size-5" aria-hidden /></span>
            TutorHub
          </Link>
          {code && <span className="mono text-xs text-muted-foreground">Error {code}</span>}
        </div>
      </header>
      <main className="grid flex-1 place-items-center px-4 py-12 text-center">
        <div className="max-w-lg">
          <div aria-hidden className="relative mx-auto mb-6 size-40">
            <span className="absolute right-4 top-2 size-24 rounded-full border-[3px] border-violet" />
            <span className="absolute left-6 top-6 grid size-28 place-items-center rounded-full bg-hero text-white shadow-glow">{icon}</span>
            <span className="absolute bottom-3 left-2 size-7 rounded-full bg-saffron" />
            <span className="absolute left-14 top-0 size-3 rounded-full bg-violet/50" />
          </div>
          {code && <p className="bg-hero bg-clip-text font-heading text-8xl font-extrabold leading-none text-transparent">{code}</p>}
          <h1 className="mt-3 text-3xl font-extrabold sm:text-4xl">{title}</h1>
          <p className="mx-auto mt-3 max-w-md text-muted-foreground">{description}</p>
          {actions && <div className="mt-8 flex flex-wrap justify-center gap-3">{actions}</div>}
        </div>
      </main>
    </div>
  );
}
