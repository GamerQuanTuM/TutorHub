import { MaterialsManager, type MaterialItem } from "@/components/materials/materials-manager";
import { PageHeader } from "@/components/layout/page-header";
import { requireSession } from "@/lib/auth/session";
import { getRepo } from "@/lib/data";
import { formatDate } from "@/lib/time";

export const metadata = { title: "Materials · TutorHub" };

const mb = (bytes: number) => (bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`);

export default async function MaterialsPage({ searchParams }: PageProps<"/tutor/materials">) {
  const session = await requireSession("tutor");
  const sp = await searchParams;
  const repo = await getRepo();
  const [materials, assigns, links] = await Promise.all([
    repo.select("materials", { tutorId: session.id }),
    repo.select("material_assignments", { tutorId: session.id }),
    repo.select("tutor_students", { tutorId: session.id }),
  ]);
  const active = links.filter((l) => l.studentId && l.status === "active");
  const students = await Promise.all(active.map(async (l) => ({ id: l.studentId!, name: (await repo.one("profiles", { id: l.studentId! }))?.fullName ?? "Student" })));

  const items: MaterialItem[] = materials
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map((m) => {
      const mine = assigns.filter((a) => a.materialId === m.id);
      return {
        id: m.id, title: m.title, kind: m.kind, mime: m.mime, sizeLabel: m.sizeBytes ? mb(m.sizeBytes) : "", addedLabel: formatDate(m.createdAt, session.profile.timezone),
        href: m.kind === "link" ? m.url! : `/api/files/${m.storagePath}`,
        sharedWith: mine.some((a) => a.studentId === null) ? "all" : mine.map((a) => a.studentId!).filter(Boolean),
      };
    });

  return (
    <>
      <PageHeader title="Materials" subtitle="Your library of PDFs, images, audio and links." />
      <MaterialsManager materials={items} students={students} openUpload={sp.upload === "1"} />
    </>
  );
}
