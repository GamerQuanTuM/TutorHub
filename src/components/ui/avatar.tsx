"use client";

import * as AvatarPrimitive from "@radix-ui/react-avatar";
import { cn } from "@/lib/utils";

const sizes = { sm: "size-8 text-xs", md: "size-11 text-sm", lg: "size-16 text-lg", xl: "size-28 text-3xl" };

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
}

export function Avatar({
  name,
  src,
  size = "md",
  className,
}: {
  name: string;
  src?: string | null;
  size?: keyof typeof sizes;
  className?: string;
}) {
  return (
    <AvatarPrimitive.Root
      className={cn(
        "inline-flex shrink-0 select-none overflow-hidden rounded-full ring-1 ring-border",
        sizes[size],
        className,
      )}
    >
      {src && <AvatarPrimitive.Image src={src} alt={name} className="size-full object-cover" />}
      <AvatarPrimitive.Fallback
        aria-label={name}
        className="grid size-full place-items-center bg-brand-100 font-semibold text-brand-900 dark:bg-brand-600/50 dark:text-brand-100"
      >
        {initials(name)}
      </AvatarPrimitive.Fallback>
    </AvatarPrimitive.Root>
  );
}
