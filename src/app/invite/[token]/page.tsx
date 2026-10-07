import Link from "next/link";
import { LinkIcon, MailOpen, PartyPopper } from "lucide-react";
import { AuthCard } from "@/components/layout/auth-card";
import { CenteredCard } from "@/components/layout/centered-card";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { getSession } from "@/lib/auth/session";
import { getAdminRepo } from "@/lib/data";
import { formatMoney } from "@/lib/time";
import { acceptInviteAction } from "@/lib/actions/students";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { headers } from "next/headers";

export const metadata = { title: "You're invited · TutorHub" };

export default async function InvitePage({ params }: PageProps<"/invite/[token]">) {
  const { token } = await params;
  // Public page: throttle token guessing
  if (!rateLimit(`invite:${clientIp(await headers())}`, 30, 60_000).ok) {
    return <AuthCard title="Too many attempts" subtitle="Please wait a minute and try again." />;
  }

  const repo = getAdminRepo();
  const link = await repo.one("tutor_students", { inviteToken: token, status: "invited" });
  const tutor = link ? await repo.one("profiles", { id: link.tutorId }) : null;
  const tutorProfile = link ? await repo.one("tutor_profiles", { userId: link!.tutorId }) : null;

  if (!link || !tutor) {
    return (
      <AuthCard title="This invitation isn't valid" subtitle="It may have been used already, or the tutor cancelled it. Ask your tutor for a new link.">
        <Button asChild variant="outline" className="w-full"><Link href="/">Go to TutorHub</Link></Button>
      </AuthCard>
    );
  }

  const session = await getSession();
  const next = encodeURIComponent(`/invite/${token}`);
  return (
    <CenteredCard icon={<MailOpen className="size-8" aria-hidden />} title={`${tutor.fullName} invited you`} subtitle="Join their TutorHub classroom to book lessons, get materials and homework.">
      <div className="space-y-3 rounded-2xl bg-brand-50 p-5 text-center dark:bg-brand-900/30">
        <Avatar name={tutor.fullName} src={tutor.avatarUrl} size="xl" className="mx-auto ring-4 ring-saffron" />
        <p className="font-heading text-lg font-extrabold">{tutor.fullName}</p>
        {tutorProfile && (
          <>
            <div className="flex flex-wrap justify-center gap-1.5">
              {tutorProfile.subjects.map((sub) => <span key={sub} className="rounded-full bg-violet/10 px-3 py-1 text-xs font-bold text-violet dark:bg-violet/30 dark:text-brand-200">{sub}</span>)}
            </div>
            <p className="mono text-sm font-semibold">{formatMoney(tutorProfile.hourlyPriceCents, tutorProfile.currency)} / hour</p>
          </>
        )}
      </div>
      {link.invitedCredits > 0 && (
        <p className="flex items-center gap-2 rounded-xl bg-success-soft px-4 py-3 font-semibold text-success"><PartyPopper className="size-5" aria-hidden /> You&apos;ll start with {link.invitedCredits} lesson credits</p>
      )}
      {!session ? (
        <div className="space-y-3">
          <Button asChild className="w-full"><Link href={`/signup?role=student&next=${next}`}>Create student account</Link></Button>
          <Button asChild variant="outline" className="w-full"><Link href={`/login?next=${next}`}>Log in to accept</Link></Button>
        </div>
      ) : session.profile.role !== "student" ? (
        <p role="alert" className="rounded-xl bg-warning-soft p-4 text-warning">You&apos;re logged in as a tutor. Log out and open this link with a student account.</p>
      ) : (
        <form action={acceptInviteAction}>
          <input type="hidden" name="token" value={token} />
          <Button type="submit" size="lg" className="w-full"><LinkIcon className="size-5" aria-hidden /> Accept invitation</Button>
        </form>
      )}
    </CenteredCard>
  );
}
