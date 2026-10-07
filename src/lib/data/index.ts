import { supabaseAdmin, supabaseServer } from "@/lib/supabase/server";
import { createSupabaseRepo } from "./supabase/repo";
import type { Repo } from "./repo";

/**
 * Repo for the signed-in user (Row Level Security applies).
 * Use for reads and simple writes to the user's own rows.
 */
export async function getRepo(): Promise<Repo> {
  return createSupabaseRepo(await supabaseServer());
}

/**
 * Service-role repo (bypasses RLS). Only call after the server code has checked
 * who is allowed to do the thing: webhooks, cron, public pages, atomic operations, money.
 */
export function getAdminRepo(): Repo {
  return createSupabaseRepo(supabaseAdmin());
}

export type { Repo } from "./repo";
