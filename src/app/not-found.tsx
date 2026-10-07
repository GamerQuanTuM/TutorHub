import Link from "next/link";
import { CircleHelp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SystemPage } from "@/components/layout/system-page";

export default function NotFound() {
  return (
    <SystemPage
      icon={<CircleHelp className="size-14" aria-hidden />}
      code="404"
      title="We couldn't find that page"
      description="The lesson or tutor page you're looking for may have moved, or the link is old."
      actions={<><Button asChild><Link href="/">Back to home</Link></Button><Button asChild variant="outline"><Link href="/login">Log in</Link></Button></>}
    />
  );
}
