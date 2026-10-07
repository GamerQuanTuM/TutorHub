import { ExternalLink, FileAudio, FileImage, FileText, FolderOpen, Link2 } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/shared/empty-state";
import { FilterBoard, type BoardGroup, type BoardItem } from "@/components/shared/filter-board";
import { PageHeader } from "@/components/layout/page-header";
import { requireSession } from "@/lib/auth/session";
import { getAdminRepo, getRepo } from "@/lib/data";
import type { Material } from "@/lib/types";
import { formatDate, nowMs } from "@/lib/time";

export const metadata = { title: "Materials · TutorHub" };

type Kind = "file" | "audio" | "image" | "link";
const kindOf = (m: Material): Kind => (m.kind === "link" ? "link" : m.mime?.startsWith("audio/") ? "audio" : m.mime?.startsWith("image/") ? "image" : "file");

/** Colour-coded icon bubbles per type, as in the design. */
const kinds: Record<Kind, { icon: typeof FileText; label: string; bubble: string }> = {
  file: { icon: FileText, label: "File", bubble: "bg-brand-100 text-brand-700 dark:bg-brand-900 dark:text-brand-200" },
  audio: { icon: FileAudio, label: "Audio", bubble: "bg-saffron-soft text-saffron-deep" },
  image: { icon: FileImage, label: "Image", bubble: "bg-success-soft text-success" },
  link: { icon: Link2, label: "Link", bubble: "bg-violet/10 text-violet dark:bg-violet/30 dark:text-brand-200" },
};

const size = (bytes: number | null) => (bytes == null ? "" : bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);
const host = (url: string | null) => { try { return url ? new URL(url).hostname.replace(/^www\./, "") : ""; } catch { return ""; } };

/**
 * A student sees a material only if it was assigned to them (or to "all students") by a
 * tutor they are linked to. RLS enforces the same rule in the database, and downloads go
 * through /api/files which re-checks access (signed URL in Supabase mode).
 */
export default async function StudentMaterialsPage() {
  const session = await requireSession("student");
  const repo = await getRepo();
  const admin = getAdminRepo();
  const links = (await repo.select("tutor_students", { studentId: session.id })).filter((l) => l.status === "active");
  const weekAgo = new Date(nowMs() - 7 * 864e5).toISOString();

  const tutors = await Promise.all(
    links.map(async (l) => {
      const tutor = await admin.one("profiles", { id: l.tutorId });
      const [materials, assigns] = await Promise.all([admin.select("materials", { tutorId: l.tutorId }), admin.select("material_assignments", { tutorId: l.tutorId })]);
      const mine = materials
        .filter((m) => assigns.some((a) => a.materialId === m.id && (a.studentId === null || a.studentId === session.id)))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      return { tutor, mine };
    }),
  );
  const withItems = tutors.filter((g) => g.mine.length);
  const total = withItems.reduce((n, g) => n + g.mine.length, 0);

  const card = (m: Material, tutorName: string): BoardItem => {
    const kind = kindOf(m);
    const { icon: Icon, label, bubble } = kinds[kind];
    const href = m.kind === "link" ? m.url! : `/api/files/${m.storagePath}`;
    const meta = [`Added ${formatDate(m.createdAt, session.profile.timezone)}`, kind === "link" ? host(m.url) : size(m.sizeBytes)].filter(Boolean).join(" · ");
    return {
      id: m.id,
      tags: [kind],
      search: `${m.title} ${tutorName} ${label}`,
      node: (
        <Card className="lift flex h-full flex-col gap-4 p-5">
          <div className="flex items-start justify-between gap-3">
            <span className={`grid size-12 shrink-0 place-items-center rounded-2xl ${bubble}`}><Icon className="size-6" aria-hidden /></span>
            {m.createdAt > weekAgo && <span className="rounded-full bg-primary px-3 py-1 text-xs font-extrabold text-primary-foreground">New</span>}
          </div>
          <div className="min-w-0">
            <p className="break-words font-heading text-lg font-extrabold leading-snug">{m.title}</p>
            <p className="mono mt-1 text-xs text-muted-foreground">{meta}</p>
          </div>
          {kind === "audio" && <audio controls preload="none" src={href} className="w-full" aria-label={m.title} />}
          {kind === "image" && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={href} alt={m.title} className="max-h-48 w-full rounded-xl object-cover" loading="lazy" />
          )}
          <div className="mt-auto flex items-center justify-between gap-3 border-t border-border pt-4">
            <span className="text-xs font-semibold text-muted-foreground">{label}</span>
            <Button asChild size="sm" variant="outline"><a href={href} target="_blank" rel="noopener noreferrer">Open in a new tab <ExternalLink className="size-4" aria-hidden /><span className="sr-only"> {m.title}</span></a></Button>
          </div>
        </Card>
      ),
    };
  };

  const boardGroups: BoardGroup[] = withItems.map(({ tutor, mine }) => ({
    key: tutor?.id ?? "tutor",
    layout: "grid2",
    items: mine.map((m) => card(m, tutor?.fullName ?? "")),
    header: (
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-card p-4 shadow-soft">
        <Avatar name={tutor?.fullName ?? "Tutor"} src={tutor?.avatarUrl} size="md" />
        <h2 className="min-w-0 flex-1 text-xl font-extrabold">From {tutor?.fullName}</h2>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1 text-xs font-bold text-muted-foreground"><FolderOpen className="size-3.5" aria-hidden /> {mine.length} {mine.length === 1 ? "resource" : "resources"} shared</span>
      </div>
    ),
  }));
  const all = boardGroups.flatMap((g) => g.items);
  const count = (tag: string) => all.filter((i) => i.tags.includes(tag)).length;

  return (
    <>
      <PageHeader title="Materials" subtitle="Everything your tutors have shared with you." />
      {total === 0 ? (
        <EmptyState icon={FileText} title="Nothing shared yet" description="When your tutor shares a PDF, audio file or link, it will show up here." />
      ) : (
        <FilterBoard
          filters={[
            { id: "all", label: "All", count: all.length },
            { id: "file", label: "Files", count: count("file") },
            { id: "audio", label: "Audio", count: count("audio") },
            { id: "image", label: "Images", count: count("image") },
            { id: "link", label: "Links", count: count("link") },
          ]}
          groups={boardGroups}
          searchPlaceholder="Search materials"
        />
      )}
    </>
  );
}
