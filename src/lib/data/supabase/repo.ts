import type { SupabaseClient } from "@supabase/supabase-js";
import type { Booking, TableName, Tables } from "@/lib/types";
import type { BookingResult, CreditResult, Insert, Repo, StoredFile, Where } from "../repo";

/**
 * Supabase implementation of Repo. Domain objects are camelCase; columns are
 * snake_case, so rows are converted on the way in and out.
 * NOTE: written against the schema in supabase/migrations; it has not been run
 * against a live project in this repo's CI, so test it with your own project first.
 */
const snake = (k: string) => k.replace(/[A-Z]/g, (m) => "_" + m.toLowerCase());
const camel = (k: string) => k.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase());

function toDb(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) if (v !== undefined) out[snake(k)] = v;
  return out;
}

function fromDb<T>(row: Record<string, unknown>): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    const key = camel(k);
    // Postgres `time` comes back as "09:00:00"; the app uses "09:00"
    out[key] = (key === "startTime" || key === "endTime") && typeof v === "string" ? v.slice(0, 5) : v;
  }
  return out as T;
}

/** Avatars are public; everything else is in the private "materials" bucket. */
const bucketFor = (path: string) => (path.startsWith("avatars/") ? "avatars" : "materials");

const EXCLUSION_VIOLATION = "23P01";
const UNIQUE_VIOLATION = "23505";

export function createSupabaseRepo(db: SupabaseClient): Repo {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function filtered(table: string, where: Record<string, unknown>, query: any) {
    for (const [k, v] of Object.entries(where)) {
      if (v === undefined) continue;
      query = v === null ? query.is(snake(k), null) : query.eq(snake(k), v);
    }
    return query;
  }

  async function bookingWrite(op: () => PromiseLike<{ data: unknown; error: { code?: string; message: string } | null }>): Promise<BookingResult> {
    const { data, error } = await op();
    if (error?.code === EXCLUSION_VIOLATION) return { ok: false, reason: "conflict" };
    if (error) throw new Error(error.message);
    if (!data) return { ok: false, reason: "not_found" };
    return { ok: true, booking: fromDb<Booking>(data as Record<string, unknown>) };
  }

  return {
    async select<K extends TableName>(table: K, where: Where<K> = {}) {
      const { data, error } = await filtered(table, where as Record<string, unknown>, db.from(table).select("*"));
      if (error) throw new Error(`${table}: ${error.message}`);
      return (data as Record<string, unknown>[]).map((r) => fromDb<Tables[K]>(r));
    },
    async one<K extends TableName>(table: K, where: Where<K>) {
      const { data, error } = await filtered(table, where as Record<string, unknown>, db.from(table).select("*")).limit(1).maybeSingle();
      if (error) throw new Error(`${table}: ${error.message}`);
      return data ? fromDb<Tables[K]>(data as Record<string, unknown>) : null;
    },
    async insert<K extends TableName>(table: K, row: Insert<Tables[K]>) {
      const { data, error } = await db.from(table).insert(toDb(row as Record<string, unknown>)).select().single();
      if (error) throw new Error(`${table}: ${error.message}`);
      return fromDb<Tables[K]>(data as Record<string, unknown>);
    },
    async update<K extends TableName>(table: K, where: Where<K>, patch: Where<K>) {
      const { data, error } = await filtered(table, where as Record<string, unknown>, db.from(table).update(toDb(patch as Record<string, unknown>))).select();
      if (error) throw new Error(`${table}: ${error.message}`);
      return (data as Record<string, unknown>[]).map((r) => fromDb<Tables[K]>(r));
    },
    async remove<K extends TableName>(table: K, where: Where<K>) {
      const { error } = await filtered(table, where as Record<string, unknown>, db.from(table).delete());
      if (error) throw new Error(`${table}: ${error.message}`);
    },

    async insertBooking(row: Insert<Booking>, nowIso: string) {
      // Expired payment holds are not part of the exclusion constraint's WHERE clause (it cannot use now()),
      // so release this tutor's stale holds first.
      await db
        .from("bookings")
        .update({ status: "cancelled" })
        .eq("tutor_id", row.tutorId)
        .eq("status", "pending_payment")
        .lt("hold_expires_at", nowIso);
      return bookingWrite(() => db.from("bookings").insert(toDb(row as Record<string, unknown>)).select().single());
    },
    async moveBooking(id, startsAt, endsAt) {
      return bookingWrite(() =>
        db
          .from("bookings")
          .update({ starts_at: startsAt, ends_at: endsAt, day_reminder_sent_at: null, hour_reminder_sent_at: null })
          .eq("id", id)
          .select()
          .maybeSingle(),
      );
    },

    async adjustCredit({ tutorId, studentId, delta, reason, bookingId = null }): Promise<CreditResult> {
      // SQL function adjust_credit locks the row, refuses negative balances and writes the ledger
      const { data, error } = await db.rpc("adjust_credit", {
        p_tutor: tutorId,
        p_student: studentId,
        p_delta: delta,
        p_reason: reason,
        p_booking: bookingId,
      });
      if (error) throw new Error(error.message);
      return data === null ? { ok: false, reason: "insufficient" } : { ok: true, balance: data as number };
    },

    async claimStripeEvent(id, type) {
      const { error } = await db.from("stripe_events").insert({ id, type });
      if (error?.code === UNIQUE_VIOLATION) return false;
      if (error) throw new Error(error.message);
      return true;
    },

    async putFile(path, data, mime) {
      const { error } = await db.storage.from(bucketFor(path)).upload(path, data, { contentType: mime, upsert: false });
      if (error) throw new Error(error.message);
    },
    async getFile(path): Promise<StoredFile | null> {
      const { data, error } = await db.storage.from(bucketFor(path)).download(path);
      if (error || !data) return null;
      return { data: new Uint8Array(await data.arrayBuffer()), mime: data.type, name: path.split("/").pop() ?? "file" };
    },
    async signedFileUrl(path, ttlSec) {
      const { data } = await db.storage.from(bucketFor(path)).createSignedUrl(path, ttlSec);
      return data?.signedUrl ?? null;
    },
  };
}
