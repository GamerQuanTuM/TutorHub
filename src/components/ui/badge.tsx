import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva("inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold tracking-wide", {
  variants: {
    variant: {
      brand: "bg-brand-100 text-brand-900 dark:bg-brand-600/40 dark:text-brand-100",
      neutral: "bg-muted text-foreground",
      success: "bg-success-soft text-success",
      warning: "bg-warning-soft text-warning",
      danger: "bg-danger-soft text-danger",
      accent: "bg-saffron-soft text-saffron-deep dark:text-saffron",
    },
  },
  defaultVariants: { variant: "brand" },
});

/** Always pair the colour with text (and optionally an icon) so meaning never relies on colour alone. */
export function Badge({
  className,
  variant,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
