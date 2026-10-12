import Link from "next/link";
import { notFound } from "next/navigation";
import { Clock, GraduationCap, Gift, Languages, PlayCircle, Sparkles, Star } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { SlotPicker } from "@/components/booking/slot-picker";
import { TrialCta } from "@/components/booking/trial-cta";
import { ThemeToggle } from "@/components/theme";
import { getSession } from "@/lib/auth/session";
import { getAdminRepo } from "@/lib/data";
import { getTutorBySlug } from "@/lib/data/queries";
import { buyPackageAction } from "@/lib/actions/booking";
import { tutorCanTakeCards } from "@/lib/payments/checkout";
import { formatDate, formatMoney } from "@/lib/time";
import { embedUrl } from "@/lib/video";
import { getTutorPlan, studentHoldsSeat, studentSeats } from "@/lib/data/queries";
import { canAddStudent } from "@/lib/plans";
import { StarRating } from "@/components/shared/star-rating";
import { loadReviews, reviewerLabel, summarizeReviews } from "@/lib/reviews";
import type { Metadata } from "next";

export async function generateMetadata({ params }: PageProps<"/t/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const found = await getTutorBySlug(getAdminRepo(), slug);
  return found ? { title: `${found.profile.fullName} · Book a lesson`, description: found.tutor.headline } : { title: "Tutor not found" };
}

const errors: Record<string, string> = {
  role: "Log in with a student account to buy a package.",
  package: "That package isn't available.",
  payments: "This tutor hasn't set up card payments yet.",
  full: "This tutor isn't accepting new students right now.",
};

