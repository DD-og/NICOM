import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, DecisionBadge, DueBadge } from "@/app/components/badges";
import { requireUser } from "@/lib/auth";
import { config } from "@/lib/config";
import { store } from "@/lib/db";
import { drivePreviewUrl, firstLink, fmtDate, paperLinkLabel } from "@/lib/format";
import { sortByDue } from "@/lib/logic";
import { ReviewForm } from "./review-form";

export default async function ReviewPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ submitted?: string }> }) {
  const user = await requireUser("faculty");
  const { id } = await params;
  const { submitted } = await searchParams;
  const db = await store().snapshot();
  const a = db.assignments.find((x) => x.id === id && x.facultyId === user.id);
  if (!a) notFound();
  const paper = db.papers.find((p) => p.id === a.paperId);
  if (!paper) notFound();
  const review = db.reviews.find((r) => r.assignmentId === a.id);
  const decision = db.decisions.find((d) => d.paperId === paper.id);
  const locked = decision?.emailStatus === "Sent";
  const link = firstLink(paper.driveLink);
  const preview = link ? drivePreviewUrl(link) : null;
  const nextPending = db.assignments
    .filter((x) => x.facultyId === user.id && x.status === "Pending" && x.id !== a.id)
    .sort(sortByDue)[0];

  return (
    <>
      <Link href="/faculty" className="text-sm no-underline hover:underline">← Back to my papers</Link>

      {submitted && review && (
        <div className="mt-4 rounded-xl border border-transparent bg-good-soft p-4 text-sm text-good">
          <div className="font-semibold">✓ Review submitted. Thank you!</div>
          <div className="mt-0.5">
            Your recommendation (<b>{review.recommendation}</b>) has been recorded. The conference office will finalise the decision and email the author.
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {nextPending ? (
              <Link href={`/faculty/review/${nextPending.id}`} className="btn btn-primary btn-sm">Review your next paper →</Link>
            ) : (
              <span className="font-medium">That was your last pending paper.</span>
            )}
            <Link href="/faculty" className="btn btn-secondary btn-sm">Back to my papers</Link>
          </div>
        </div>
      )}

      <div className="mt-4 grid gap-6 lg:grid-cols-5">
        <div className="space-y-4 lg:col-span-2">
          <div className="card p-5">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <span className="font-mono text-xs text-muted">{paper.id}</span>
              <Badge t="brand">{paper.domain}</Badge>
              <span className="ml-auto"><DueBadge dueDate={a.dueDate} status={a.status} /></span>
            </div>
            <h1 className="text-xl font-semibold leading-snug">{paper.title}</h1>
            <div className="mt-1 text-xs text-muted">Submitted {fmtDate(paper.submittedAt)} · Due {fmtDate(a.dueDate)}</div>

            {!config.blindReview && (
              <div className="mt-3 rounded-lg bg-surface p-3 text-sm">
                <div><span className="text-muted">Author:</span> {paper.authorName}{paper.coAuthors ? `, ${paper.coAuthors}` : ""}</div>
                <div><span className="text-muted">Affiliation:</span> {paper.affiliation}</div>
              </div>
            )}

            {paper.abstract && (
              <>
                <h2 className="mt-4 text-sm font-semibold">Abstract</h2>
                <p className="mt-1 text-sm leading-relaxed text-muted">{paper.abstract}</p>
              </>
            )}
            {paper.keywords && <div className="mt-3 text-sm"><span className="text-muted">Keywords:</span> {paper.keywords}</div>}

            <div className="mt-5 flex flex-wrap gap-2">
              {link ? (
                <a href={link} target="_blank" rel="noreferrer" className="btn btn-primary">{paperLinkLabel(link)} ↗</a>
              ) : (
                <span className="text-sm text-bad">No paper link on file. Contact the conference office.</span>
              )}
            </div>
            {config.blindReview && (
              <p className="mt-3 text-xs text-muted">Double-blind review: author identities are hidden from reviewers. Read the paper, then fill in the form. Your draft is saved in this browser as you type.</p>
            )}
          </div>

          {preview && (
            <details className="card group overflow-hidden">
              <summary className="cursor-pointer list-none px-5 py-3 text-sm font-medium">
                <span className="group-open:hidden">▸ Show inline preview</span>
                <span className="hidden group-open:inline">▾ Hide inline preview</span>
              </summary>
              <iframe src={preview} className="h-[70vh] w-full border-t border-line bg-white" title={`Preview of ${paper.id}`} />
              <p className="px-5 py-2 text-xs text-muted">If the preview is blank, open the paper in Drive. You need access to the submissions folder.</p>
            </details>
          )}
        </div>

        <div className="space-y-6 lg:col-span-3">
          <div className="card p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold">{review ? "Your review" : "Write your review"}</h2>
              {review && <DecisionBadge value={review.recommendation} />}
            </div>
            {locked && (
              <p className="mb-4 rounded-lg bg-surface p-3 text-sm text-muted">The author has been notified of the final decision, so this review is now read-only.</p>
            )}
            <ReviewForm assignmentId={a.id} review={review} locked={locked} justSubmitted={Boolean(submitted && review)} />
          </div>

        </div>
      </div>
    </>
  );
}
