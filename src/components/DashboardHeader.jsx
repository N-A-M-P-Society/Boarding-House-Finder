export default function DashboardHeader({ avatar, title, description, action }) {
  return (
    <header className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-center gap-4">
        {avatar}
        <div className="min-w-0">
          <h1 className="font-display text-2xl font-semibold">{title}</h1>
          <div className="mt-1 text-sm text-[var(--muted-foreground)]">{description}</div>
        </div>
      </div>
      {action && <div className="sm:flex-shrink-0">{action}</div>}
    </header>
  );
}
