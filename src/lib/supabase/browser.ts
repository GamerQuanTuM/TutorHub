"use client";

import { createBrowserClient } from "@supabase/ssr";

/** Browser client (anon key only). Used for Realtime whiteboard sync and OAuth. */
export function supabaseBrowser() {
  return createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
}
