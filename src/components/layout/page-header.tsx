export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: React.ReactNode }) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4 border-b border-border pb-6">
      <div className="min-w-0">
        <h1 className="text-4xl font-extrabold sm:text-[2.75rem]">{title}</h1>
        {subtitle && <p className="mt-2 max-w-2xl text-muted-foreground">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}
