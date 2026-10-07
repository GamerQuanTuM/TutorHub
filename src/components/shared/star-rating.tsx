import { Star } from "lucide-react";
import { cn } from "@/lib/utils";

/** Read-only stars. `value` may be fractional (rounded to the nearest half for display). The number is always available to screen readers. */
export function StarRating({ value, size = "md", className }: { value: number; size?: "sm" | "md" | "lg"; className?: string }) {
  const px = { sm: "size-3.5", md: "size-4", lg: "size-5" }[size];
  const rounded = Math.round(value * 2) / 2;
  return (
    <span role="img" aria-label={`${value} out of 5 stars`} className={cn("inline-flex items-center gap-0.5", className)}>
      {[1, 2, 3, 4, 5].map((i) => {
        const fill = rounded >= i ? 1 : rounded >= i - 0.5 ? 0.5 : 0;
        return (
          <span key={i} className={cn("relative inline-block", px)} aria-hidden>
            <Star className={cn("absolute inset-0 text-border", px)} />
            {fill > 0 && (
              <span className="absolute inset-0 overflow-hidden" style={{ width: `${fill * 100}%` }}>
                <Star className={cn("fill-saffron text-saffron", px)} />
              </span>
            )}
          </span>
        );
      })}
    </span>
  );
}
