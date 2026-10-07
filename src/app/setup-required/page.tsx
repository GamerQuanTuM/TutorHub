import { TriangleAlert } from "lucide-react";
import { missingEnv } from "@/lib/env";

export const metadata = { title: "Setup required · TutorHub", robots: { index: false } };
export const dynamic = "force-dynamic";

/** Shown (by src/proxy.ts) while required environment variables are missing. Lists names only, never values. */
export default function SetupRequiredPage() {
  const missing = missingEnv();
  return (
    <main className="mx-auto grid min-h-screen max-w-xl place-items-center px-4 py-10">
      <div className="w-full rounded-[20px] border border-border bg-card p-8 shadow-lift">
        <div className="mb-4 grid size-12 place-items-center rounded-full bg-warning-soft text-warning"><TriangleAlert className="size-6" aria-hidden /></div>
        <h1 className="text-2xl font-extrabold">Setup required</h1>
        {missing.length === 0 ? (
          <p className="mt-2 text-muted-foreground">Everything is configured. Reload the page.</p>
        ) : (
          <>
            <p className="mt-2 text-muted-foreground">TutorHub needs these environment variables before it can run. Add them (see <code>.env.example</code> and the README), then restart or redeploy.</p>
            <ul className="mt-4 space-y-1 rounded-xl bg-muted p-4 font-mono text-sm">
              {missing.map((name) => <li key={name}>{name}</li>)}
            </ul>
          </>
        )}
      </div>
    </main>
  );
}
