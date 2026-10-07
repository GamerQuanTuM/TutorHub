import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthCard } from "@/components/layout/auth-card";
import { SignUpForm } from "@/components/forms/auth-forms";
import { GoogleButton } from "@/components/forms/google-button";
import { getSession, homeFor } from "@/lib/auth/session";

export const metadata = { title: "Sign up · TutorHub" };

export default async function SignupPage({ searchParams }: PageProps<"/signup">) {
  const sp = await searchParams;
  const role = sp.role === "student" ? "student" : "tutor";
  const next = typeof sp.next === "string" ? sp.next : undefined;
  const session = await getSession();
  if (session) redirect(homeFor(session.profile.role));

  return (
    <AuthCard
      title="Create your account"
      subtitle="Free to start. No credit card needed."
      footer={<>Already have an account? <Link href={`/login${next ? `?next=${encodeURIComponent(next)}` : ""}`} className="font-semibold text-link underline">Log in</Link></>}
    >
      <GoogleButton role={role} />
      <div className="my-4 flex items-center gap-3 text-sm text-muted-foreground"><span className="h-px flex-1 bg-border" />or<span className="h-px flex-1 bg-border" /></div>
      <SignUpForm defaultRole={role} next={next} />
    </AuthCard>
  );
}
