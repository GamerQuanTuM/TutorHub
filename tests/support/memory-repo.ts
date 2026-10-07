import { randomUUID } from "node:crypto";
import type { Booking, TableName, Tables } from "@/lib/types";
import { isBlocking, overlaps } from "@/lib/scheduling/slots";
import { addCredits, deductCredits, InsufficientCreditsError } from "@/lib/scheduling/credits";
import type { BookingResult, CreditResult, Insert, Repo, StoredFile, Where } from "@/lib/data/repo";
import { getStore } from "./store";

type Row = Record<string, unknown>;

function matches(row: Row, where: Row): boolean {
  return Object.entries(where).every(([k, v]) => {
    if (v === undefined) return true;
    const rv = row[k];
    return Array.isArray(v) ? JSON.stringify(rv) === JSON.stringify(v) : rv === v;
  });
}

const clone = <T>(v: T): T => structuredClone(v);

/**
 * In-memory Repo used by the unit tests (never shipped in the app). Every method is synchronous inside
 * (no awaits between read and write) so concurrent calls cannot interleave:
 * that is what makes the double-booking check race-free here.
 */
export function createMemoryRepo(): Repo {
  const store = () => getStore();
  const rows = <K extends TableName>(t: K) => store().tables[t] as unknown as Row[];

  function conflict(b: { tutorId: string; startsAt: string; endsAt: string }, nowIso: string, ignoreId?: string) {
    const nowMs = new Date(nowIso).getTime();
    const slot = { start: new Date(b.startsAt).getTime(), end: new Date(b.endsAt).getTime() };
    return store().tables.bookings.some(
      (o) =>
        o.tutorId === b.tutorId &&
        o.id !== ignoreId &&
        isBlocking(o, nowMs) &&
        overlaps(slot, { start: new Date(o.startsAt).getTime(), end: new Date(o.endsAt).getTime() }),
    );
  }

  return {
    async select<K extends TableName>(table: K, where: Where<K> = {}) {
      return clone(rows(table).filter((r) => matches(r, where as Row))) as unknown as Tables[K][];
    },
    async one<K extends TableName>(table: K, where: Where<K>) {
      const r = rows(table).find((x) => matches(x, where as Row));
      return r ? (clone(r) as unknown as Tables[K]) : null;
    },
    async insert<K extends TableName>(table: K, row: Insert<Tables[K]>) {
      const full = { id: randomUUID(), createdAt: new Date().toISOString(), ...(row as Row) };
      // Tables keyed by userId/bookingId etc. do not need an id, but an extra field is harmless
      rows(table).push(full);
      return clone(full) as unknown as Tables[K];
    },
    async update<K extends TableName>(table: K, where: Where<K>, patch: Where<K>) {
      const hit = rows(table).filter((r) => matches(r, where as Row));
      for (const r of hit) {
        for (const [k, v] of Object.entries(patch as Row)) if (v !== undefined) r[k] = v;
      }
      return clone(hit) as unknown as Tables[K][];
    },
    async remove<K extends TableName>(table: K, where: Where<K>) {
      const keep = rows(table).filter((r) => !matches(r, where as Row));
      store().tables[table].splice(0, store().tables[table].length, ...(keep as never[]));
    },

    async insertBooking(row: Insert<Booking>, nowIso: string): Promise<BookingResult> {
      if (conflict(row, nowIso)) return { ok: false, reason: "conflict" };
      const booking = { id: randomUUID(), createdAt: new Date().toISOString(), ...row } as Booking;
      store().tables.bookings.push(booking);
      return { ok: true, booking: clone(booking) };
    },
    async moveBooking(id, startsAt, endsAt, nowIso): Promise<BookingResult> {
      const b = store().tables.bookings.find((x) => x.id === id);
      if (!b) return { ok: false, reason: "not_found" };
      if (conflict({ tutorId: b.tutorId, startsAt, endsAt }, nowIso, id)) return { ok: false, reason: "conflict" };
      b.startsAt = startsAt;
      b.endsAt = endsAt;
      b.dayReminderSentAt = null;
      b.hourReminderSentAt = null;
      return { ok: true, booking: clone(b) };
    },

    async adjustCredit({ tutorId, studentId, delta, reason, bookingId = null }): Promise<CreditResult> {
      const t = store().tables;
      let row = t.student_credits.find((c) => c.tutorId === tutorId && c.studentId === studentId);
      if (!row) {
        row = { id: randomUUID(), tutorId, studentId, balance: 0 };
        t.student_credits.push(row);
      }
      try {
        row.balance = delta < 0 ? deductCredits(row.balance, -delta) : addCredits(row.balance, delta);
      } catch (e) {
        if (e instanceof InsufficientCreditsError) return { ok: false, reason: "insufficient" };
        throw e;
      }
      t.credit_ledger.push({
        id: randomUUID(),
        tutorId,
        studentId,
        delta,
        reason,
        bookingId,
        createdAt: new Date().toISOString(),
      });
      return { ok: true, balance: row.balance };
    },

    async claimStripeEvent(id, type) {
      const t = store().tables.stripe_events;
      if (t.some((e) => e.id === id)) return false;
      t.push({ id, type, processedAt: new Date().toISOString() });
      return true;
    },

    async putFile(path, data, mime, name) {
      store().files.set(path, { data, mime, name });
    },
    async getFile(path): Promise<StoredFile | null> {
      return store().files.get(path) ?? null;
    },
    async signedFileUrl() {
      return null;
    },
  };
}
