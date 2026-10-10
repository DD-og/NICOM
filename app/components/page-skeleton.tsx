/** Shown instantly while a page waits for the Sheet, so navigation never feels frozen. */
export function PageSkeleton({ cards = 4 }: { cards?: number }) {
  return (
    <div className="animate-pulse" aria-busy="true" aria-label="Loading">
      <div className="mb-2 h-7 w-56 rounded bg-line" />
      <div className="mb-6 h-4 w-80 max-w-full rounded bg-line/70" />
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        {Array.from({ length: cards }, (_, i) => (
          <div key={i} className="card h-24" />
        ))}
      </div>
      <div className="card h-72" />
      <p className="mt-4 text-center text-xs text-muted">Loading from the Google Sheet…</p>
    </div>
  );
}
