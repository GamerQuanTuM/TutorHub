import { googleSignInAction } from "@/lib/actions/auth";
import { Button } from "@/components/ui/button";

/** "Continue with Google" (Supabase OAuth). The role is remembered for brand-new accounts. */
export function GoogleButton({ role }: { role: "tutor" | "student" }) {
  return (
    <form action={googleSignInAction}>
      <input type="hidden" name="role" value={role} />
      <Button type="submit" variant="outline" className="w-full">
        <svg viewBox="0 0 24 24" className="size-5" aria-hidden>
          <path fill="#EA4335" d="M12 10.2v3.9h5.5c-.2 1.4-1.7 4-5.5 4a6.1 6.1 0 1 1 0-12.2c1.9 0 3.2.8 3.9 1.5l2.7-2.6A9.9 9.9 0 0 0 12 2a10 10 0 1 0 0 20c5.8 0 9.6-4 9.6-9.7 0-.7-.1-1.2-.2-1.7H12z" />
        </svg>
        Continue with Google
      </Button>
    </form>
  );
}
