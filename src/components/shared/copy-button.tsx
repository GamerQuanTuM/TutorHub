"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Copies a link (relative paths are expanded with the current origin). */
export function CopyButton({ text, label = "Copy link" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    const value = text.startsWith("/") ? window.location.origin + text : text;
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      window.prompt("Copy this link:", value);
    }
  }
  return (
    <Button type="button" variant="outline" size="sm" onClick={copy}>
      {copied ? <Check className="size-4 text-success" aria-hidden /> : <Copy className="size-4" aria-hidden />}
      <span aria-live="polite">{copied ? "Copied!" : label}</span>
    </Button>
  );
}
