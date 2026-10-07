"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * When an emailed link (reset password, confirm email) is invalid, expired or already used, Supabase sends the person
 * back with the error in the URL fragment (#error=access_denied&error_code=otp_expired). The server never sees a
 * fragment, so this picks it up in the browser and sends them to "forgot password" with an explanation.
 */
export function AuthLinkError() {
  const router = useRouter();
  useEffect(() => {
    const hash = window.location.hash;
    if (!hash.includes("error_code=")) return;
    const p = new URLSearchParams(hash.slice(1));
    const code = p.get("error_code");
    if (!code) return;
    // Drop the fragment so a refresh does not repeat this
    window.history.replaceState(null, "", window.location.pathname + window.location.search);
    router.replace(`/forgot-password?link=${code === "otp_expired" ? "expired" : "invalid"}`);
  }, [router]);
  return null;
}
