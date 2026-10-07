"use client";

import { Command } from "cmdk";
import { useRouter } from "next/navigation";
import { CalendarDays, FileText, Users } from "lucide-react";

export interface PaletteItem {
  group: "Pages" | "Students" | "Lessons";
  label: string;
  hint?: string;
  href: string;
}

const groupIcon = { Pages: FileText, Students: Users, Lessons: CalendarDays };

/** Cmd/Ctrl+K: jump to a page, student or lesson. */
export function CommandPalette({
  open,
  onOpenChange,
  items,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: PaletteItem[];
}) {
  const router = useRouter();
  const groups = ["Pages", "Students", "Lessons"] as const;

  return (
    <Command.Dialog
      open={open}
      onOpenChange={onOpenChange}
      label="Search pages, students and lessons"
      overlayClassName="fixed inset-0 z-[65] bg-ink/60 backdrop-blur-sm"
      contentClassName="fixed left-1/2 top-[15vh] z-[66] w-[min(36rem,calc(100vw-2rem))] -translate-x-1/2 overflow-hidden rounded-xl border border-border bg-card text-card-foreground shadow-lift"
    >
      <Command.Input
        placeholder="Search students, lessons, pages…"
        className="w-full border-b border-border bg-transparent px-4 py-4 text-base outline-none placeholder:text-muted-foreground"
      />
      <Command.List className="max-h-80 overflow-y-auto p-2">
        <Command.Empty className="px-3 py-6 text-center text-muted-foreground">Nothing found.</Command.Empty>
        {groups.map((g) => {
          const list = items.filter((i) => i.group === g);
          if (!list.length) return null;
          const Icon = groupIcon[g];
          return (
            <Command.Group key={g} heading={g} className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:text-muted-foreground">
              {list.map((i) => (
                <Command.Item
                  key={i.href + i.label}
                  value={`${i.label} ${i.hint ?? ""}`}
                  onSelect={() => {
                    onOpenChange(false);
                    router.push(i.href);
                  }}
                  className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 data-[selected=true]:bg-brand-100 data-[selected=true]:text-brand-900 dark:data-[selected=true]:bg-brand-900 dark:data-[selected=true]:text-brand-100"
                >
                  <Icon className="size-4 shrink-0" aria-hidden />
                  <span className="flex-1 truncate">{i.label}</span>
                  {i.hint && <span className="text-xs text-muted-foreground">{i.hint}</span>}
                </Command.Item>
              ))}
            </Command.Group>
          );
        })}
      </Command.List>
    </Command.Dialog>
  );
}
