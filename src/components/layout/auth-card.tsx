import Link from "next/link";
import { Check, GraduationCap } from "lucide-react";
import { ThemeToggle } from "@/components/theme";

/**
 * Auth layout used by login / signup / forgot password / invite pages.
 * Desktop and tablet: a brand panel beside the form. Mobile: the form alone under a slim logo bar.
 */
export function AuthCard({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle?: string;
  children?: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <div className="grid min-h-screen lg:grid-cols-[1fr_minmax(480px,560px)]">
      <aside className="relative hidden flex-col justify-between overflow-hidden bg-hero p-12 text-white lg:flex">
        <Link href="/" className="flex items-center gap-2 font-heading text-2xl font-extrabold">
          <span className="grid size-10 place-items-center rounded-full bg-white/15"><GraduationCap className="size-5" aria-hidden /></span>
          TutorHub
        </Link>
        <div>
          <p className="font-heading text-5xl font-extrabold leading-[1.1]">Teach. Learn. Celebrate.</p>
          <ul className="mt-8 space-y-4">
            {["Bookings and payments in one calm place", "Video lessons with a shared whiteboard", "Materials and homework, 0% commission"].map((t) => (
              <li key={t} className="flex items-center gap-3 text-brand-50"><span className="grid size-8 shrink-0 place-items-center rounded-full bg-white/15"><Check className="size-4" aria-hidden /></span>{t}</li>
            ))}
          </ul>
        </div>
        <span aria-hidden className="pointer-events-none absolute -bottom-24 -right-24 size-80 rounded-full bg-saffron/90" />
        <span aria-hidden className="pointer-events-none absolute -bottom-10 right-32 size-24 rounded-full border-2 border-white/30" />
      </aside>

      <div className="relative flex flex-col px-5 py-6 sm:px-10">
        <div className="flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 font-heading text-xl font-extrabold lg:invisible">
            <span className="grid size-9 place-items-center rounded-full bg-primary text-primary-foreground shadow-soft"><GraduationCap className="size-5" aria-hidden /></span>
            TutorHub
          </Link>
          <ThemeToggle />
        </div>
        <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center py-10">
          {title && <h1 className="text-4xl font-extrabold">{title}</h1>}
          {subtitle && <p className="mt-2 text-muted-foreground">{subtitle}</p>}
          <div className={title ? "mt-8" : ""}>{children}</div>
          {footer && <div className="mt-6 text-sm text-muted-foreground">{footer}</div>}
        </div>
      </div>
    </div>
  );
}
