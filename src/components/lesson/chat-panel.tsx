"use client";

import { useEffect, useRef, useState } from "react";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { listMessagesAction, sendMessageAction } from "@/lib/actions/chat";
import { MAX_MESSAGE_LENGTH, type ChatMessage } from "@/lib/chat";
import { cn } from "@/lib/utils";

const POLL_MS = 4000;

const clock = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

/**
 * Saved lesson chat between the tutor and the student. New messages arrive by polling every few seconds (paused while
 * the tab is hidden), and everything stays in the database so the conversation is still there after the lesson.
 */
export function ChatPanel({ bookingId, viewerId, initial, names }: { bookingId: string; viewerId: string; initial: ChatMessage[]; names: Record<string, string> }) {
  const [messages, setMessages] = useState<ChatMessage[]>(initial);
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  const lastId = messages[messages.length - 1]?.id;

  // Poll for the other person's messages
  useEffect(() => {
    const tick = async () => {
      if (document.hidden) return;
      const res = await listMessagesAction(bookingId).catch(() => null);
      if (res?.ok) setMessages((cur) => (cur.length === res.messages.length && cur[cur.length - 1]?.id === res.messages[res.messages.length - 1]?.id ? cur : res.messages));
    };
    const t = setInterval(tick, POLL_MS);
    return () => clearInterval(t);
  }, [bookingId]);

  // Keep the newest message in view
  useEffect(() => { end.current?.scrollIntoView({ block: "end" }); }, [lastId]);

  async function send() {
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    setError("");
    const res = await sendMessageAction(bookingId, body).catch(() => ({ ok: false as const, error: "Could not send. Check your connection." }));
    setSending(false);
    if (res.ok) {
      setMessages(res.messages);
      setText("");
    } else {
      setError(res.error);
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div role="log" aria-live="polite" aria-label="Lesson chat" className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
        {messages.length === 0 ? (
          <p className="rounded-xl bg-muted p-3 text-sm text-muted-foreground">No messages yet. Say hello. Everything you write here is saved with this lesson.</p>
        ) : (
          messages.map((m) => {
            const mine = m.senderId === viewerId;
            return (
              <div key={m.id} className={cn("flex flex-col", mine ? "items-end" : "items-start")}>
                <div className={cn("max-w-[85%] whitespace-pre-wrap break-words rounded-2xl px-3 py-2 text-sm", mine ? "rounded-br-md bg-primary text-primary-foreground" : "rounded-bl-md bg-muted")}>{m.body}</div>
                <span className="mono mt-0.5 px-1 text-[10px] text-muted-foreground" suppressHydrationWarning>{mine ? "You" : names[m.senderId] ?? "Them"} · {clock(m.createdAt)}</span>
              </div>
            );
          })
        )}
        <div ref={end} />
      </div>

      <form
        onSubmit={(e) => { e.preventDefault(); void send(); }}
        className="border-t border-border p-2"
      >
        {error && <p role="alert" className="mb-1 px-1 text-xs font-medium text-danger">⚠ {error}</p>}
        <div className="flex items-end gap-2">
          <label htmlFor={`chat-${bookingId}`} className="sr-only">Message</label>
          <textarea
            id={`chat-${bookingId}`}
            rows={1}
            value={text}
            maxLength={MAX_MESSAGE_LENGTH}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(); } }}
            placeholder="Write a message…"
            className="max-h-28 min-h-10 flex-1 resize-none rounded-2xl border border-border bg-card px-3 py-2 text-sm"
          />
          <Button type="submit" size="icon" className="size-10 shrink-0" loading={sending} aria-label="Send message"><Send className="size-4" aria-hidden /></Button>
        </div>
      </form>
    </div>
  );
}
