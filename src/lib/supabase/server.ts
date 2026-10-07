import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

/** Supabase client bound to the signed-in user's session cookie. Row Level Security applies. */
export async function supabaseServer() {
  const store = await cookies();
  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try {
          list.forEach(({ name, value, options }) => store.set(name, value, options));
        } catch {
          // Called from a Server Component: cookie writes are handled by proxy.ts instead
        }
      },
    },
  });
}

/**
 * Service-role client: BYPASSES Row Level Security. Server-only.
 * Use it only after you have checked authorisation yourself (webhooks, cron,
 * public tutor pages, atomic booking/credit operations).
 */
export function supabaseAdmin() {
  if (typeof window !== "undefined") throw new Error("supabaseAdmin must never run in the browser");
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
