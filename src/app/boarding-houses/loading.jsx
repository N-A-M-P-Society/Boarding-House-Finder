const SKELETON_CARDS = Array.from({ length: 6 }, (_, index) => index);

export default function LoadingBoardingHouses() {
  return (
    <main className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8" aria-busy="true" aria-label="Loading boarding houses">
      <div className="mb-8 space-y-3">
        <div className="h-8 w-64 animate-pulse rounded bg-[var(--muted)]" />
        <div className="h-4 w-96 max-w-full animate-pulse rounded bg-[var(--muted)]" />
      </div>
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {SKELETON_CARDS.map((card) => (
          <article key={card} className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)]">
            <div className="h-48 animate-pulse bg-[var(--muted)]" />
            <div className="space-y-4 p-5">
              <div className="h-6 w-2/3 animate-pulse rounded bg-[var(--muted)]" />
              <div className="h-4 w-5/6 animate-pulse rounded bg-[var(--muted)]" />
              <div className="h-5 w-1/3 animate-pulse rounded bg-[var(--muted)]" />
              <div className="flex gap-2">
                <div className="h-6 w-16 animate-pulse rounded-full bg-[var(--muted)]" />
                <div className="h-6 w-20 animate-pulse rounded-full bg-[var(--muted)]" />
                <div className="h-6 w-14 animate-pulse rounded-full bg-[var(--muted)]" />
              </div>
            </div>
          </article>
        ))}
      </div>
      <span className="sr-only" role="status">Loading boarding houses…</span>
    </main>
  );
}
