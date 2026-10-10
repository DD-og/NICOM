"use client";

import { useActionState } from "react";
import { submitReview } from "@/app/actions";
import { SubmitButton } from "@/app/components/client";
import { RECOMMENDATIONS, type Review } from "@/lib/types";

const CRITERIA = [
  { key: "originality", label: "Originality & contribution", help: "Novelty of the idea and contribution to the field" },
  { key: "methodology", label: "Methodology & rigour", help: "Research design, data, analysis" },
  { key: "relevance", label: "Relevance to the track", help: "Fit with the conference theme and track" },
  { key: "clarity", label: "Clarity of presentation", help: "Structure, writing, referencing" },
  { key: "overall", label: "Overall assessment", help: "Your overall rating of the paper" },
] as const;

const REC_HELP: Record<string, string> = {
  Accept: "Ready for presentation as is",
  "Accept with Minor Revisions": "Accept; small fixes needed",
  "Major Revisions": "Substantial changes, re-review",
  Reject: "Not suitable for the conference",
  "Recommended for Journal Publication": "Exceptional; recommend to the journal",
};

export function ReviewForm({ assignmentId, review, locked }: { assignmentId: string; review?: Review; locked: boolean }) {
  const [state, action] = useActionState(submitReview, undefined);
  // After a failed submit, show what the reviewer entered (React resets the form to these defaults).
  const v = state?.values;
  const score = (k: (typeof CRITERIA)[number]["key"]) => (v ? Number(v[k]) : review?.[k]);
  const recommendation = v ? v.recommendation : review?.recommendation;
  const text = (k: "commentsToAuthors" | "confidentialComments") => (v ? String(v[k] ?? "") : review?.[k]);

  return (
    <form action={action} className="space-y-6">
      <input type="hidden" name="assignmentId" value={assignmentId} />
      <fieldset disabled={locked} className="space-y-6 disabled:opacity-70">
        <div className="space-y-4">
          <div className="flex items-baseline justify-between">
            <h3 className="text-sm font-semibold">Scores</h3>
            <span className="text-xs text-muted">1 = poor · 5 = excellent</span>
          </div>
          {CRITERIA.map((c) => (
            <div key={c.key} className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="text-sm font-medium">{c.label}</div>
                <div className="text-xs text-muted">{c.help}</div>
              </div>
              <div className="flex gap-1" role="radiogroup" aria-label={c.label}>
                {[1, 2, 3, 4, 5].map((n) => (
                  <label key={n} className="cursor-pointer">
                    <input type="radio" name={c.key} value={n} defaultChecked={score(c.key) === n} className="peer sr-only" required />
                    <span className="grid size-9 place-items-center rounded-lg border border-line text-sm font-medium tabular-nums transition peer-checked:border-brand peer-checked:bg-brand peer-checked:text-white peer-focus-visible:ring-2 peer-focus-visible:ring-brand/40 hover:border-brand">
                      {n}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div>
          <h3 className="mb-2 text-sm font-semibold">Recommendation</h3>
          <div className="grid gap-2 sm:grid-cols-2">
            {RECOMMENDATIONS.map((r) => (
              <label key={r} className="cursor-pointer">
                <input type="radio" name="recommendation" value={r} defaultChecked={recommendation === r} className="peer sr-only" required />
                <div className="h-full rounded-lg border border-line p-3 transition peer-checked:border-brand peer-checked:bg-brand-soft peer-checked:ring-2 peer-checked:ring-brand peer-focus-visible:ring-2 peer-focus-visible:ring-brand/40 hover:border-brand peer-checked:[&_.chk]:inline">
                  <div className="text-sm font-medium"><span className="chk mr-1 hidden text-brand" aria-hidden>✓</span>{r}</div>
                  <div className="text-xs text-muted">{REC_HELP[r]}</div>
                </div>
              </label>
            ))}
          </div>
        </div>

        <div>
          <label className="label" htmlFor="commentsToAuthors">Comments to authors</label>
          <p className="mb-2 text-xs text-muted">Shared with the authors in the decision email (anonymously, as “Reviewer 1/2”).</p>
          <textarea id="commentsToAuthors" name="commentsToAuthors" rows={7} required minLength={30} defaultValue={text("commentsToAuthors")} className="input" placeholder="Strengths, weaknesses and specific suggestions for improvement…" />
        </div>
        <div>
          <label className="label" htmlFor="confidentialComments">Confidential comments to the committee <span className="font-normal text-muted">(optional)</span></label>
          <p className="mb-2 text-xs text-muted">Visible only to the master admin. Never sent to authors.</p>
          <textarea id="confidentialComments" name="confidentialComments" rows={3} defaultValue={text("confidentialComments")} className="input" placeholder="e.g. possible plagiarism, conflict of interest…" />
        </div>
      </fieldset>

      {state?.error && <p className="rounded-lg bg-bad-soft px-3 py-2 text-sm text-bad">{state.error}</p>}
      {!locked && (
        <div className="flex items-center gap-3">
          <SubmitButton pendingText="Submitting…">{review ? "Update review" : "Submit review"}</SubmitButton>
          <span className="text-xs text-muted">You can edit your review until the author is notified.</span>
        </div>
      )}
    </form>
  );
}
