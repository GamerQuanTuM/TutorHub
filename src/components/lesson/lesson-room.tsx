"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { ArrowLeft, ExternalLink, FileText, GraduationCap, MessageSquare, NotebookPen, PanelRightClose, PanelRightOpen, PenTool, Timer } from "lucide-react";
import { AutoSaveField } from "@/components/shared/autosave-field";
import { Skeleton } from "@/components/ui/skeleton";
import { saveLessonNoteAction } from "@/lib/actions/lessons";
import { ChatPanel } from "./chat-panel";
import type { ChatMessage } from "@/lib/chat";
import { cn } from "@/lib/utils";

// tldraw and Jitsi are heavy and browser-only: load them on demand
const Whiteboard = dynamic(() => import("./whiteboard"), { ssr: false, loading: () => <Skeleton className="size-full" /> });
import type { VideoSettings } from "./jitsi-frame";
const JitsiFrame = dynamic(() => import("./jitsi-frame"), { ssr: false, loading: () => <Skeleton className="size-full" /> });

export interface RoomMaterial {
  id: string;
  title: string;
  href: string;
  external: boolean;
}

type Tab = "whiteboard" | "notes" | "chat" | "materials";

export interface RoomChat {
  /** False until migration 0006 is applied: the room then keeps Jitsi's own (unsaved) chat button instead. */
  available: boolean;
  messages: ChatMessage[];
  viewerId: string;
  names: Record<string, string>;
}

/** Remaining-time card driven by the booking's start and end. */
function LessonTimer({ startsAt, endsAt }: { startsAt: string; endsAt: string }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const first = setTimeout(tick, 0);
    const t = setInterval(tick, 1000);
    return () => { clearTimeout(first); clearInterval(t); };
  }, []);
  const start = new Date(startsAt).getTime();
  const end = new Date(endsAt).getTime();
  const total = Math.max(1, end - start);
  const fmt = (ms: number) => {
    const s = Math.max(0, Math.floor(ms / 1000));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    return `${h > 0 ? `${h}:${String(m).padStart(2, "0")}` : String(m)}:${String(sec).padStart(2, "0")}`;
  };
  const before = now !== null && now < start;
  const remaining = now === null ? total : before ? total : end - now;
  const pct = now === null || before ? 0 : Math.min(100, Math.max(0, ((now - start) / total) * 100));
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
      <div className="flex items-center justify-between gap-2 text-sm font-semibold">
        <span className="flex items-center gap-2"><Timer className="size-4 text-brand-300" aria-hidden /> Lesson timer</span>
        <span className="mono text-xs text-brand-200">{Math.round(total / 60000)} min total</span>
      </div>
      <p className="mono mt-2 text-3xl font-bold" aria-live="off">
        {now === null ? "--:--" : fmt(remaining)} <span className="font-sans text-sm font-medium text-brand-200">{before ? "until start" : "remaining"}</span>
      </p>
      <div role="progressbar" aria-label="Lesson progress" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100} className="mt-3 h-2 overflow-hidden rounded-full bg-white/10">
        <div className="h-full rounded-full bg-gradient-to-r from-brand-500 to-violet transition-[width] duration-1000" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

/**
 * Lesson room. Desktop: whiteboard canvas on the left, a collapsible "session room" sidebar on the right
 * (video, timer, notes and materials). Tablet and mobile: video on top, then Whiteboard / Notes / Materials tabs.
 */
