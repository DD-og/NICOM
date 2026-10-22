"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { submitReview } from "@/app/actions";
import { SubmitButton } from "@/app/components/client";
import { CRITERIA, NOMINATIONS, OVERALL_QUESTION } from "@/lib/evaluation";
import { RECOMMENDATIONS, type Review } from "@/lib/types";

const MIN_COMMENT = 30;
type Draft = { savedAt: string; values: Record<string, string> };

// Browser storage can be unavailable (private mode, blocked site data); drafts are a convenience only.
function readDraft(key: string): Draft | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as Draft) : null;
  } catch {
    return null;
  }
}
function writeDraft(key: string, draft: Draft | null) {
  try {
    if (draft) localStorage.setItem(key, JSON.stringify(draft));
    else localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

/** What is still missing before the review can be submitted. */
function progressOf(form: HTMLFormElement) {
  const fd = new FormData(form);
  return {
    scores: CRITERIA.filter((c) => fd.get(c.key)).length,
    recommendation: Boolean(fd.get("recommendation")),
    nominations: NOMINATIONS.filter((q) => fd.get(q.key)).length,
    comment: String(fd.get("commentsToAuthors") ?? "").trim().length,
  };
}

export function ReviewForm({ assignmentId, review, locked, justSubmitted = false }: { assignmentId: string; review?: Review; locked: boolean; justSubmitted?: boolean }) {
  const [state, action] = useActionState(submitReview, undefined);
  const formRef = useRef<HTMLFormElement>(null);
  const dirty = useRef(false);
  const draftKey = `nicom-review-draft:${assignmentId}`;
  const [restored, setRestored] = useState(false);
  const [progress, setProgress] = useState({ scores: 0, recommendation: false, nominations: 0, comment: 0 });
  // After a failed submit, show what the reviewer entered (React resets the form to these defaults).
  const v = state?.values;
  const score = (k: (typeof CRITERIA)[number]["key"]) => (v ? Number(v[k]) : review?.[k]);
  const answer = (k: (typeof NOMINATIONS)[number]["key"]) => (v ? String(v[k] ?? "") : review?.[k]);
  const recommendation = v ? v.recommendation : review?.recommendation;
  const text = (k: "commentsToAuthors" | "confidentialComments") => (v ? String(v[k] ?? "") : review?.[k]);

  useEffect(() => {
    const form = formRef.current;
    if (!form) return;
    if (justSubmitted || locked) {
      writeDraft(draftKey, null);
    } else if (!state?.values) {
      // Bring back an unsent draft, unless the saved review is newer.
      const draft = readDraft(draftKey);
      if (draft && (!review || draft.savedAt > review.submittedAt)) {
        for (const [name, value] of Object.entries(draft.values)) {
          const el = form.elements.namedItem(name);
          if (el instanceof RadioNodeList) {
            for (const r of Array.from(el)) if (r instanceof HTMLInputElement) r.checked = r.value === value;
          } else if (el instanceof HTMLTextAreaElement) {
            el.value = value;
          }
        }
        setRestored(true);
      }
    }
    setProgress(progressOf(form));
    const warn = (e: BeforeUnloadEvent) => {
      if (dirty.current) e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [draftKey, justSubmitted, locked, review, state]);

  function onChange() {
    const form = formRef.current;
    if (!form || locked) return;
    dirty.current = true;
    const values: Record<string, string> = {};
    for (const [k, val] of new FormData(form)) if (k !== "assignmentId") values[k] = String(val);
    writeDraft(draftKey, { savedAt: new Date().toISOString(), values });
    setProgress(progressOf(form));
  }

  function discardDraft() {
    writeDraft(draftKey, null);
    dirty.current = false;
    setRestored(false);
    formRef.current?.reset();
    if (formRef.current) setProgress(progressOf(formRef.current));
  }

  const ready =
    progress.scores === CRITERIA.length && progress.recommendation && progress.nominations === NOMINATIONS.length && progress.comment >= MIN_COMMENT;

  return (
    <form ref={formRef} action={action} onChange={onChange} onSubmit={() => (dirty.current = false)} className="space-y-6">
      {restored && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-info-soft px-3 py-2 text-sm text-info">
          <span>Your unsent draft from this browser has been restored.</span>
          <button type="button" onClick={discardDraft} className="btn btn-secondary btn-sm">Discard draft</button>
        </div>
      )}
      <input type="hidden" name="assignmentId" value={assignmentId} />
      <fieldset disabled={locked} className="space-y-6 disabled:opacity-70">
        <div className="space-y-3">
          <div>
            <h3 className="text-sm font-semibold">Evaluation</h3>
            <p className="text-xs text-muted">Rate each statement from 1 (Strongly Disagree) to 5 (Strongly Agree).</p>
          </div>
          <ol className="space-y-3">
            {CRITERIA.map((c, i) => (
              <li key={c.key} className="rounded-lg border border-line p-3">
                <div id={`q-${c.key}`} className="text-sm">
                  <span className="mr-1 font-semibold tabular-nums text-muted">{i + 1}.</span>
                  {c.statement}
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="hidden text-xs text-muted sm:inline">Strongly Disagree</span>
                  <div className="flex gap-1" role="radiogroup" aria-labelledby={`q-${c.key}`}>
                    {[1, 2, 3, 4, 5].map((n) => (
                      <label key={n} className="cursor-pointer">
                        <input type="radio" name={c.key} value={n} defaultChecked={score(c.key) === n} className="peer sr-only" required />
                        <span className="grid size-9 place-items-center rounded-lg border border-line text-sm font-medium tabular-nums transition peer-checked:border-brand peer-checked:bg-brand peer-checked:text-white peer-focus-visible:ring-2 peer-focus-visible:ring-brand/40 hover:border-brand">
                          {n}
                        </span>
                      </label>
                    ))}
                  </div>
                  <span className="hidden text-xs text-muted sm:inline">Strongly Agree</span>
                  <span className="w-full text-[11px] text-muted sm:hidden">1 = Strongly Disagree · 5 = Strongly Agree</span>
                </div>
              </li>
            ))}
          </ol>
        </div>

        <div>
          <h3 id="q-overall" className="mb-2 text-sm font-semibold">{OVERALL_QUESTION}</h3>
          <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-labelledby="q-overall">
            {RECOMMENDATIONS.map((r) => (
              <label key={r} className="cursor-pointer">
                <input type="radio" name="recommendation" value={r} defaultChecked={recommendation === r} className="peer sr-only" required />
                <div className="h-full rounded-lg border border-line p-3 text-sm font-medium transition peer-checked:border-brand peer-checked:bg-brand-soft peer-checked:ring-2 peer-checked:ring-brand peer-focus-visible:ring-2 peer-focus-visible:ring-brand/40 hover:border-brand peer-checked:[&_.chk]:inline">
                  <span className="chk mr-1 hidden text-brand" aria-hidden>✓</span>{r}
                </div>
              </label>
            ))}
          </div>
        </div>

        <div className="space-y-3">
          <div>
            <h3 className="text-sm font-semibold">Recommendations to the committee</h3>
            <p className="text-xs text-muted">For the committee only. These answers are never shared with the authors.</p>
          </div>
          {NOMINATIONS.map((q) => (
            <div key={q.key} className="flex flex-wrap items-center justify-between gap-2">
              <div id={`q-${q.key}`} className="text-sm">{q.question}</div>
              <div className="flex gap-1" role="radiogroup" aria-labelledby={`q-${q.key}`}>
                {(["Yes", "No"] as const).map((yn) => (
                  <label key={yn} className="cursor-pointer">
                    <input type="radio" name={q.key} value={yn} defaultChecked={answer(q.key) === yn} className="peer sr-only" required />
                    <span className="grid h-9 w-14 place-items-center rounded-lg border border-line text-sm font-medium transition peer-checked:border-brand peer-checked:bg-brand peer-checked:text-white peer-focus-visible:ring-2 peer-focus-visible:ring-brand/40 hover:border-brand">
                      {yn}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div>
          <label className="label" htmlFor="commentsToAuthors">Comments to authors</label>
          <p className="mb-2 text-xs text-muted">Shared with the authors in the decision email (anonymously, as “Reviewer 1/2”).</p>
          <textarea id="commentsToAuthors" name="commentsToAuthors" rows={7} required minLength={MIN_COMMENT} defaultValue={text("commentsToAuthors")} className="input" placeholder="Strengths, weaknesses and specific suggestions for improvement…" aria-describedby="comment-count" />
          <p id="comment-count" className={`mt-1 text-xs ${progress.comment > 0 && progress.comment < MIN_COMMENT ? "text-warn" : "text-muted"}`}>
            {progress.comment} characters{progress.comment < MIN_COMMENT ? ` (at least ${MIN_COMMENT} needed)` : ""}
          </p>
        </div>
        <div>
          <label className="label" htmlFor="confidentialComments">Confidential comments to the committee <span className="font-normal text-muted">(optional)</span></label>
          <p className="mb-2 text-xs text-muted">Visible only to the master admin. Never sent to authors.</p>
          <textarea id="confidentialComments" name="confidentialComments" rows={3} defaultValue={text("confidentialComments")} className="input" placeholder="e.g. possible plagiarism, conflict of interest…" />
        </div>
      </fieldset>

      {state?.error && <p className="rounded-lg bg-bad-soft px-3 py-2 text-sm text-bad">{state.error}</p>}
      {!locked && (
        <div className="space-y-3 border-t border-line pt-4">
          <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs" aria-label="Before you submit">
            <Check ok={progress.scores === CRITERIA.length}>Statements {progress.scores}/{CRITERIA.length}</Check>
            <Check ok={progress.recommendation}>Overall evaluation</Check>
            <Check ok={progress.nominations === NOMINATIONS.length}>Journal, SCOPUS, Best Paper {progress.nominations}/{NOMINATIONS.length}</Check>
            <Check ok={progress.comment >= MIN_COMMENT}>Comments to authors</Check>
          </ul>
          <div className="flex flex-wrap items-center gap-3">
            <SubmitButton pendingText="Submitting…">{review ? "Update review" : "Submit review"}</SubmitButton>
            <span className="text-xs text-muted">
              {ready ? "Ready to submit. " : ""}You can edit your review until the author is notified.
            </span>
          </div>
        </div>
      )}
    </form>
  );
}

function Check({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <li className={ok ? "text-good" : "text-muted"}>
      <span aria-hidden>{ok ? "✓" : "○"}</span> {children}
      <span className="sr-only">{ok ? " (done)" : " (missing)"}</span>
    </li>
  );
}
