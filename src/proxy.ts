import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { missingEnv } from "@/lib/env";

/**
 * 1. If required environment variables are missing, show the "Setup required" page for every request
 *    (webhook and cron calls get a 503 JSON error instead).
 * 2. Otherwise keep the Supabase auth session fresh (refresh expiring tokens into cookies).
 * Route protection itself lives in the layouts (requireSession), which check the session on the server.
 */
export async function proxy(request: NextRequest) {
  const missing = missingEnv();
  const path = request.nextUrl.pathname;
  if (missing.length > 0) {
    if (path === "/setup-required") return NextResponse.next();
    if (path.startsWith("/api/")) return NextResponse.json({ error: "Server is not configured" }, { status: 503 });
    return NextResponse.rewrite(new URL("/setup-required", request.url));
  }

  let response = NextResponse.next({ request });
  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list) => {
        list.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        list.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });
  await supabase.auth.getUser();
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
