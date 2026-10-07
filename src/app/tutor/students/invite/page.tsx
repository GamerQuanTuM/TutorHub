import Link from "next/link";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/layout/page-header";
import { InvitePanel } from "@/components/students/invite-panel";
import { requireSession } from "@/lib/auth/session";
import { getRepo } from "@/lib/data";
import { appUrl } from "@/lib/env";

export const metadata = { title: "Invite students · TutorHub" };

export default async function InvitePage() {
  const session = await requireSession("tutor");
  const links = (await (await getRepo()).select("tutor_students", { tutorId: session.id })).filter((l) => l.status === "invited" && l.inviteToken);
  return (
    <>
      <PageHeader title="Invite students" subtitle="Bring your existing students to TutorHub." actions={<Button asChild variant="ghost" size="sm"><Link href="/tutor/students">← Students</Link></Button>} />
      <InvitePanel
        pending={links.map((l) => ({ id: l.id, name: l.invitedName ?? "Invited student", email: l.invitedEmail, credits: l.invitedCredits, link: `${appUrl()}/invite/${l.inviteToken}` }))}
      />
    </>
  );
}
