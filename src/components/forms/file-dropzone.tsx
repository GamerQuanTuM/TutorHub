"use client";

import { useRef, useState } from "react";
import { motion } from "framer-motion";
import { CheckCircle2, FileText, UploadCloud, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

export interface UploadedFile {
  path: string;
  name: string;
  size: number;
  mime: string;
  url: string;
}

interface Item {
  id: number;
  name: string;
  progress: number;
  status: "uploading" | "done" | "error";
  error?: string;
  preview?: string;
}

/**
 * Drag-and-drop (or click) uploader with a progress bar and image preview.
 * Uses XMLHttpRequest because fetch() cannot report upload progress.
 */
export function FileDropzone({
  onUploaded,
  kind = "file",
  accept = "application/pdf,image/*,audio/*",
  multiple = true,
  label = "Drag files here or click to browse",
  hint = "PDF, images or audio, up to 15 MB",
}: {
  onUploaded: (file: UploadedFile) => void;
  kind?: "file" | "avatar";
  accept?: string;
  multiple?: boolean;
  label?: string;
  hint?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  const [items, setItems] = useState<Item[]>([]);

  function update(id: number, patch: Partial<Item>) {
    setItems((cur) => cur.map((i) => (i.id === id ? { ...i, ...patch } : i)));
  }

  function upload(file: File) {
    const id = Date.now() + Math.random();
    const preview = file.type.startsWith("image/") ? URL.createObjectURL(file) : undefined;
    setItems((cur) => [...(multiple ? cur : []), { id, name: file.name, progress: 0, status: "uploading", preview }]);

    const body = new FormData();
    body.append("file", file);
    body.append("kind", kind);
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/upload");
    xhr.upload.onprogress = (e) => e.lengthComputable && update(id, { progress: Math.round((e.loaded / e.total) * 100) });
    xhr.onload = () => {
      let data: (UploadedFile & { error?: string }) | null = null;
      try {
        data = JSON.parse(xhr.responseText);
      } catch {}
      if (xhr.status === 200 && data) {
        update(id, { progress: 100, status: "done" });
        onUploaded(data);
      } else {
        update(id, { status: "error", error: data?.error ?? "Upload failed." });
      }
    };
    xhr.onerror = () => update(id, { status: "error", error: "Network error. Please try again." });
    xhr.send(body);
  }

  function handle(files: FileList | null) {
    if (!files) return;
    Array.from(multiple ? files : [files[0]]).forEach(upload);
  }

  return (
    <div>
      <div
        role="button"
        tabIndex={0}
        aria-label={label}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), inputRef.current?.click())}
        onDragOver={(e) => (e.preventDefault(), setDrag(true))}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          handle(e.dataTransfer.files);
        }}
        className={cn(
          "flex cursor-pointer flex-col items-center rounded-xl border-2 border-dashed px-6 py-8 text-center transition",
          drag ? "scale-[1.01] border-brand-500 bg-brand-100 dark:bg-brand-900/50" : "border-brand-300 bg-brand-50 hover:bg-brand-100 dark:border-brand-700 dark:bg-muted",
        )}
      >
        <UploadCloud className="mb-2 size-9 text-brand-600 dark:text-brand-300" aria-hidden />
        <p className="font-semibold">{label}</p>
        <p className="text-sm text-muted-foreground">{hint}</p>
        <input
          ref={inputRef}
          type="file"
          hidden
          accept={accept}
          multiple={multiple}
          onChange={(e) => {
            handle(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      <ul className="mt-3 space-y-2" aria-live="polite">
        {items.map((i) => (
          <li key={i.id} className="flex items-center gap-3 rounded-xl border border-border bg-card p-3">
            {i.preview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={i.preview} alt="" className="size-10 rounded-lg object-cover" />
            ) : (
              <FileText className="size-10 shrink-0 rounded-lg bg-muted p-2 text-brand-600 dark:text-brand-300" aria-hidden />
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{i.name}</p>
              {i.status === "error" ? (
                <p role="alert" className="text-sm text-danger">{i.error}</p>
              ) : (
                <div className="mt-1 h-2 overflow-hidden rounded-full bg-brand-100 dark:bg-brand-900" role="progressbar" aria-valuenow={i.progress} aria-valuemin={0} aria-valuemax={100} aria-label={`Uploading ${i.name}`}>
                  <motion.div className="h-full rounded-full bg-primary" animate={{ width: `${i.progress}%` }} />
                </div>
              )}
            </div>
            {i.status === "done" && <CheckCircle2 className="size-5 text-success" aria-label="Uploaded" />}
            {i.status === "error" && <XCircle className="size-5 text-danger" aria-label="Failed" />}
          </li>
        ))}
      </ul>
    </div>
  );
}
