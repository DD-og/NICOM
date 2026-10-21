import Link from "next/link";
import { Badge, DecisionBadge, DueBadge } from "@/app/components/badges";
import { Empty, PageHeader, Section } from "@/app/components/ui";
import { requireUser } from "@/lib/auth";
import { store } from "@/lib/db";
import { daysUntil, firstLink, fmtDate, relativeDays } from "@/lib/format";
import { isOverdue, sortByDue } from "@/lib/logic";

export default async function FacultyHome() {
  const user = await requireUser("faculty");
  const db = await store().snapshot();
  const me = db.faculty.find((f) => f.id === user.id);
  const mine = db.assignments.filter((a) => a.facultyId === user.id).sort(sortByDue);
  const rows = mine.map((a) => ({
    a,
    paper: db.papers.find((p) => p.id === a.paperId),
    review: db.reviews.find((r) => r.assignmentId === a.id),
    decision: db.decisions.find((d) => d.paperId === a.paperId),
  }));
  const pending = rows.filter((r) => r.a.status === "Pending");
  const done = rows.filter((r) => r.a.status === "Completed");
  const overdue = mine.filter(isOverdue).length;

  return (
    <>
      <PageHeader
        title={`Welcome, ${user.name}`}
        subtitle={
          <span className="inline-flex flex-wrap items-center gap-1.5">
            Your review tracks: {me?.domains.length ? me.domains.map((d) => <Badge key={d} t="brand">{d}</Badge>) : "none assigned yet"}
          </span>
        }
      />

      {mine.length > 0 && <Progress done={done.length} total={mine.length} overdue={overdue} nextDue={pending[0]?.a.dueDate} />}

      <h2 className="mb-3 text-lg font-semibold">Papers awaiting your review</h2>
      {pending.length === 0 ? (
        <Empty>Nothing pending. Thank you! New papers will appear here when the committee assigns them.</Empty>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {pending.map(({ a, paper }) =>
            paper ? (
              <article key={a.id} className="card flex flex-col p-5">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <span className="font-mono text-xs text-muted">{paper.id}</span>
                  <Badge t="brand">{paper.domain}</Badge>
                  <span className="ml-auto"><DueBadge dueDate={a.dueDate} status={a.status} /></span>
                </div>
                <h3 className="text-base font-semibold leading-snug">{paper.title}</h3>
                {paper.abstract && <p className="mt-2 line-clamp-3 text-sm text-muted">{paper.abstract}</p>}
                <div className="mt-2 text-xs text-muted">
                  {paper.keywords && <>Keywords: {paper.keywords} · </>}Review due {fmtDate(a.dueDate)}
                </div>
                <div className="mt-auto flex flex-wrap gap-2 pt-4">
                  <Link href={`/faculty/review/${a.id}`} className="btn btn-primary">Review paper →</Link>
                  {firstLink(paper.driveLink) && (
                    <a href={firstLink(paper.driveLink)} target="_blank" rel="noreferrer" className="btn btn-secondary">Open paper ↗</a>
                  )}
                </div>
              </article>
            ) : null,
          )}
        </div>
      )}

      <div className="mt-10">
        <Section title={`Completed reviews (${done.length})`}>
          {done.length === 0 ? (
            <div className="p-4"><Empty>No completed reviews yet.</Empty></div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="border-b border-line">
                  <tr><th className="th">Paper</th><th className="th">Your recommendation</th><th className="th">Submitted</th><th className="th" /></tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {done.map(({ a, paper, review, decision }) => (
                    <tr key={a.id}>
                      <td className="td">
                        <div className="font-mono text-xs text-muted">{paper?.id}</div>
                        <div className="font-medium">{paper?.title}</div>
                      </td>
                      <td className="td">{review && <DecisionBadge value={review.recommendation} />}</td>
                      <td className="td whitespace-nowrap text-muted">{fmtDate(review?.submittedAt)}</td>
                      <td className="td text-right">
                        <Link href={`/faculty/review/${a.id}`} className="btn btn-secondary btn-sm">
                          {decision?.emailStatus === "Sent" ? "View" : "View / edit"}
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Section>
      </div>
    </>
  );
}

/** One glance: how far along the reviewer is and what is due next. */
function Progress({ done, total, overdue, nextDue }: { done: number; total: number; overdue: number; nextDue?: string }) {
  const pct = Math.round((done / total) * 100);
  const days = nextDue ? daysUntil(nextDue) : null;
  return (
    <div className="card mb-8 p-5">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <div className="text-xs font-medium uppercase tracking-wide text-muted">Your progress</div>
          <div className="mt-1 text-2xl font-semibold tabular-nums">
            {done} of {total} {total === 1 ? "review" : "reviews"} done
          </div>
        </div>
        <div className="text-sm text-muted">
          {done === total ? (
            <span className="font-medium text-good">✓ All done. Thank you!</span>
          ) : overdue > 0 ? (
            <span className="font-medium text-bad">{overdue} overdue. Please prioritise {overdue === 1 ? "it" : "them"}.</span>
          ) : nextDue && days !== null ? (
            <>Next review due <b className="text-ink">{fmtDate(nextDue)}</b> ({relativeDays(days)})</>
          ) : null}
        </div>
      </div>
      <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-line" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={done} aria-label="Reviews done">
        <div className="h-full rounded-full bg-stage-3 transition-all" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
