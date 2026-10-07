import type { Booking, TableName, Tables } from "@/lib/types";

/**
 * The data-access contract. Pages and actions only talk to this interface, so
 * the unit tests plug in an in-memory implementation.
 *
 * It is deliberately small: generic table CRUD plus the few operations that must
 * be atomic (booking conflicts, credit balance, webhook idempotency, files).
 */
export type Insert<T> = Omit<T, "id" | "createdAt"> & { id?: string; createdAt?: string };
export type Where<K extends TableName> = Partial<Tables[K]>;

export type BookingResult = { ok: true; booking: Booking } | { ok: false; reason: "conflict" | "not_found" };
export type CreditResult = { ok: true; balance: number } | { ok: false; reason: "insufficient" };

export interface StoredFile {
  data: Uint8Array;
  mime: string;
  name: string;
}

export interface Repo {
  select<K extends TableName>(table: K, where?: Where<K>): Promise<Tables[K][]>;
  one<K extends TableName>(table: K, where: Where<K>): Promise<Tables[K] | null>;
  insert<K extends TableName>(table: K, row: Insert<Tables[K]>): Promise<Tables[K]>;
  update<K extends TableName>(table: K, where: Where<K>, patch: Where<K>): Promise<Tables[K][]>;
  remove<K extends TableName>(table: K, where: Where<K>): Promise<void>;

  /**
   * Insert a booking unless it overlaps another active booking for the same tutor.
   * Guarded by a database EXCLUDE constraint, so two simultaneous requests
   * cannot both succeed.
   */
  insertBooking(row: Insert<Booking>, nowIso: string): Promise<BookingResult>;
  /** Reschedule: same conflict rule, ignoring the booking itself. */
  moveBooking(id: string, startsAt: string, endsAt: string, nowIso: string): Promise<BookingResult>;

  /** Atomically change a student's credit balance for a tutor and write a ledger row. */
  adjustCredit(args: {
    tutorId: string;
    studentId: string;
    delta: number;
    reason: string;
    bookingId?: string | null;
  }): Promise<CreditResult>;

  /** Webhook idempotency: true the first time an event id is seen, false afterwards. */
  claimStripeEvent(id: string, type: string): Promise<boolean>;

  putFile(path: string, data: Uint8Array, mime: string, name: string): Promise<void>;
  getFile(path: string): Promise<StoredFile | null>;
  /** Short-lived signed download URL (Supabase Storage). If unavailable the app streams the file itself. */
  signedFileUrl(path: string, ttlSec: number): Promise<string | null>;
}