export function LessonRoom({
  roomName, video, displayName, role, bookingId, notes, sharedNote, materials, recordingEnabled, backHref, bookingTitle, startsAt, endsAt, chat,
}: {
  roomName: string; video: VideoSettings; displayName: string; role: "tutor" | "student"; bookingId: string;
  notes: string; sharedNote: string | null; materials: RoomMaterial[]; recordingEnabled: boolean; backHref: string; bookingTitle: string;
  startsAt: string; endsAt: string; chat: RoomChat;
}) {
  const [tab, setTab] = useState<Tab>("whiteboard");
  const [sidebar, setSidebar] = useState(true); // desktop only
  // On large screens the whiteboard is always visible, so the sidebar shows notes unless materials is chosen
  const sideTab: Exclude<Tab, "whiteboard"> = tab === "materials" ? "materials" : tab === "chat" && chat.available ? "chat" : "notes";

  const tabs: { id: Tab; label: string; icon: typeof PenTool; mobileOnly?: boolean }[] = [
    { id: "whiteboard", label: "Whiteboard", icon: PenTool, mobileOnly: true },
    { id: "notes", label: "Notes", icon: NotebookPen },
    ...(chat.available ? [{ id: "chat" as const, label: "Chat", icon: MessageSquare }] : []),
    { id: "materials", label: "Materials", icon: FileText },
  ];

  return (
    <div className="flex h-[100dvh] flex-col bg-background">
      <header className="flex items-center gap-3 border-b border-border bg-card px-3 py-2.5 sm:px-5">
        <Link href={backHref} className="hidden items-center gap-2 font-heading text-lg font-extrabold sm:flex" aria-label="TutorHub home">
          <span className="grid size-9 place-items-center rounded-xl bg-hero"><GraduationCap className="size-5" aria-hidden /></span>
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="truncate font-heading text-base font-extrabold sm:text-lg">{bookingTitle}</h1>
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><span className="size-2 rounded-full bg-success pulse-pink" aria-hidden /> Live classroom</p>
        </div>
        <button
          type="button"
          onClick={() => setSidebar((s) => !s)}
          aria-pressed={sidebar}
          aria-label={sidebar ? "Collapse session panel" : "Expand session panel"}
          className="hidden size-10 place-items-center rounded-full border border-border bg-card hover:bg-muted lg:grid"
        >
          {sidebar ? <PanelRightClose className="size-5" aria-hidden /> : <PanelRightOpen className="size-5" aria-hidden />}
        </button>
        <Link href={backHref} className="flex items-center gap-1.5 rounded-full border border-danger/30 bg-danger-soft px-4 py-2 text-sm font-bold text-danger hover:bg-danger hover:text-white">
          <ArrowLeft className="size-4" aria-hidden /> Leave lesson
        </Link>
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-2 p-2 lg:flex-row lg:gap-3 lg:p-3">
        {/* Whiteboard canvas (left on desktop, a tab elsewhere). Stays mounted so it keeps syncing */}
        <section
          aria-label="Whiteboard"
          className={cn(
            "order-2 min-h-0 min-w-0 flex-1 overflow-hidden rounded-2xl border border-border bg-card shadow-soft lg:order-1 lg:block",
            tab === "whiteboard" ? "block" : "hidden",
          )}
        >
          <Whiteboard room={roomName} />
        </section>

        {/* Session room: video, timer, notes / materials */}
        <aside
          aria-label="Session room"
          className={cn(
            "order-1 flex min-h-0 flex-col gap-3 lg:order-2 lg:w-[380px] lg:shrink-0 lg:overflow-y-auto lg:rounded-2xl lg:bg-ink lg:p-3 lg:text-white",
            tab === "whiteboard" ? "flex-none" : "flex-1",
            sidebar ? "" : "lg:hidden",
          )}
        >
          <section aria-label="Video" className="h-[38vh] min-h-[240px] overflow-hidden rounded-2xl bg-ink lg:h-[230px] lg:min-h-0 lg:shrink-0">
            <JitsiFrame video={video} displayName={displayName} recordingEnabled={recordingEnabled} chatButton={!chat.available} />
          </section>

          <div className="hidden lg:block"><LessonTimer startsAt={startsAt} endsAt={endsAt} /></div>

          <section aria-label="Lesson tools" className={cn("min-h-0 flex-col overflow-hidden rounded-2xl border border-border bg-card text-card-foreground lg:flex lg:min-h-[200px] lg:flex-1", tab === "whiteboard" ? "hidden" : "flex flex-1")}>
            <div role="tablist" aria-label="Lesson tools" className="flex border-b border-border">
              {tabs.filter((t) => !t.mobileOnly).map((t) => (
                <button key={t.id} role="tab" id={`tab-${t.id}`} aria-selected={sideTab === t.id} aria-controls={`panel-${t.id}`} onClick={() => setTab(t.id)}
                  className={cn("flex flex-1 items-center justify-center gap-2 px-3 py-3 text-sm font-semibold transition-colors", sideTab === t.id ? "border-b-2 border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-900/40 dark:text-brand-200" : "text-muted-foreground hover:bg-muted")}>
                  <t.icon className="size-4" aria-hidden /> {t.label}
                </button>
              ))}
            </div>

            <div role="tabpanel" id="panel-notes" aria-labelledby="tab-notes" hidden={sideTab !== "notes"} className="min-h-0 flex-1 overflow-y-auto p-4">
              {role === "tutor" ? (
                <AutoSaveField label="Lesson notes" initial={notes} rows={12} placeholder="What did you cover? What should they practise next?" save={saveLessonNoteAction.bind(null, bookingId)} />
              ) : (
                <>
                  <h2 className="mb-2 font-extrabold">Notes from your tutor</h2>
                  {sharedNote ? <p className="whitespace-pre-line rounded-xl bg-muted p-4">{sharedNote}</p> : <p className="text-muted-foreground">Your tutor hasn&apos;t shared notes for this lesson yet. They appear here and in your lesson history.</p>}
                  <ScratchPad bookingId={bookingId} />
                </>
              )}
            </div>

            {chat.available && (
              <div role="tabpanel" id="panel-chat" aria-labelledby="tab-chat" hidden={sideTab !== "chat"} className="min-h-0 flex-1 overflow-hidden">
                <ChatPanel bookingId={bookingId} viewerId={chat.viewerId} initial={chat.messages} names={chat.names} />
              </div>
            )}

            <div role="tabpanel" id="panel-materials" aria-labelledby="tab-materials" hidden={sideTab !== "materials"} className="min-h-0 flex-1 overflow-y-auto p-4">
              {materials.length === 0 ? (
                <p className="text-muted-foreground">No materials yet. {role === "tutor" ? "Upload some from the Materials page." : "Your tutor hasn't shared anything yet."}</p>
              ) : (
                <ul className="space-y-2">
                  {materials.map((m) => (
                    <li key={m.id}>
                      <a href={m.href} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 rounded-xl border border-border p-3 hover:bg-muted">
                        <FileText className="size-5 shrink-0 text-brand-600 dark:text-brand-300" aria-hidden />
                        <span className="flex-1 truncate font-medium">{m.title}</span>
                        <ExternalLink className="size-4 text-muted-foreground" aria-hidden /><span className="sr-only">(opens in a new tab)</span>
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>
        </aside>
      </div>

      {/* Tablet and mobile: tab bar under the content */}
      <nav aria-label="Lesson tools" className={cn("grid border-t border-border bg-card pb-[env(safe-area-inset-bottom)] lg:hidden", tabs.length === 4 ? "grid-cols-4" : "grid-cols-3")}>
        {tabs.map((t) => (
          <button key={t.id} type="button" aria-pressed={tab === t.id} onClick={() => setTab(t.id)}
            className={cn("flex flex-col items-center gap-0.5 py-2.5 text-xs font-semibold", tab === t.id ? "text-brand-700 dark:text-brand-200" : "text-muted-foreground")}>
            <t.icon className="size-5" aria-hidden /> {t.label}
          </button>
        ))}
      </nav>
    </div>
  );
}

/** Student's own scratchpad. Stays in this browser only (nothing is sent to the server). */
function ScratchPad({ bookingId }: { bookingId: string }) {
  const key = `scratch-${bookingId}`;
  const [value, setValue] = useState("");
  useEffect(() => {
    const t = setTimeout(() => { try { setValue(localStorage.getItem(key) ?? ""); } catch {} }, 0);
    return () => clearTimeout(t);
  }, [key]);
  return (
    <div className="mt-6">
      <label htmlFor="scratch" className="mb-1 block text-sm font-semibold">My scratchpad <span className="font-normal text-muted-foreground">(only saved in this browser)</span></label>
      <textarea id="scratch" rows={8} value={value} onChange={(e) => { setValue(e.target.value); try { localStorage.setItem(key, e.target.value); } catch {} }}
        className="w-full rounded-xl border border-border bg-card p-3" placeholder="Jot down new words…" />
    </div>
  );
}
