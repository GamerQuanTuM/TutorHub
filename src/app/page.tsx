import Link from "next/link";
import {
  ArrowRight, BellRing, CalendarCheck, Check, CheckCircle2, CreditCard, GraduationCap, Mic, Monitor, PenLine, Percent,
  PhoneOff, ShieldCheck, Sparkles, Timer, Users, Video, Wallet, Eraser, Shapes, Search,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme";
import { Avatar } from "@/components/ui/avatar";
import { RevealGroup, RevealItem } from "@/components/shared/reveal";
import { getSession, homeFor } from "@/lib/auth/session";
import { proPrice } from "@/lib/plans";
import { formatMoney } from "@/lib/time";

export const metadata = { title: "TutorHub · Teach and get paid, 100% of your earnings" };

const values = [
  {
    icon: Percent, tint: "bg-brand-100 text-brand-700 dark:bg-brand-900 dark:text-brand-200",
    tag: "Keep 100%", tagTint: "bg-brand-50 text-brand-700 dark:bg-brand-900/60 dark:text-brand-200",
    title: "0% Marketplace Commission",
    text: "You earned it, you keep it. Students pay you directly through your own Stripe account, so TutorHub never touches your lesson fees. You only pay Stripe's processing fee.",
    left: [Check, "Flat subscription only"], right: "No commission, ever",
  },
  {
    icon: PenLine, tint: "bg-violet/10 text-violet dark:bg-violet/30 dark:text-brand-200",
    tag: "Real-time collaboration", tagTint: "bg-violet/10 text-violet dark:bg-violet/30 dark:text-brand-200",
    title: "Integrated Video + Whiteboard",
    text: "Video lessons paired with a shared whiteboard, lesson notes and materials, all inside one lesson room. No separate meeting links to juggle.",
    left: [Monitor, "Works in any modern browser"], right: "Nothing to install",
  },
  {
    icon: CalendarCheck, tint: "bg-brand-100 text-brand-700 dark:bg-brand-900 dark:text-brand-200",
    tag: "No back-and-forth emails", tagTint: "bg-brand-50 text-brand-700 dark:bg-brand-900/60 dark:text-brand-200",
    title: "Automated Scheduling",
    text: "Set your weekly hours once. Students book in their own time zone, get email reminders, and your cancellation and reschedule rules are enforced for you.",
    left: [BellRing, "Automatic lesson reminders"], right: "Custom availability rules",
  },
  {
    icon: CreditCard, tint: "bg-success-soft text-success",
    tag: "Powered by Stripe", tagTint: "bg-success-soft text-success",
    title: "Direct Payouts via Stripe Connect",
    text: "Students pay by card on your own Stripe account and Stripe pays out to your bank. Sell lesson packages as credits that are used automatically when booking.",
    left: [ShieldCheck, "Secure card payments"], right: "Refunds handled for you",
  },
] as const;

const steps = [
  { icon: CalendarCheck, title: "Set your hours", text: "Pick your weekly availability and price. Your booking page is ready in minutes." },
  { icon: Users, title: "Bring your students", text: "Share your link or invite by email. Students book and pay without any fuss." },
  { icon: Video, title: "Teach and get paid", text: "Video lessons with a shared whiteboard. Payments land straight in your Stripe account." },
];

const faqs = [
  ["Do you take a commission on my lessons?", "No. Students pay you directly through your own Stripe account. You keep 100% of the lesson price minus Stripe's standard processing fees."],
  ["What does the Free plan include?", "Up to 3 students with booking, payments, video lessons, materials and homework. Upgrade to Pro for unlimited students plus shared lesson notes and recordings."],
  ["Do my students need an account?", "They can browse your page and pick a time without one. They sign up or log in at the payment step, which takes under a minute."],
  ["Which time zone are lesson times in?", "Each person sees times in their own time zone. We store everything in UTC and convert for display, including in emails."],
  ["Can I offer a free trial lesson?", "Yes. Turn it on in settings, choose its length, and each student can book one trial per tutor."],
  ["Is it safe for students under 18?", "Yes. For under-18 students we record a parent or guardian's consent during sign-up."],
];

export default async function Home() {
  // Signed-in people must never be asked to log in or sign up again: every button takes them into the app
  const session = await getSession();
  const role = session?.profile.role;
  const dashboard = role ? homeFor(role) : null;
  const goPro = role === "tutor" ? { href: "/tutor/billing", label: "Upgrade to Pro" } : dashboard ? { href: dashboard, label: "Open my dashboard" } : { href: "/signup?role=tutor", label: "Go Pro" };
  const startFree = dashboard ? { href: dashboard, label: "Open my dashboard" } : { href: "/signup?role=tutor", label: "Start free" };
  const pro = proPrice();

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 border-b border-border/70 bg-background/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-[1200px] items-center justify-between gap-4 px-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2.5 font-heading text-2xl font-extrabold text-brand-600 dark:text-brand-300">
            <span className="grid size-9 place-items-center rounded-xl bg-hero"><GraduationCap className="size-5" aria-hidden /></span>
            TutorHub
          </Link>
          <nav className="hidden items-center gap-8 text-sm font-medium md:flex" aria-label="Site">
            <a href="#features" className="hover:text-link">Features</a>
            <a href="#pricing" className="hover:text-link">Pricing</a>
            <a href="#how" className="hover:text-link">How it works</a>
            <a href="#faq" className="hover:text-link">FAQ</a>
          </nav>
          <div className="flex items-center gap-1 sm:gap-2">
            <ThemeToggle />
            {dashboard ? (
              <Button asChild size="sm"><Link href={dashboard}>Go to my dashboard</Link></Button>
            ) : (
              <>
                <Button asChild variant="ghost" size="sm"><Link href="/login">Sign in</Link></Button>
                <Button asChild size="sm" className="hidden sm:inline-flex"><Link href="/signup?role=tutor">Start teaching free <ArrowRight className="size-4" aria-hidden /></Link></Button>
                <Button asChild size="sm" className="sm:hidden"><Link href="/signup">Sign up</Link></Button>
              </>
            )}
          </div>
        </div>
      </header>

      <main>
        {/* Hero */}
        <section className="relative overflow-hidden">
          <div aria-hidden className="absolute inset-x-0 top-0 -z-10 h-[640px] bg-gradient-to-b from-brand-50 via-brand-50/40 to-transparent dark:from-brand-900/40 dark:via-transparent" />
          <div className="mx-auto max-w-[1200px] px-4 pb-16 pt-12 text-center sm:px-6 sm:pt-16">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-brand-200 bg-brand-50 px-4 py-1.5 text-sm font-semibold text-brand-700 dark:border-brand-700 dark:bg-brand-900/50 dark:text-brand-200">
              <Sparkles className="size-4" aria-hidden /> Flat subscription · 0% commission
            </span>
            <h1 className="mx-auto mt-6 max-w-4xl text-5xl font-extrabold leading-[1.05] tracking-tight sm:text-6xl lg:text-7xl">
              Teach and get paid.{" "}
              <span className="bg-gradient-to-r from-brand-600 to-violet bg-clip-text text-transparent dark:from-brand-300 dark:to-brand-200">100% of your earnings.</span>
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground sm:text-xl">
              Keep every penny you charge. A booking page, video classroom with a shared whiteboard, materials, homework and Stripe payments, without marketplace fees.
            </p>
            <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Button asChild size="lg"><Link href={dashboard ?? "/signup?role=tutor"}>{dashboard ? "Open my dashboard" : "Start teaching free"} <ArrowRight className="size-5" aria-hidden /></Link></Button>
              {!dashboard && <Button asChild size="lg" variant="outline"><Link href="/signup?role=student">I&apos;m a student <Search className="size-5" aria-hidden /></Link></Button>}
            </div>
            <p className="mt-5 text-sm text-muted-foreground">No credit card required · Free plan for up to 3 students</p>

            {/* Classroom preview (illustration) */}
            <div aria-hidden className="relative mx-auto mt-14 max-w-5xl text-left">
              <div className="rounded-3xl border border-border bg-card shadow-lift">
                <div className="flex items-center gap-3 border-b border-border px-5 py-3 text-sm text-muted-foreground">
                  <span className="flex gap-1.5"><i className="size-3 rounded-full bg-[#ff6b6b]" /><i className="size-3 rounded-full bg-[#ffd166]" /><i className="size-3 rounded-full bg-[#4ade80]" /></span>
                  <span className="flex items-center gap-2"><span className="size-2 rounded-full bg-success pulse-pink" /> Live classroom</span>
                </div>
                <div className="grid gap-6 bg-[radial-gradient(var(--border)_1px,transparent_1px)] [background-size:20px_20px] p-5 sm:p-8 md:grid-cols-[1fr_220px]">
                  <div className="space-y-5">
                    <div className="rounded-2xl border border-border bg-card p-5 shadow-soft">
                      <p className="flex items-center gap-2 text-sm font-bold text-brand-600 dark:text-brand-300"><Shapes className="size-4" /> Fundamental Theorem of Calculus</p>
                      <p className="mono mt-3 rounded-xl bg-brand-50 px-4 py-3 text-lg font-semibold dark:bg-brand-900/40 sm:text-2xl">∫ f(x) dx = F(b) − F(a)</p>
                      <p className="mt-3 text-sm text-muted-foreground">Differentiating the integral reconstructs the original rate function.</p>
                    </div>
                    <div className="max-w-sm -rotate-2 rounded-2xl bg-warning-soft p-5 text-warning shadow-soft">
                      <p className="text-xs font-extrabold tracking-wide">CHECK THE NEXT STEP</p>
                      <p className="mt-1 text-sm">Don&apos;t forget the constant of integration for indefinite antiderivatives!</p>
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center gap-2 rounded-full border border-border bg-card p-1.5 shadow-soft">
                        <span className="grid size-9 place-items-center rounded-full bg-brand-100 text-brand-700 dark:bg-brand-900 dark:text-brand-200"><PenLine className="size-4" /></span>
                        <span className="grid size-9 place-items-center rounded-full text-muted-foreground"><Shapes className="size-4" /></span>
                        <span className="grid size-9 place-items-center rounded-full text-muted-foreground"><Eraser className="size-4" /></span>
                        <i className="size-5 rounded-full bg-brand-600" /><i className="size-5 rounded-full bg-violet" /><i className="mr-2 size-5 rounded-full bg-success" />
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="mono flex items-center gap-1.5 rounded-full border border-border bg-card px-4 py-2 text-sm"><Timer className="size-4 text-brand-600" /> 42:15 remaining</span>
                        <span className="grid size-10 place-items-center rounded-full border border-border bg-card"><Mic className="size-4" /></span>
                        <span className="flex items-center gap-1.5 rounded-full border border-danger/30 bg-danger-soft px-4 py-2 text-sm font-semibold text-danger"><PhoneOff className="size-4" /> End</span>
                      </div>
                    </div>
                  </div>
                  <div className="hidden space-y-3 md:block">
                    <div className="rounded-2xl border-2 border-brand-500 bg-brand-50 p-4 dark:bg-brand-900/40"><div className="flex items-center gap-3"><Avatar name="Sarah Tutor" size="md" /><div><p className="text-sm font-bold">Sarah T.</p><span className="rounded-full bg-brand-600 px-2 py-0.5 text-[10px] font-bold text-white">Tutor</span></div></div></div>
                    <div className="rounded-2xl border border-border bg-card p-4"><div className="flex items-center gap-3"><Avatar name="Alex Student" size="md" /><p className="text-sm font-bold">Alex M.</p></div></div>
                  </div>
                </div>
              </div>
              <div className="absolute -bottom-12 left-4 flex items-center gap-3 rounded-2xl border border-border bg-card p-4 shadow-lift sm:left-8">
                <span className="grid size-11 place-items-center rounded-full bg-success-soft text-success"><Wallet className="size-5" /></span>
                <div>
                  <p className="text-[11px] font-bold tracking-wider text-muted-foreground">LESSON PAYMENT</p>
                  <p className="mono text-xl font-bold">{formatMoney(6500, pro.currency)} <span className="rounded-full bg-success-soft px-2 py-0.5 font-sans text-xs text-success">0% platform fee</span></p>
                </div>
              </div>
              <div className="absolute -top-5 right-4 hidden items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3 shadow-lift sm:flex">
                <BellRing className="size-5 text-brand-600" />
                <div><p className="text-sm font-bold">Reminder sent</p><p className="text-xs text-muted-foreground">Alex will be there in 1 hour</p></div>
              </div>
            </div>
          </div>
        </section>

        {/* Value grid */}
        <section id="features" className="scroll-mt-20 border-t border-border py-20" aria-labelledby="features-title">
          <div className="mx-auto max-w-[1200px] px-4 sm:px-6">
            <p className="text-center text-sm font-bold uppercase tracking-wider text-brand-600 dark:text-brand-300">Built for independent educators</p>
            <h2 id="features-title" className="mx-auto mt-3 max-w-3xl text-center text-4xl font-extrabold sm:text-5xl">Everything you need to run your private tutoring business</h2>
            <p className="mx-auto mt-4 max-w-2xl text-center text-lg text-muted-foreground">Say goodbye to clumsy meeting links, manual bank transfers and agency cuts. One joyful home for your teaching.</p>
            <RevealGroup className="mt-12 grid gap-5 md:grid-cols-2">
              {values.map((v) => {
                const LeftIcon = v.left[0];
                return (
                <RevealItem key={v.title} className="lift flex flex-col rounded-3xl border border-border bg-card p-7 shadow-soft">
                  <span className={`grid size-14 place-items-center rounded-2xl ${v.tint}`}><v.icon className="size-6" aria-hidden /></span>
                  <span className={`mt-6 w-fit rounded-full px-3 py-1 text-xs font-bold ${v.tagTint}`}>{v.tag}</span>
                  <h3 className="mt-3 text-2xl font-extrabold">{v.title}</h3>
                  <p className="mt-2 flex-1 text-muted-foreground">{v.text}</p>
                  <div className="mt-6 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-4 text-sm">
                    <span className="flex items-center gap-1.5 font-semibold text-success"><LeftIcon className="size-4" aria-hidden />{v.left[1]}</span>
                    <span className="text-muted-foreground">{v.right}</span>
                  </div>
                </RevealItem>
                );
              })}
            </RevealGroup>
          </div>
        </section>

        {/* How it works */}
        <section id="how" className="scroll-mt-20 bg-muted/60 py-20" aria-labelledby="how-title">
          <div className="mx-auto max-w-[1200px] px-4 sm:px-6">
            <h2 id="how-title" className="text-center text-4xl font-extrabold sm:text-5xl">How it works</h2>
            <RevealGroup className="mt-12 grid gap-5 md:grid-cols-3">
              {steps.map((s, i) => (
                <RevealItem key={s.title} className="rounded-3xl border border-border bg-card p-7 shadow-soft">
                  <div className="flex items-center gap-3">
                    <span className="grid size-12 place-items-center rounded-2xl bg-hero"><s.icon className="size-6" aria-hidden /></span>
                    <span className="mono text-sm font-bold text-muted-foreground">STEP {i + 1}</span>
                  </div>
                  <h3 className="mt-5 text-xl font-extrabold">{s.title}</h3>
                  <p className="mt-1 text-muted-foreground">{s.text}</p>
                </RevealItem>
              ))}
            </RevealGroup>
          </div>
        </section>

        {/* Pricing */}
        <section id="pricing" className="scroll-mt-20 py-20" aria-labelledby="pricing-title">
          <div className="mx-auto max-w-[1200px] px-4 sm:px-6">
            <p className="text-center text-sm font-bold uppercase tracking-wider text-brand-600 dark:text-brand-300">Transparent &amp; predictable</p>
            <h2 id="pricing-title" className="mx-auto mt-3 max-w-3xl text-center text-4xl font-extrabold sm:text-5xl">Simple, flat pricing that pays for itself</h2>
            <p className="mt-3 text-center text-muted-foreground">No commission, ever. Cancel anytime.</p>
            <div className="mx-auto mt-12 grid max-w-3xl gap-6 md:grid-cols-2">
              <div className="rounded-3xl border border-border bg-card p-8 shadow-soft">
                <h3 className="text-2xl font-extrabold">Free</h3>
                <p className="mono mt-3 text-5xl font-bold">{formatMoney(0, pro.currency)}<span className="font-sans text-base font-medium text-muted-foreground"> /month</span></p>
                <ul className="mt-6 space-y-3">
                  {["Up to 3 students", "Booking page & payments", "Video lessons & whiteboard", "Materials & homework"].map((t) => (
                    <li key={t} className="flex gap-2"><CheckCircle2 className="mt-0.5 size-5 shrink-0 text-success" aria-hidden />{t}</li>
                  ))}
                </ul>
                <Button asChild variant="outline" className="mt-8 w-full"><Link href={startFree.href}>{startFree.label}</Link></Button>
              </div>
              <div className="relative rounded-3xl border-2 border-brand-500 bg-card p-8 shadow-lift">
                <span className="absolute left-1/2 top-0 flex -translate-x-1/2 -translate-y-1/2 items-center gap-1 rounded-full bg-hero px-4 py-1 text-xs font-bold"><Sparkles className="size-3" aria-hidden /> MOST POPULAR</span>
                <h3 className="text-2xl font-extrabold">Pro</h3>
                <p className="mono mt-3 text-5xl font-bold">{formatMoney(pro.cents, pro.currency)}<span className="font-sans text-base font-medium text-muted-foreground"> /month</span></p>
                <ul className="mt-6 space-y-3">
                  {["Unlimited students", "Everything in Free", "Lesson notes shared with students", "Lesson recordings", "Priority support"].map((t) => (
                    <li key={t} className="flex gap-2"><CheckCircle2 className="mt-0.5 size-5 shrink-0 text-brand-600 dark:text-brand-300" aria-hidden />{t}</li>
                  ))}
                </ul>
                <Button asChild className="mt-8 w-full"><Link href={goPro.href}>{goPro.label}</Link></Button>
              </div>
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section id="faq" className="mx-auto max-w-3xl scroll-mt-20 px-4 pb-20 sm:px-6" aria-labelledby="faq-title">
          <h2 id="faq-title" className="text-center text-4xl font-extrabold sm:text-5xl">Questions, answered</h2>
          <div className="mt-10 space-y-3">
            {faqs.map(([q, a]) => (
              <details key={q} className="group rounded-2xl border border-border bg-card p-5 open:shadow-soft">
                <summary className="cursor-pointer list-none font-bold marker:hidden">
                  <span className="flex items-center justify-between gap-3">{q}<span aria-hidden className="text-2xl leading-none text-brand-600 transition group-open:rotate-45 dark:text-brand-300">+</span></span>
                </summary>
                <p className="mt-3 text-muted-foreground">{a}</p>
              </details>
            ))}
          </div>
        </section>

        {/* CTA */}
        <section className="mx-auto max-w-[1200px] px-4 pb-20 sm:px-6">
          <div className="relative overflow-hidden rounded-3xl bg-hero p-10 text-center shadow-lift sm:p-16">
            <span aria-hidden className="absolute -left-10 -top-10 size-44 rounded-full bg-white/10" />
            <span aria-hidden className="absolute -bottom-16 -right-10 size-64 rounded-full bg-saffron/30" />
            <div className="relative">
              <h2 className="mx-auto max-w-2xl text-4xl font-extrabold sm:text-5xl">Ready to teach on your own terms?</h2>
              <p className="mx-auto mt-3 max-w-xl text-brand-100">Set up your page in under 15 minutes and share it with your first student today.</p>
              <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
                {dashboard ? (
                  <Button asChild size="lg" className="bg-white text-brand-700 hover:bg-brand-50"><Link href={dashboard}>Open my dashboard</Link></Button>
                ) : (
                  <>
                    <Button asChild size="lg" className="bg-white text-brand-700 hover:bg-brand-50"><Link href="/signup?role=tutor">Create my tutor page</Link></Button>
                    <Button asChild size="lg" variant="ghost" className="text-white hover:bg-white/15"><Link href="/signup?role=student">I&apos;m a student</Link></Button>
                  </>
                )}
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-border py-8 text-center text-sm text-muted-foreground">
        <p>© {new Date().getFullYear()} TutorHub{!dashboard && <> · <Link href="/login" className="underline">Log in</Link></>}</p>
      </footer>
    </div>
  );
}
