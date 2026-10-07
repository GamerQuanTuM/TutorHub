"use client";

import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { motion, type HTMLMotionProps } from "framer-motion";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full font-semibold transition-colors disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        // Solid forest-green pill: the primary action
        primary: "bg-primary text-primary-foreground shadow-soft hover:bg-brand-700 hover:shadow-glow dark:hover:bg-brand-400",
        secondary: "border-2 border-violet/40 bg-card text-violet hover:bg-violet/10 dark:border-saffron/60 dark:text-saffron dark:hover:bg-saffron/10",
        outline: "border border-border bg-card text-foreground hover:bg-muted",
        ghost: "text-foreground hover:bg-muted",
        danger: "border border-danger/30 bg-danger-soft text-danger hover:bg-danger hover:text-white",
      },
      size: {
        sm: "h-9 px-3 text-sm",
        md: "h-11 px-5 text-base",
        lg: "h-14 px-8 text-lg",
        icon: "size-11",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export interface ButtonProps extends HTMLMotionProps<"button">, VariantProps<typeof buttonVariants> {
  /** Render as the child element (e.g. a Next <Link>) instead of a <button>. */
  asChild?: boolean;
  loading?: boolean;
}

/** Subtle scale on hover/press comes from Framer Motion (disabled automatically for reduced-motion users). */
export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild, loading, children, disabled, ...props }, ref) => {
    const classes = cn(buttonVariants({ variant, size }), className);
    if (asChild) {
      return <Slot className={classes}>{children as React.ReactElement}</Slot>;
    }
    return (
      <motion.button
        ref={ref}
        className={classes}
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.97 }}
        transition={{ duration: 0.15 }}
        disabled={disabled || loading}
        aria-busy={loading || undefined}
        {...props}
      >
        {loading && <Loader2 className="size-4 animate-spin" aria-hidden />}
        {children as React.ReactNode}
      </motion.button>
    );
  },
);
Button.displayName = "Button";
