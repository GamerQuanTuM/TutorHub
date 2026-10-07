"use server";

import { requireSession } from "@/lib/auth/session";
import { getAdminRepo } from "@/lib/data";
import { rateLimit } from "@/lib/rate-limit";
import { canChat, isParty, loadMessages, MAX_MESSAGE_LENGTH, type ChatMessage } from "@/lib/chat";

export type ChatResult = { ok: true; messages: ChatMessage[] } | { ok: false; error: string };

/** Looks up the booking and checks the signed-in user belongs to it. Same answer for "missing" and "not yours". */
async function authorise(bookingId: string, userId: string) {
  const repo = getAdminRepo();
  const booking = await repo.one("bookings", { id: bookingId });
  if (!booking || !isParty(booking, userId)) return { repo, booking: null };
  return { repo, booking };
}

/** The whole conversation of a lesson, oldest first (the room polls this every few seconds). */
export async function listMessagesAction(bookingId: string): Promise<ChatResult> {
  const session = await requireSession();
  const { repo, booking } = await authorise(bookingId, session.id);
  if (!booking) return { ok: false, error: "Lesson not found." };
  const chat = await loadMessages(repo, bookingId);
  if (!chat.available) return { ok: false, error: "Chat isn't available yet." };
  return { ok: true, messages: chat.messages };
}

/** Adds one message and returns the updated conversation. */
export async function sendMessageAction(bookingId: string, text: string): Promise<ChatResult> {
  const session = await requireSession();
  const body = text.trim();
  if (!body) return { ok: false, error: "Write a message first." };
  if (body.length > MAX_MESSAGE_LENGTH) return { ok: false, error: `Keep messages under ${MAX_MESSAGE_LENGTH} characters.` };

  const limit = rateLimit(`chat:${session.id}`, 30, 60_000);
  if (!limit.ok) return { ok: false, error: "You're sending messages very fast. Wait a moment." };

  const { repo, booking } = await authorise(bookingId, session.id);
  if (!booking) return { ok: false, error: "Lesson not found." };
  if (!canChat(booking)) return { ok: false, error: "Chat isn't open for this lesson." };

  try {
    await repo.insert("messages", { bookingId, senderId: session.id, body });
  } catch (e) {
    console.error("[chat] could not save message (is migration 0006 applied?):", e);
    return { ok: false, error: "Chat isn't available yet." };
  }
  const chat = await loadMessages(repo, bookingId);
  return chat.available ? { ok: true, messages: chat.messages } : { ok: false, error: "Chat isn't available yet." };
}
