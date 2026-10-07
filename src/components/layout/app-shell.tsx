"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import {
  BarChart3, BookOpen, CalendarDays, CalendarClock, CreditCard, FileText, GraduationCap,
  Gift, Home, LogOut, MoreHorizontal, Plus, Settings, Users, Video, Search, UserPlus, Upload, ClipboardList, X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Avatar } from "@/components/ui/avatar";
import { ThemeToggle } from "@/components/theme";
import { Modal } from "@/components/ui/modal";
import { NotificationBell } from "./notification-bell";
import type { NotificationFeed } from "@/lib/notifications";
import { CommandPalette, type PaletteItem } from "./command-palette";
import { signOutAction } from "@/lib/actions/auth";

const icons = {
  home: Home, calendar: CalendarDays, users: Users, book: BookOpen, homework: ClipboardList, clock: CalendarClock,
  gift: Gift, chart: BarChart3, card: CreditCard, settings: Settings, video: Video, grad: GraduationCap, file: FileText,
} as const;

export interface NavItem {
  href: string;
  label: string;
  icon: keyof typeof icons;
}
export interface QuickAction {
  href: string;
  label: string;
  icon: "invite" | "upload" | "homework" | "book";
}
const actionIcons = { invite: UserPlus, upload: Upload, homework: ClipboardList, book: Video };

/**
 * Responsive app frame.
 *  - Desktop (lg+): 248px sidebar with labels
 *  - Tablet (md to lg): 72px icon rail, labels become tooltips
 *  - Mobile: top bar + bottom tab bar (4 tabs + More) + floating quick actions
 */
