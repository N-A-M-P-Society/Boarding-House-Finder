export default function DashboardTabBar({ items, activeTab, onTabChange, label = "Dashboard sections" }) {
  return (
    <nav
      aria-label={label}
      className="sticky top-0 z-30 -mx-4 mb-8 bg-[var(--background)] px-4 sm:-mx-6 sm:px-6"
    >
      <div className="scrollbar-hidden flex min-h-11 gap-1 overflow-x-auto overflow-y-hidden border-b border-[var(--border)]">
        {items.map(({ id, label: itemLabel }) => {
          const active = activeTab === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => onTabChange(id)}
              aria-pressed={active}
              className={`-mb-px whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
                active
                  ? "border-[var(--primary)] text-[var(--primary)]"
                  : "border-transparent text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
              }`}
            >
              {itemLabel}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
