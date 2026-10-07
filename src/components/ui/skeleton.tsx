import { cn } from "@/lib/utils";

/** Paper-toned shimmer placeholder (styles in globals.css). Use instead of spinners. */
export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div aria-hidden className={cn("skeleton rounded-lg", className)} {...props} />;
}
