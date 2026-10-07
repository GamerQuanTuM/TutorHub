import Link from "next/link";
import { GraduationCap } from "lucide-react";
import { ThemeToggle } from "@/components/theme";

/** Setup flows: slim header with the logo and a role badge, then one centred card. */
export function OnboardingShell({ badge, title, subtitle, children }: { badge: string; title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-muted/40">
      <header className="border-b border-border bg-card/80 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-5 py-3">
          <div className="flex items-center gap-3">
            <Link href="/" className="flex items-center gap-2 font-heading text-xl font-extrabold">
              <span className="grid size-9 place-items-center rounded-full bg-primary text-primary-foreground shadow-soft"><GraduationCap className="size-5" aria-hidden /></span>
              TutorHub
            </Link>
            <span className="rounded-full bg-saffron-soft px-3 py-0.5 text-xs font-bold text-saffron-deep">{badge}</span>
          </div>
          <ThemeToggle />
        </div>
      </header>
      <main className="mx-auto max-w-2xl px-4 py-8 sm:py-12">
        <div className="space-y-6 rounded-3xl border border-border bg-card p-6 shadow-lift sm:p-10">
          <div>
            <h1 className="text-3xl font-extrabold sm:text-4xl">{title}</h1>
            {subtitle && <p className="mt-2 text-muted-foreground">{subtitle}</p>}
          </div>
          {children}
        </div>
      </main>
    </div>
  );
}
