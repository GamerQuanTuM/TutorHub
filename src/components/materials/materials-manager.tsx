"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FileAudio, FileImage, FileText, Link2, Plus, Share2, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Modal } from "@/components/ui/modal";
import { FormBanner, TextField } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { EmptyState } from "@/components/shared/empty-state";
import { FileDropzone } from "@/components/forms/file-dropzone";
import { addFileMaterialAction, addLinkMaterialAction, assignMaterialAction, deleteMaterialAction } from "@/lib/actions/materials";
import type { ActionState } from "@/lib/actions/helpers";

export interface MaterialItem {
  id: string;
  title: string;
  kind: "file" | "link";
  mime: string | null;
  sizeLabel: string;
  /** "3 Oct 2026" */
  addedLabel: string;
  href: string;
  /** "all", or the ids of the students it is shared with */
  sharedWith: "all" | string[];
}
export interface StudentOption { id: string; name: string }

type Kind = "file" | "audio" | "image" | "link";
const kindOf = (m: MaterialItem): Kind => (m.kind === "link" ? "link" : m.mime?.startsWith("audio/") ? "audio" : m.mime?.startsWith("image/") ? "image" : "file");

/** Colour-coded icon bubbles per type, matching the student materials page. */
const kinds: Record<Kind, { icon: typeof FileText; label: string; bubble: string }> = {
  file: { icon: FileText, label: "Document", bubble: "bg-brand-100 text-brand-700 dark:bg-brand-900 dark:text-brand-200" },
  audio: { icon: FileAudio, label: "Audio recording", bubble: "bg-saffron-soft text-saffron-deep" },
  image: { icon: FileImage, label: "Image", bubble: "bg-success-soft text-success" },
  link: { icon: Link2, label: "Web link", bubble: "bg-violet/10 text-violet dark:bg-violet/30 dark:text-brand-200" },
};

const initial: ActionState = {};

