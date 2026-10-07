import Link from "next/link";
import { ArrowLeft, MailCheck } from "lucide-react";
import { CenteredCard } from "@/components/layout/centered-card";
import { ForgotForm } from "@/components/forms/auth-forms";

export const metadata = { title: "Reset password · TutorHub" };

export default async function ForgotPasswordPage({ searchParams }: PageProps<"/forgot-password">) {
  const sp = await searchParams;
  const linkProblem = sp.link === "expired" ? "That reset link has expired or was already used." : sp.link === "invalid" ? "That link isn't valid." : null;
  return (
    <CenteredCard
      icon={<MailCheck className="size-8" aria-hidden />}
      title="Forgot your password?"
      subtitle="Enter your email and we'll send you a reset link."
      footer={<Link href="/login" className="inline-flex items-center gap-1.5 text-link hover:underline"><ArrowLeft className="size-4" aria-hidden /> Back to log in</Link>}
    >
      {linkProblem && (
        <p role="alert" className="rounded-xl bg-warning-soft px-4 py-3 text-sm font-medium text-warning">⚠ {linkProblem} Request a new one below. Each link works only once, and opening it in an email preview can use it up.</p>
      )}
      <ForgotForm />
    </CenteredCard>
  );
}
