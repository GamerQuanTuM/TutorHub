import type { Repo } from "@/lib/data";
import type { Booking, Message } from "@/lib/types";

export const MAX_MESSAGE_LENGTH = 2000;

/** Chat is for lessons that are (or were) real: not cancelled, not still waiting for payment. */
export function canChat(b: Pick<Booking, "status">): boolean {
  return b.status === "confirmed" || b.status === "completed" || b.status === "no_show";
}

/** Only the booking's own tutor and student may read or write its chat. */
export function isParty(b: Pick<Booking, "tutorId" | "studentId">, userId: string): boolean {
  return b.tutorId === userId || b.studentId === userId;
}

export interface ChatMessage {
  id: string;
  senderId: string;
  body: string;
  createdAt: string;
}

export interface ChatLoad {
  /** False when the messages table does not exist yet (migration 0006 not applied). */
  available: boolean;
  messages: ChatMessage[];
}

const toChat = (m: Message): ChatMessage => ({ id: m.id, senderId: m.senderId, body: m.body, createdAt: m.createdAt });

/** Oldest first. Never throws: a missing table just means "chat not available yet". */
export async function loadMessages(repo: Repo, bookingId: string): Promise<ChatLoad> {
  try {
    const rows = await repo.select("messages", { bookingId });
    return { available: true, messages: rows.sort((a, b) => a.createdAt.localeCompare(b.createdAt)).map(toChat) };
  } catch (e) {
    console.warn("[chat] could not load messages (is migration 0006 applied?):", e instanceof Error ? e.message : e);
    return { available: false, messages: [] };
  }
}