export default async function TutorPublicPage({ params, searchParams }: PageProps<"/t/[slug]">) {
  const { slug } = await params;
  const sp = await searchParams;
  const repo = getAdminRepo();
  const found = await getTutorBySlug(repo, slug);
  if (!found) notFound();
  const { tutor, profile } = found;
  const session = await getSession();
  const packages = (await repo.select("lesson_packages", { tutorId: tutor.userId })).filter((p) => p.active);
  const reviews = (await loadReviews(repo, { tutorId: tutor.userId })).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const rating = summarizeReviews(reviews);
  const reviewerNames = new Map<string, string>();
  for (const r of reviews.slice(0, 6)) reviewerNames.set(r.studentId, reviewerLabel((await repo.one("profiles", { id: r.studentId }))?.fullName ?? ""));
  const video = embedUrl(tutor.introVideoUrl);
  const perLesson = formatMoney(tutor.hourlyPriceCents, tutor.currency);
  // A full Free-plan tutor still offers the free trial, but nothing paid, unless this student already has a seat
  const { plan } = await getTutorPlan(repo, tutor.userId);
  const tutorFull = !canAddStudent(plan, (await studentSeats(repo, tutor.userId)).used);
  const paidUnavailable = tutorFull && !(session?.profile.role === "student" && (await studentHoldsSeat(repo, tutor.userId, session.id)));
  const error = typeof sp.error === "string" ? errors[sp.error] : undefined;

  return (
    <div className="min-h-screen">
      <header className="mx-auto flex h-16 max-w-[1200px] items-center justify-between px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2 font-heading text-xl font-extrabold"><span className="grid size-9 place-items-center rounded-xl bg-hero"><GraduationCap className="size-5" aria-hidden /></span>TutorHub</Link>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          {session ? (
            <Button asChild size="sm" variant="outline"><Link href={session.profile.role === "tutor" ? "/tutor/dashboard" : "/student/dashboard"}>My account</Link></Button>
          ) : (
            <><Button asChild size="sm" variant="ghost"><Link href={`/login?next=/t/${slug}`}>Log in</Link></Button><Button asChild size="sm"><Link href={`/signup?role=student&next=/t/${slug}`}>Sign up</Link></Button></>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-[1200px] space-y-8 px-4 pb-16 sm:px-6">
        {error && <p role="alert" className="rounded-xl bg-danger-soft px-4 py-3 font-medium text-danger">⚠ {error}</p>}

        {/* Hero */}
        <section className="overflow-hidden rounded-3xl border border-border bg-card shadow-soft">
          <div aria-hidden className="relative h-32 bg-hero sm:h-44">
            <span className="absolute -right-10 -top-10 size-48 rounded-full bg-white/10" />
            <span className="absolute bottom-4 right-24 size-16 rounded-full bg-saffron/60" />
          </div>
          <div className="px-5 pb-6 sm:px-8 sm:pb-8">
            <div className="-mt-14 flex flex-wrap items-end justify-between gap-3 sm:-mt-16">
              <Avatar name={profile.fullName} src={profile.avatarUrl} size="xl" className="relative z-10 size-28 text-4xl ring-4 ring-card sm:size-32" />
              <p className="mono mb-1 rounded-full border border-border bg-card px-4 py-2 text-sm font-semibold shadow-soft">
                <span className="text-muted-foreground">Rate </span><span className="text-lg font-bold text-brand-600 dark:text-brand-300">{perLesson}</span> / hr
              </p>
            </div>
            <h1 className="mt-4 text-3xl font-extrabold sm:text-4xl">{profile.fullName}</h1>
            {rating.average !== null && (
              <p className="mt-1 flex items-center gap-2 text-sm"><StarRating value={rating.average} /><span className="mono font-bold">{rating.average.toFixed(1)}</span><span className="text-muted-foreground">({rating.count} review{rating.count === 1 ? "" : "s"})</span></p>
            )}
            <p className="mt-1 text-lg text-muted-foreground">{tutor.headline}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              {tutor.subjects.map((s) => <span key={s} className="inline-flex items-center gap-1 rounded-full border border-brand-200 bg-brand-50 px-3 py-1 text-sm font-semibold text-brand-700 dark:border-brand-700 dark:bg-brand-900/50 dark:text-brand-200"><Languages className="size-3.5" aria-hidden />{s}</span>)}
            </div>
            <div className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-3 border-t border-border pt-5 text-sm">
              <p className="flex items-center gap-2 text-muted-foreground"><Clock className="size-4" aria-hidden /> Lessons of {tutor.durations.join(", ")} min</p>
              {tutor.trialEnabled && <TrialCta slug={slug} minutes={tutor.trialDurationMin} />}
            </div>
          </div>
        </section>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)] lg:items-start lg:gap-8">
          <div className="min-w-0 space-y-6">
            <Card>
              <h2 className="mb-2 text-xl font-extrabold">About {profile.fullName.split(" ")[0]}</h2>
              <p className="whitespace-pre-line text-muted-foreground">{tutor.bio}</p>
            </Card>

            {tutor.introVideoUrl && (
              <Card className="space-y-3">
                <h2 className="flex items-center gap-2 text-xl font-extrabold"><PlayCircle className="size-5 text-brand-600 dark:text-brand-300" aria-hidden /> Intro video</h2>
                {video ? (
                  <div className="aspect-video overflow-hidden rounded-xl">
                    <iframe src={video} title={`Intro video by ${profile.fullName}`} className="size-full" allow="encrypted-media; picture-in-picture" allowFullScreen loading="lazy" referrerPolicy="strict-origin-when-cross-origin" />
                  </div>
                ) : (
                  <Button asChild variant="outline"><a href={tutor.introVideoUrl} target="_blank" rel="noopener noreferrer">Watch intro video</a></Button>
                )}
              </Card>
            )}

            {packages.length > 0 && tutorCanTakeCards(tutor) && (
              <Card>
                <h2 className="mb-1 flex items-center gap-2 text-xl font-extrabold"><Gift className="size-5 text-brand-600 dark:text-brand-300" aria-hidden /> Lesson packages</h2>
                <p className="mb-4 text-sm text-muted-foreground">Buy a bundle at a discount. Credits are used automatically when you book.</p>
                <ul className="space-y-3">
                  {packages.map((p) => {
                    const normal = Math.round((tutor.hourlyPriceCents * (tutor.durations.includes(60) ? 60 : tutor.durations[0])) / 60) * p.lessonCount;
                    const save = normal > p.priceCents ? Math.round((1 - p.priceCents / normal) * 100) : 0;
                    return (
                      <li key={p.id} className="flex items-center justify-between gap-3 rounded-xl border border-border p-4">
                        <div>
                          <p className="font-semibold">{p.name} {save > 0 && <Badge variant="success" className="ml-1">Save {save}%</Badge>}</p>
                          <p className="text-sm text-muted-foreground">{formatMoney(Math.round(p.priceCents / p.lessonCount), p.currency)} per lesson</p>
                        </div>
                        <form action={buyPackageAction}>
                          <input type="hidden" name="slug" value={slug} /><input type="hidden" name="packageId" value={p.id} />
                          <Button type="submit" size="sm" variant="outline">{formatMoney(p.priceCents, p.currency)}</Button>
                        </form>
                      </li>
                    );
                  })}
                </ul>
              </Card>
            )}

            {rating.count > 0 && rating.average !== null && (
              <Card>
                <h2 className="mb-4 flex items-center gap-2 text-xl font-extrabold"><Star className="size-5 text-brand-600 dark:text-brand-300" aria-hidden /> Student reviews</h2>
                <div className="mb-5 flex flex-wrap items-center gap-6">
                  <div>
                    <p className="mono text-4xl font-bold">{rating.average.toFixed(1)}</p>
                    <StarRating value={rating.average} size="lg" />
                    <p className="mt-1 text-sm text-muted-foreground">{rating.count} review{rating.count === 1 ? "" : "s"}</p>
                  </div>
                  <ul className="min-w-40 flex-1 space-y-1" aria-label="Rating breakdown">
                    {[5, 4, 3, 2, 1].map((n) => (
                      <li key={n} className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span className="mono w-3">{n}</span>
                        <span className="h-2 flex-1 overflow-hidden rounded-full bg-muted"><span className="block h-full rounded-full bg-saffron" style={{ width: `${(rating.distribution[n - 1]! / rating.count) * 100}%` }} /></span>
                        <span className="mono w-5 text-right">{rating.distribution[n - 1]}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <ul className="divide-y divide-border">
                  {reviews.slice(0, 6).map((r) => (
                    <li key={r.id} className="py-4 first:pt-0 last:pb-0">
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        <StarRating value={r.rating} size="sm" />
                        <span className="text-sm font-semibold">{reviewerNames.get(r.studentId) ?? "Student"}</span>
                        <span className="text-xs text-muted-foreground">{formatDate(r.createdAt, "UTC")}</span>
                      </div>
                      {r.comment && <p className="mt-1 whitespace-pre-line text-muted-foreground">{r.comment}</p>}
                    </li>
                  ))}
                </ul>
              </Card>
            )}
          </div>

          <section id="book" className="min-w-0 scroll-mt-20 lg:sticky lg:top-6" aria-labelledby="book-title">
            <Card className="space-y-4">
              <h2 id="book-title" className="flex items-center gap-2 text-2xl font-extrabold"><Sparkles className="size-6 text-brand-600 dark:text-brand-300" aria-hidden /> Book a lesson</h2>
              <p className="text-sm text-muted-foreground">No account needed to browse. You&apos;ll sign up or log in when you pay.</p>
              {paidUnavailable && (
                <p role="note" className="rounded-xl bg-warning-soft p-3 text-sm font-medium text-warning">
                  {tutor.trialEnabled ? "This tutor isn't taking new paid lessons right now. You can still book a free trial lesson below." : "This tutor isn't accepting new students at the moment."}
                </p>
              )}
              {(!paidUnavailable || tutor.trialEnabled) && (
                <SlotPicker
                  slug={slug} durations={tutor.durations} trial={{ enabled: tutor.trialEnabled, durationMin: tutor.trialDurationMin }}
                  hourlyPriceCents={tutor.hourlyPriceCents} currency={tutor.currency} initialTrial={sp.trial === "1"} paidUnavailable={paidUnavailable}
                  knownZone={session?.profile.timezone && session.profile.timezone !== "UTC" ? session.profile.timezone : undefined}
                />
              )}
            </Card>
          </section>
        </div>
      </main>
    </div>
  );
}
