"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

type Status = "idle" | "saving" | "saved" | "error";

/**
 * Inline-editing textarea that auto-saves 800ms after you stop typing and shows a small
 * "Saved" indicator (announced to screen readers). `save` is a server action.
 */
export function AutoSaveField({
  label,
  initial,
  save,
  rows = 6,
  placeholder,
  disabled,
  className,
}: {
  label: string;
  initial: string;
  save: (value: string) => Promise<{ ok?: boolean; error?: string }>;
  rows?: number;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}) {
  const [value, setValue] = useState(initial);
  const [status, setStatus] = useState<Status>("idle");
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const dirty = useRef(false);
  const latest = useRef(value);
  const saveRef = useRef(save);
  useEffect(() => { saveRef.current = save; });

  async function flush() {
    if (!dirty.current) return;
    dirty.current = false;
    setStatus("saving");
    try {
      const res = await saveRef.current(latest.current);
      setStatus(res.error ? "error" : "saved");
    } catch {
      setStatus("error");
    }
  }

  function onChange(v: string) {
    setValue(v);
    latest.current = v;
    dirty.current = true;
    setStatus("idle");
    clearTimeout(timer.current);
    timer.current = setTimeout(flush, 800);
  }

  // Save pending edits when leaving the page
  useEffect(() => () => { clearTimeout(timer.current); if (dirty.current) void saveRef.current(latest.current); }, []);

  const id = `autosave-${label.replace(/\W+/g, "-").toLowerCase()}`;
  return (
    <div className={className}>
      <div className="mb-1.5 flex items-center justify-between">
        <label htmlFor={id} className="text-sm font-semibold">{label}</label>
        <span aria-live="polite" className={cn("text-xs font-semibold", status === "error" ? "text-danger" : "text-success")}>
          {status === "saving" && <span className="text-muted-foreground">Saving…</span>}
          {status === "saved" && "✓ Saved"}
          {status === "error" && "⚠ Couldn't save. Retrying on next edit."}
        </span>
      </div>
      <textarea
        id={id}
        value={value}
        rows={rows}
        disabled={disabled}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        onBlur={() => { clearTimeout(timer.current); void flush(); }}
        className="w-full rounded-xl border border-border bg-card p-3 text-base focus-visible:border-brand-400 disabled:opacity-60"
      />
    </div>
  );
}
