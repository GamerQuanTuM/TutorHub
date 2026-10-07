import Link from "next/link";
import { Video } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export interface LessonCardData {
  id: string;
  name: string; // the other person
  avatarUrl: string | null;
  when: string; // already formatted in the viewer's time zone
  duration: number;
  status: "confirmed" | "completed" | "cancelled" | "pending_payment" | "no_show";
  isTrial: boolean;
  paidWith: string;
  detailsHref: string;
  canJoin: boolean;
}

const statusBadge = {
  confirmed: ["success", "Confirmed"],
  completed: ["neutral", "Completed"],
  cancelled: ["danger", "Cancelled"],
  pending_payment: ["warning", "Awaiting payment"],
  no_show: ["warning", "No-show"],
} as const;

const paidLabel = (paidWith: string) =>
  paidWith === "credit" ? "Package credit" : paidWith === "trial" ? "Free trial" : "Paid by card";

/** One lesson as a list row. Put several inside a `divide-y` container. */
export function LessonCard({ lesson }: { lesson: LessonCardData }) {
  const [variant, label] = statusBadge[lesson.status];
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-3 py-4 first:pt-0 last:pb-0 sm:flex-nowrap">
      <Avatar name={lesson.name} src={lesson.avatarUrl} size="md" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <p className="truncate font-heading font-extrabold">{lesson.name}</p>
          {lesson.isTrial && <Badge variant="accent">Trial</Badge>}
          <Badge variant={variant}>{label}</Badge>
        </div>
        <p className="mono mt-0.5 text-sm text-muted-foreground">{lesson.when}</p>
        <p className="text-sm text-muted-foreground">{lesson.duration} min · {paidLabel(lesson.paidWith)}</p>
      </div>
      <div className="flex w-full shrink-0 gap-2 sm:w-auto">
        <Button asChild size="sm" variant="outline" className="flex-1 sm:flex-none"><Link href={lesson.detailsHref}>Details</Link></Button>
        {lesson.canJoin && (
          <Button asChild size="sm" className="flex-1 sm:flex-none"><Link href={`/lesson/${lesson.id}`}><Video className="size-4" aria-hidden /> Join</Link></Button>
        )}
      </div>
    </div>
  );
}
