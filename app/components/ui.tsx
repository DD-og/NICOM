import Link from "next/link";

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Stat({ label, value, hint, href }: { label: string; value: React.ReactNode; hint?: React.ReactNode; href?: string }) {
  const body = (
    <>
      <div className="text-xs font-medium uppercase tracking-wide text-muted">{label}</div>
      <div className="mt-1 text-3xl font-semibold tabular-nums">{value}</div>
      {hint && <div className="mt-1 text-xs text-muted">{hint}</div>}
    </>
  );
  return href ? (
    <Link href={href} className="card block p-4 text-ink no-underline transition hover:border-brand">
      {body}
    </Link>
  ) : (
    <div className="card p-4">{body}</div>
  );
}

/** Single-value meter; the label carries the number so color is never the only signal. */
export function Meter({ value, max, label }: { value: number; max: number; label?: string }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="flex items-center gap-2" title={`${value} of ${max} (${pct}%)`}>
      <div className="h-2 w-full min-w-16 overflow-hidden rounded-full bg-line">
        <div className="h-full rounded-full bg-stage-3" style={{ width: `${pct}%` }} />
      </div>
      <span className="w-20 shrink-0 text-right text-xs tabular-nums text-muted">{label ?? `${value}/${max}`}</span>
    </div>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <div className="rounded-lg border border-dashed border-line p-8 text-center text-sm text-muted">{children}</div>;
}

export function Section({ title, actions, children }: { title: string; actions?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="card">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
        <h2 className="text-sm font-semibold">{title}</h2>
        {actions}
      </div>
      <div>{children}</div>
    </section>
  );
}
