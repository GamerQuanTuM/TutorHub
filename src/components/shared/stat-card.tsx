import { cn } from "@/lib/utils";
import { AnimatedNumber } from "./animated-number";

const tones = {
  pink: "bg-brand-100 text-brand-700 dark:bg-brand-900 dark:text-brand-200",
  violet: "bg-violet/10 text-violet dark:bg-violet/30 dark:text-brand-200",
  peach: "bg-saffron-soft text-saffron-deep",
  green: "bg-success-soft text-success",
} as const;

/** Dashboard number tile with a pastel icon bubble. `highlight` colours the number pink. */
export function StatCard({
  label,
  value,
  currency,
  icon: Icon,
  hint,
  highlight,
  tone = "pink",
  className,
}: {
  label: string;
  value: number;
  currency?: string;
  icon?: React.ComponentType<{ className?: string }>;
  hint?: string;
  highlight?: boolean;
  tone?: keyof typeof tones;
  className?: string;
}) {
  return (
    <div className={cn("lift rounded-2xl border border-border bg-card p-4 text-card-foreground shadow-soft sm:p-5", className)}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium text-muted-foreground">{label}</p>
        {Icon && (
          <span className={cn("grid size-9 shrink-0 place-items-center rounded-full", tones[tone])}>
            <Icon className="size-4" />
          </span>
        )}
      </div>
      <p className={cn("mono mt-3 text-3xl font-bold sm:text-4xl", highlight && "text-brand-600 dark:text-brand-300")}>
        <AnimatedNumber value={value} currency={currency} />
      </p>
      {hint && <p className="mt-1 text-sm text-muted-foreground">{hint}</p>}
    </div>
  );
}
