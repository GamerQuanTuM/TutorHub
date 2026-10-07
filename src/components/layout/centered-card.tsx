import Link from "next/link";
import { GraduationCap } from "lucide-react";
import { ThemeToggle } from "@/components/theme";

/** One centred card on a blush canvas, for forgot / reset password and other single-purpose pages. */
export function CenteredCard({ icon, title, subtitle, children, footer }: { icon: React.ReactNode; title: string; subtitle?: string; children?: React.ReactNode; footer?: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-muted/40">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-5 py-3">
          <Link href="/" className="flex items-center gap-2 font-heading text-xl font-extrabold">
            <span className="grid size-9 place-items-center rounded-full bg-primary text-primary-foreground shadow-soft"><GraduationCap className="size-5" aria-hidden /></span>
            TutorHub
          </Link>
          <ThemeToggle />
        </div>
      </header>
      <main className="grid flex-1 place-items-center px-4 py-10">
        <div className="w-full max-w-md space-y-6 rounded-3xl border border-border bg-card p-8 shadow-lift sm:p-10">
          <div className="text-center">
            <span className="mx-auto mb-4 grid size-16 place-items-center rounded-full bg-hero text-white shadow-glow">{icon}</span>
            <h1 className="text-3xl font-extrabold">{title}</h1>
            {subtitle && <p className="mt-2 text-muted-foreground">{subtitle}</p>}
          </div>
          {children}
          {footer && <div className="text-center text-sm font-semibold">{footer}</div>}
        </div>
      </main>
    </div>
  );
}
