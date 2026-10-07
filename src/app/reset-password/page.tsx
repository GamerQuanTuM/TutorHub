import { LockKeyhole } from "lucide-react";
import { CenteredCard } from "@/components/layout/centered-card";
import { ResetPasswordForm } from "@/components/forms/auth-forms";

export const metadata = { title: "Choose a new password · TutorHub" };

/** The emailed reset link signs the user in (via /auth/callback) and lands here. */
export default function ResetPasswordPage() {
  return (
    <CenteredCard icon={<LockKeyhole className="size-8" aria-hidden />} title="Choose a new password" subtitle="Pick something at least 8 characters long.">
      <ResetPasswordForm />
    </CenteredCard>
  );
}
