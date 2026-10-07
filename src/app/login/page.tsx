import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthCard } from "@/components/layout/auth-card";
import { SignInForm } from "@/components/forms/auth-forms";
import { GoogleButton } from "@/components/forms/google-button";
import { getSession, homeFor } from "@/lib/auth/session";
import { demoLoginAction } from "@/lib/actions/auth";
import { demoRoles } from "@/lib/demo";
import { Button } from "@/components/ui/button";

export const metadata = { title: "Log in · TutorHub" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const sp = await searchParams;
  const next = typeof sp.next === "string" ? sp.next : undefined;
  const session = await getSession();
  if (session) redirect(next?.startsWith("/") && !next.startsWith("//") ? next : homeFor(session.profile.role));

  return (
    <AuthCard
      title="Welcome back"
      subtitle="Log in to your TutorHub account."
      footer={<>New here? <Link href={`/signup${next ? `?next=${encodeURIComponent(next)}` : ""}`} className="font-semibold text-link underline">Create an account</Link></>}
    >
      {sp.error && <p role="alert" className="mb-4 rounded-xl bg-danger-soft px-4 py-3 text-sm font-medium text-danger">⚠ {sp.error === "google" ? "Google sign-in failed. Please try again." : sp.error === "demo" ? "Demo login isn't available right now." : "We couldn't sign you in. Please try again."}</p>}
      <GoogleButton role="student" />
      <div className="my-4 flex items-center gap-3 text-sm text-muted-foreground"><span className="h-px flex-1 bg-border" />or<span className="h-px flex-1 bg-border" /></div>
      <SignInForm next={next} />
      {demoRoles().length > 0 && (
        <form action={demoLoginAction} className="mt-6 rounded-2xl border border-dashed border-brand-300 bg-brand-50 p-4 dark:border-brand-700 dark:bg-brand-900/30">
          <p className="mb-3 text-sm font-semibold">Just looking around? Try a demo account.</p>
          <div className="flex flex-wrap gap-2">
            {demoRoles().includes("tutor") && <Button type="submit" name="role" value="tutor" variant="secondary" size="sm">Demo as a tutor</Button>}
            {demoRoles().includes("student") && <Button type="submit" name="role" value="student" variant="secondary" size="sm">Demo as a student</Button>}
          </div>
        </form>
      )}
    </AuthCard>
  );
}