export function AppShell({
  nav,
  actions,
  user,
  roleLabel,
  palette,
  notifications,
  children,
}: {
  nav: NavItem[];
  actions: QuickAction[];
  user: { name: string; avatarUrl: string | null };
  roleLabel: string;
  palette: PaletteItem[];
  notifications: NotificationFeed;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const home = nav[0]?.href ?? "/"; // the logo takes you to your dashboard, not the marketing page
  const [more, setMore] = useState(false);
  const [fab, setFab] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);

  // Cmd/Ctrl+K opens the command palette
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const isActive = (href: string) => pathname === href || pathname.startsWith(href + "/");
  const tabs = nav.slice(0, 4);
  const rest = nav.slice(4);

  return (
    <div className="min-h-screen">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-[70] focus:rounded-lg focus:bg-card focus:p-3">
        Skip to content
      </a>

      {/* Tablet rail + desktop sidebar */}
      <aside
        className="fixed inset-y-0 left-0 z-30 hidden w-[72px] flex-col border-r border-border bg-card md:flex lg:w-[248px]"
        aria-label="Main navigation"
      >
        <div className="flex h-[72px] items-center justify-center px-4 lg:justify-start">
          <Link href={home} className="flex items-center gap-3 font-heading text-2xl font-extrabold" aria-label="TutorHub home">
            <span className="grid size-10 place-items-center rounded-full bg-primary text-primary-foreground">
              <GraduationCap className="size-5" aria-hidden />
            </span>
            <span className="hidden lg:inline">TutorHub</span>
          </Link>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-2">
          {nav.map((item) => {
            const Icon = icons[item.icon];
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                title={item.label}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative flex items-center justify-center gap-3 rounded-lg py-2.5 font-medium transition-colors lg:justify-start lg:px-3",
                  active ? "bg-brand-50 text-brand-700 dark:bg-brand-900/40 dark:text-brand-200" : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                {active && <motion.span layoutId="nav-indicator" className="absolute -left-3 top-2 h-[calc(100%-1rem)] w-1.5 rounded-r-full bg-brand-500" />}
                <Icon className="size-5 shrink-0" aria-hidden />
                <span className="hidden lg:inline">{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="space-y-2 border-t border-border p-3">
          <button
            onClick={() => setPaletteOpen(true)}
            className="flex w-full items-center justify-center gap-3 rounded-lg border border-border px-3 py-2 text-muted-foreground hover:bg-muted lg:justify-start"
            aria-label="Open command palette"
            title="Search"
          >
            <Search className="size-4 shrink-0" aria-hidden />
            <span className="hidden flex-1 items-center justify-between text-sm lg:flex">
              Search <kbd className="rounded bg-muted px-1.5 py-0.5 text-xs">Ctrl K</kbd>
            </span>
          </button>
          <div className="flex items-center justify-center gap-2 lg:justify-between lg:px-1">
            <div className="flex min-w-0 items-center gap-2.5">
              <Avatar name={user.name} src={user.avatarUrl} size="sm" />
              <div className="hidden min-w-0 leading-tight lg:block">
                <p className="truncate text-sm font-semibold">{user.name}</p>
                <p className="text-xs text-muted-foreground">{roleLabel}</p>
              </div>
            </div>
            <form action={signOutAction} className="hidden lg:block">
              <button aria-label="Sign out" title="Sign out" className="grid size-9 place-items-center rounded-full text-muted-foreground hover:bg-muted">
                <LogOut className="size-4" aria-hidden />
              </button>
            </form>
          </div>
          <form action={signOutAction} className="lg:hidden">
            <button aria-label="Sign out" title="Sign out" className="grid h-9 w-full place-items-center rounded-lg text-muted-foreground hover:bg-muted">
              <LogOut className="size-4" aria-hidden />
            </button>
          </form>
        </div>
      </aside>

      <div className="md:pl-[72px] lg:pl-[248px]">
        {/* Top bar */}
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between gap-3 border-b border-border bg-background/90 px-4 backdrop-blur md:px-8">
          <Link href={home} className="flex items-center gap-2.5 md:hidden">
            <span className="grid size-9 place-items-center rounded-full bg-primary text-primary-foreground">
              <GraduationCap className="size-5" aria-hidden />
            </span>
            <span className="font-heading text-xl font-extrabold">TutorHub</span>
          </Link>
          <button
            onClick={() => setPaletteOpen(true)}
            className="hidden h-10 w-full max-w-md items-center gap-2 rounded-full border border-border bg-card px-4 text-sm text-muted-foreground hover:bg-muted md:flex"
            aria-label="Search"
          >
            <Search className="size-4" aria-hidden /> Search students, lessons, pages
          </button>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPaletteOpen(true)}
              aria-label="Search"
              className="grid size-10 place-items-center rounded-full border border-border bg-card hover:bg-muted md:hidden"
            >
              <Search className="size-5" aria-hidden />
            </button>
            <NotificationBell feed={notifications} />
            <ThemeToggle />
            <div className="md:hidden">
              <Avatar name={user.name} src={user.avatarUrl} size="sm" />
            </div>
          </div>
        </header>

        <main id="main" className="mx-auto max-w-[1200px] px-4 pb-28 pt-6 md:px-8 md:pb-12 md:pt-8">
          {children}
        </main>
      </div>

      {/* Mobile bottom tab bar */}
      <nav
        className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-border bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
        aria-label="Main navigation"
      >
        {tabs.map((item) => {
          const Icon = icons[item.icon];
          const active = isActive(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn("relative flex flex-col items-center gap-0.5 py-2.5 text-xs font-medium", active ? "text-brand-700 dark:text-brand-100" : "text-muted-foreground")}
            >
              {active && <motion.span layoutId="tab-indicator" className="absolute top-0 h-1 w-10 rounded-b-full bg-brand-500" />}
              <Icon className="size-6" aria-hidden />
              {item.label}
            </Link>
          );
        })}
        <button onClick={() => setMore(true)} className="flex flex-col items-center gap-0.5 py-2.5 text-xs font-medium text-muted-foreground">
          <MoreHorizontal className="size-6" aria-hidden />
          More
        </button>
      </nav>

      <Modal open={more} onOpenChange={setMore} title="More">
        <ul className="grid grid-cols-2 gap-2">
          {rest.map((item) => {
            const Icon = icons[item.icon];
            return (
              <li key={item.href}>
                <Link href={item.href} onClick={() => setMore(false)} className="flex items-center gap-2 rounded-lg border border-border p-3 font-medium hover:bg-muted">
                  <Icon className="size-5 text-brand-600 dark:text-brand-200" aria-hidden />
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
        <form action={signOutAction} className="mt-4">
          <button className="flex w-full items-center justify-center gap-2 rounded-lg border border-border p-3 font-medium text-muted-foreground hover:bg-muted">
            <LogOut className="size-4" aria-hidden /> Sign out
          </button>
        </form>
      </Modal>

      {/* Mobile floating quick actions */}
      <div className="fixed bottom-20 right-4 z-30 md:hidden">
        <AnimatePresence>
          {fab && (
            <motion.ul initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }} className="mb-3 space-y-2">
              {actions.map((a) => {
                const Icon = actionIcons[a.icon];
                return (
                  <li key={a.href} className="flex justify-end">
                    <Link
                      href={a.href}
                      onClick={() => setFab(false)}
                      className="flex items-center gap-2 rounded-full border border-border bg-card px-4 py-2.5 font-semibold shadow-lift"
                    >
                      <Icon className="size-4 text-brand-600 dark:text-brand-200" aria-hidden />
                      {a.label}
                    </Link>
                  </li>
                );
              })}
            </motion.ul>
          )}
        </AnimatePresence>
        <div className="flex justify-end">
          <button
            onClick={() => setFab((f) => !f)}
            aria-expanded={fab}
            aria-label={fab ? "Close quick actions" : "Open quick actions"}
            className="grid size-14 place-items-center rounded-full bg-hero shadow-glow transition active:scale-95"
          >
            {fab ? <X className="size-6" aria-hidden /> : <Plus className="size-6" aria-hidden />}
          </button>
        </div>
      </div>

      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} items={palette} />
    </div>
  );
}