export function MaterialsManager({ materials, students, openUpload }: { materials: MaterialItem[]; students: StudentOption[]; openUpload: boolean }) {
  const router = useRouter();
  const { toast } = useToast();
  const [shareFor, setShareFor] = useState<MaterialItem | null>(null);
  const [linkOpen, setLinkOpen] = useState(false);
  const [filter, setFilter] = useState<"all" | Kind>("all");
  const [, start] = useTransition();
  const dropRef = useRef<HTMLDivElement>(null);

  // ?upload=1 (from the quick actions) scrolls to the uploader
  useEffect(() => { if (openUpload) dropRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }); }, [openUpload]);

  const nameOf = (id: string) => students.find((s) => s.id === id)?.name ?? "Student";
  const count = (k: "all" | Kind) => (k === "all" ? materials.length : materials.filter((m) => kindOf(m) === k).length);
  const shown = filter === "all" ? materials : materials.filter((m) => kindOf(m) === filter);
  const filters: { id: "all" | Kind; label: string }[] = [{ id: "all", label: "All" }, { id: "file", label: "Files" }, { id: "audio", label: "Audio" }, { id: "image", label: "Images" }, { id: "link", label: "Links" }];

  return (
    <div className="space-y-8">
      <div ref={dropRef} className="grid gap-5 lg:grid-cols-[2fr_1fr]">
        <Card className="space-y-3">
          <h2 className="text-xl font-extrabold">Add material</h2>
          <FileDropzone
            onUploaded={async (f) => {
              const res = await addFileMaterialAction({ path: f.path, name: f.name, mime: f.mime, size: f.size });
              if (res.error) toast({ kind: "error", title: res.error });
              else { toast({ kind: "success", title: "Material added", description: f.name }); router.refresh(); }
            }}
          />
        </Card>
        <Card className="flex flex-col items-center justify-center gap-3 bg-brand-50/60 text-center dark:bg-brand-900/20">
          <span className="grid size-12 place-items-center rounded-2xl bg-violet/10 text-violet dark:bg-violet/30 dark:text-brand-200"><Link2 className="size-6" aria-hidden /></span>
          <h2 className="text-xl font-extrabold">Web resources</h2>
          <p className="text-sm text-muted-foreground">Share a YouTube or Vimeo video, an article or any web page.</p>
          <Button variant="outline" onClick={() => setLinkOpen(true)}><Link2 className="size-4" aria-hidden /> Add video or web link</Button>
        </Card>
      </div>

      <section aria-labelledby="library" className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="library" className="flex items-center gap-2 text-2xl font-extrabold">Library <span className="mono rounded-full bg-muted px-2.5 py-0.5 text-sm font-bold text-muted-foreground">{materials.length}</span></h2>
          {materials.length > 0 && (
            <div role="group" aria-label="Filter by type" className="flex flex-wrap gap-2">
              {filters.map((f) => (
                <button key={f.id} type="button" aria-pressed={filter === f.id} onClick={() => setFilter(f.id)}
                  className={`rounded-full border px-4 py-2 text-sm font-semibold transition-colors ${filter === f.id ? "border-transparent bg-primary text-primary-foreground shadow-soft" : "border-border bg-card hover:bg-muted"}`}>
                  {f.label} <span className="mono opacity-80">({count(f.id)})</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {materials.length === 0 ? (
          <EmptyState icon={FileText} title="Your library is empty" description="Upload a PDF, image or audio file, or add a video link, then share it with your students." />
        ) : shown.length === 0 ? (
          <p className="rounded-xl bg-muted p-4 text-sm text-muted-foreground">Nothing of this type yet.</p>
        ) : (
          <ul className="grid gap-3">
            {shown.map((m) => {
              const { icon: Icon, label, bubble } = kinds[kindOf(m)];
              return (
                <li key={m.id} className="lift flex flex-wrap items-center gap-x-4 gap-y-3 rounded-2xl border border-border bg-card p-4 shadow-soft">
                  <span className={`grid size-12 shrink-0 place-items-center rounded-2xl ${bubble}`}><Icon className="size-6" aria-hidden /></span>
                  <div className="min-w-0 flex-1 basis-56">
                    <a href={m.href} target="_blank" rel="noopener noreferrer" className="block break-words font-heading font-extrabold hover:underline">{m.title}<span className="sr-only"> (opens in a new tab)</span></a>
                    <p className="mono text-xs text-muted-foreground">{[label, `Added ${m.addedLabel}`, m.kind === "link" ? "" : m.sizeLabel].filter(Boolean).join(" · ")}</p>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {m.sharedWith === "all" ? <Badge variant="success">Shared with: all students</Badge>
                      : m.sharedWith.length === 0 ? <Badge variant="neutral">Not shared yet</Badge>
                      : m.sharedWith.map((id) => <Badge key={id} variant="brand">Shared with: {nameOf(id)}</Badge>)}
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <Button size="sm" variant="outline" onClick={() => setShareFor(m)}><Share2 className="size-4" aria-hidden /> Share</Button>
                    <Button asChild size="sm" variant="outline"><a href={m.href} target="_blank" rel="noopener noreferrer">Open<span className="sr-only"> {m.title}</span></a></Button>
                    <Button size="sm" variant="ghost" aria-label={`Delete ${m.title}`} onClick={() => { if (confirm(`Delete "${m.title}"? Students will lose access.`)) start(async () => { await deleteMaterialAction(m.id); toast({ kind: "info", title: "Material deleted" }); router.refresh(); }); }}>
                      <Trash2 className="size-4 text-danger" aria-hidden />
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <LinkModal open={linkOpen} onOpenChange={setLinkOpen} />
      {shareFor && <ShareModal key={shareFor.id} material={shareFor} students={students} onClose={() => setShareFor(null)} />}
    </div>
  );
}

function LinkModal({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const [state, action, pending] = useActionState(addLinkMaterialAction, initial);
  const router = useRouter();
  const shown = useRef(state);
  useEffect(() => {
    if (state !== shown.current && state.ok) { onOpenChange(false); router.refresh(); }
    shown.current = state;
  }, [state, onOpenChange, router]);
  const err = state.fieldErrors ?? {};
  return (
    <Modal open={open} onOpenChange={onOpenChange} title="Add a link" description="YouTube, Vimeo, an article or any web page.">
      <form action={action} className="space-y-4" noValidate>
        <FormBanner error={state.error} />
        <TextField label="Title" name="title" error={err.title} />
        <TextField label="Link" name="url" type="url" placeholder="https://" error={err.url} />
        <div className="flex justify-end"><Button type="submit" loading={pending}><Plus className="size-4" aria-hidden /> Add link</Button></div>
      </form>
    </Modal>
  );
}

function ShareModal({ material, students, onClose }: { material: MaterialItem; students: StudentOption[]; onClose: () => void }) {
  const [all, setAll] = useState(material.sharedWith === "all");
  const [picked, setPicked] = useState<string[]>(material.sharedWith === "all" ? [] : material.sharedWith);
  const [pending, start] = useTransition();
  const { toast } = useToast();
  const router = useRouter();
  return (
    <Modal open onOpenChange={(o) => !o && onClose()} title={`Share "${material.title}"`} description="Students only see materials shared with them. New students are emailed.">
      <fieldset className="space-y-2">
        <legend className="sr-only">Who can see this?</legend>
        <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-border p-3 font-semibold has-[:checked]:border-brand-500 has-[:checked]:bg-brand-50 dark:has-[:checked]:bg-brand-900/40">
          <input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} className="size-4 accent-brand-600" /> All my students
        </label>
        {!all && (students.length === 0
          ? <p className="text-sm text-muted-foreground">You have no active students yet.</p>
          : students.map((s) => (
            <label key={s.id} className="flex cursor-pointer items-center gap-3 rounded-xl border border-border p-3 has-[:checked]:border-brand-500">
              <input type="checkbox" checked={picked.includes(s.id)} onChange={(e) => setPicked(e.target.checked ? [...picked, s.id] : picked.filter((x) => x !== s.id))} className="size-4 accent-brand-600" /> {s.name}
            </label>
          )))}
      </fieldset>
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button loading={pending} onClick={() => start(async () => {
          const res = await assignMaterialAction(material.id, all ? "all" : picked);
          if (res.error) return toast({ kind: "error", title: res.error });
          toast({ kind: "success", title: "Sharing updated" });
          router.refresh();
          onClose();
        })}>Save</Button>
      </div>
    </Modal>
  );
}
