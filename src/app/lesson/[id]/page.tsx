import Link from "next/link";
import { notFound } from "next/navigation";
import { Clock, Hourglass } from "lucide-react";
import { AuthCard } from "@/components/layout/auth-card";
import { Button } from "@/components/ui/button";
import { LessonCountdown } from "@/components/shared/countdown";
import { AutoRefresh } from "@/components/shared/auto-refresh";
import { LessonRoom, type RoomMaterial } from "@/components/lesson/lesson-room";
import { requireSession, homeFor } from "@/lib/auth/session";
import { getAdminRepo } from "@/lib/data";
import { getTutorPlan } from "@/lib/data/queries";
import { getVideoConfig } from "@/lib/video-provider";
import { canChat, loadMessages } from "@/lib/chat";
import { joinState, opensAt } from "@/lib/lesson-access";
import { planHas } from "@/lib/plans";
import { formatDateTime, nowMs } from "@/lib/time";

export const metadata = { title: "Lesson room · TutorHub" };
export const dynamic = "force-dynamic";

/**
 * Lesson room. ALL access control happens here on the server:
 *  1. you must be signed in,
 *  2. you must be this booking's tutor or student (anyone else gets a 404, not a hint that it exists),
 *  3. the join window must be open (10 minutes before start until shortly after the end).
 * The Jitsi room name is only put in the page HTML when all three pass.
 */
export default async function LessonPage({ params }: PageProps<"/lesson/[id]">) {
  const { id } = await params;
  const session = await requireSession();
  const repo = getAdminRepo();
  const booking = await repo.one("bookings", { id });
  if (!booking || (booking.tutorId !== session.id && booking.studentId !== session.id)) notFound();

  const role = session.id === booking.tutorId ? "tutor" : "student";
  const back = `${homeFor(role)}`;
  const state = joinState(booking, nowMs());

  if (state === "unavailable" || state === "ended") {
    return (
      <AuthCard title={state === "ended" ? "This lesson has ended" : "This lesson isn't available"} subtitle={state === "ended" ? "We hope it went well! Notes and materials are on your dashboard." : "It may have been cancelled or is still awaiting payment."}>
        <Button asChild className="w-full"><Link href={back}>Back to dashboard</Link></Button>
      </AuthCard>
    );
  }

  if (state === "too_early") {
    const other = await repo.one("profiles", { id: role === "tutor" ? booking.studentId : booking.tutorId });
    return (
      <AuthCard title="Your lesson room isn't open yet" subtitle={`The room opens 10 minutes before the start: ${formatDateTime(opensAt(booking.startsAt), session.profile.timezone)}.`}>
        <AutoRefresh everyMs={15000} max={240} />
        <div className="space-y-4 text-center">
          <Hourglass className="mx-auto size-10 text-brand-600 dark:text-brand-300" aria-hidden />
          <p>Lesson with <strong>{other?.fullName}</strong> at {formatDateTime(booking.startsAt, session.profile.timezone)}</p>
          <LessonCountdown startsAt={booking.startsAt} />
          <p className="flex items-center justify-center gap-2 text-sm text-muted-foreground"><Clock className="size-4" aria-hidden /> This page will let you in automatically.</p>
          <Button asChild variant="outline" className="w-full"><Link href={back}>Back to dashboard</Link></Button>
        </div>
      </AuthCard>
    );
  }

  // Window is open: gather what the side panel needs
  const [{ plan }, note, other] = await Promise.all([
    getTutorPlan(repo, booking.tutorId),
    repo.one("lesson_notes", { bookingId: booking.id }),
    repo.one("profiles", { id: role === "tutor" ? booking.studentId : booking.tutorId }),
  ]);

  // Saved chat (available once migration 0006 is applied; otherwise the room keeps Jitsi's own chat button)
  const chat = canChat(booking) ? await loadMessages(repo, booking.id) : { available: false, messages: [] };
  const names: Record<string, string> = {
    [session.id]: session.profile.fullName.split(" ")[0] ?? "You",
    ...(other ? { [other.id]: other.fullName.split(" ")[0] ?? "Them" } : {}),
  };

  const allMaterials = await repo.select("materials", { tutorId: booking.tutorId });
  const assignments = await repo.select("material_assignments", { tutorId: booking.tutorId });
  const visible = role === "tutor" ? allMaterials : allMaterials.filter((m) => assignments.some((a) => a.materialId === m.id && (a.studentId === null || a.studentId === booking.studentId)));
  const materials: RoomMaterial[] = visible.map((m) => ({ id: m.id, title: m.title, external: m.kind === "link", href: m.kind === "link" ? m.url! : `/api/files/${m.storagePath}` }));

  const recording = planHas(plan, "recordings") && role === "tutor";
  const video = getVideoConfig({
    roomName: booking.roomName,
    user: { id: session.id, name: session.profile.fullName, email: session.profile.email, avatarUrl: session.profile.avatarUrl },
    moderator: role === "tutor",
    recording,
  });

  return (
    <LessonRoom
      roomName={booking.roomName}
      video={video}
      displayName={session.profile.fullName}
      role={role}
      bookingId={booking.id}
      notes={note?.body ?? ""}
      sharedNote={note?.visibleToStudent ? note.body : null}
      materials={materials}
      recordingEnabled={recording}
      backHref={back}
      bookingTitle={`Lesson with ${other?.fullName ?? ""}`}
      startsAt={booking.startsAt}
      endsAt={booking.endsAt}
      chat={{ available: chat.available, messages: chat.messages, viewerId: session.id, names }}
    />
  );
}
