"use client";

import Link from "next/link";
import { TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SystemPage } from "@/components/layout/system-page";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <SystemPage
      icon={<TriangleAlert className="size-14" aria-hidden />}
      title="Something went wrong"
      description={`Sorry about that. Try again, and if it keeps happening let us know.${error.digest ? ` Reference: ${error.digest}` : ""}`}
      actions={<><Button onClick={reset}>Try again</Button><Button asChild variant="outline"><Link href="/">Go home</Link></Button></>}
    />
  );
}
