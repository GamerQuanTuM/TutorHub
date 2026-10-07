import { Sparkles } from "lucide-react";

/** Friendly empty state: always give the user one clear next action via `action`. */
export function EmptyState({
  icon: Icon = Sparkles,
  title,
  description,
  action,
}: {
  icon?: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center rounded-xl border border-dashed border-border bg-card px-6 py-12 text-center">
      <div className="mb-4 grid size-14 place-items-center rounded-full bg-saffron-soft text-saffron-deep">
        <Icon className="size-8" />
      </div>
      <h3 className="font-heading text-xl font-extrabold">{title}</h3>
      <p className="mt-1 max-w-sm text-muted-foreground">{description}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
