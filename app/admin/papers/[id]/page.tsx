import Link from "next/link";
import { notFound } from "next/navigation";
import { assignReviewer, clearDecision, removeAssignment, setDecision, updateDueDate } from "@/app/actions";
import { Badge, DecisionBadge, DueBadge, StatusBadge, YesNoBadge } from "@/app/components/badges";
import { ConfirmSubmit, CopyButton, SubmitButton } from "@/app/components/client";
import { EmailDraftCard } from "@/app/components/email-draft";
import { Section } from "@/app/components/ui";
import { config } from "@/lib/config";
import { store } from "@/lib/db";
import { buildDecisionEmail } from "@/lib/email";
import { firstLink, fmtDate, paperLinkLabel } from "@/lib/format";
import { isAuthor, paperViews } from "@/lib/logic";
import { averageScore, CRITERIA, NOMINATIONS } from "@/lib/evaluation";
import { RECOMMENDATIONS } from "@/lib/types";

export default async function AdminPaperPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = await store().snapshot();
  const p = paperViews(db).find((x) => x.id === decodeURIComponent(id));
  if (!p) notFound();

  const faculty = db.faculty.filter((f) => f.role === "faculty" && f.active);
  const onPaper = new Set(p.assignments.map((a) => a.facultyId));
  const inTrack = faculty.filter((f) => f.domains.includes(p.domain) && !onPaper.has(f.id));
  const conflicted = inTrack.filter((f) => isAuthor(f, p));
  const authorIds = new Set(db.faculty.filter((f) => isAuthor(f, p)).map((f) => f.id));
  const experts = inTrack.filter((f) => !isAuthor(f, p));
  const load = (fid: string) => db.assignments.filter((a) => a.facultyId === fid).length;
  const name = (fid: string) => db.faculty.find((f) => f.id === fid)?.name ?? fid;
  const defaultDue = new Date(Date.now() + 14 * 86_400_000).toISOString().slice(0, 10);
  const link = firstLink(p.driveLink);
  const decisionDefault = p.decision?.finalDecision ?? p.suggestion ?? "";

  return (
    <>
      <Link href="/admin/papers" className="text-sm no-underline hover:underline">← All papers</Link>
      <div className="mb-6 mt-3">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <span className="font-mono text-sm text-muted">{p.id}</span>
          <Badge t="brand">{p.domain}</Badge>
          <StatusBadge status={p.status} />
        </div>
        <h1 className="text-2xl font-semibold leading-snug">{p.title}</h1>
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        <div className="space-y-6 lg:col-span-2">
          <Section title="Submission">
            <dl className="grid grid-cols-[7rem_1fr] gap-x-3 gap-y-2 p-4 text-sm">
              <dt className="text-muted">Author</dt><dd className="font-medium">{p.authorName}</dd>
              <dt className="text-muted">Email</dt>
              <dd className="flex items-center gap-2"><span className="min-w-0 break-all">{p.email}</span> <CopyButton text={p.email} label="Copy" className="btn btn-secondary btn-sm shrink-0" /></dd>
              {p.phone && <><dt className="text-muted">Phone</dt><dd>{p.phone}</dd></>}
              {p.affiliation && <><dt className="text-muted">Affiliation</dt><dd>{p.affiliation}</dd></>}
              {p.coAuthors && <><dt className="text-muted">Co-authors</dt><dd>{p.coAuthors}</dd></>}
              <dt className="text-muted">Submitted</dt><dd>{fmtDate(p.submittedAt, /\d{2}:\d{2}/.test(p.submittedAt))}</dd>
              {p.keywords && <><dt className="text-muted">Keywords</dt><dd>{p.keywords}</dd></>}
            </dl>
            <div className="border-t border-line p-4">
              {p.abstract && (
                <>
                  <h3 className="text-sm font-semibold">Abstract</h3>
                  <p className="mb-4 mt-1 text-sm leading-relaxed text-muted">{p.abstract}</p>
                </>
              )}
              {link ? (
                <a href={link} target="_blank" rel="noreferrer" className="btn btn-primary">{paperLinkLabel(link)} ↗</a>
              ) : (
                <span className="text-sm text-bad">No paper link on file.</span>
              )}
            </div>
          </Section>

          <Section title={`Reviewers (${p.assignments.length}/${config.reviewersPerPaper})`}>
            <ul className="divide-y divide-line">
              {p.assignments.map((a) => (
                <li key={a.id} className="space-y-2 px-4 py-3 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex flex-wrap items-center gap-2">
                      <Link href={`/admin/faculty/${a.facultyId}`} className="font-medium">{name(a.facultyId)}</Link>
                      {authorIds.has(a.facultyId) && <Badge t="bad">! Author of this paper</Badge>}
                    </span>
                    <DueBadge dueDate={a.dueDate} status={a.status} />
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {a.status === "Pending" && (
                      <form action={updateDueDate} className="flex items-center gap-1.5">
                        <input type="hidden" name="assignmentId" value={a.id} />
                        <label className="text-xs text-muted" htmlFor={`due-${a.id}`}>Due</label>
                        <input id={`due-${a.id}`} type="date" name="dueDate" defaultValue={a.dueDate} className="input w-auto py-1 text-xs" />
                        <SubmitButton className="btn btn-secondary btn-sm">Update</SubmitButton>
                      </form>
                    )}
                    <form action={removeAssignment} className="ml-auto">
                      <input type="hidden" name="assignmentId" value={a.id} />
                      <ConfirmSubmit message={a.status === "Completed" ? "Remove this reviewer AND delete their submitted review?" : "Remove this reviewer from the paper?"}>
                        Remove
                      </ConfirmSubmit>
                    </form>
                  </div>
                </li>
              ))}
            </ul>
            {conflicted.length > 0 && (
              <p className="border-t border-line px-4 pt-3 text-xs text-muted">
                Not offered (author of this paper): {conflicted.map((f) => f.name).join(", ")}
              </p>
            )}
            {experts.length === 0 ? (
              <p className="border-t border-line p-4 text-sm text-muted">
                No other faculty review &ldquo;{p.domain}&rdquo;. Add this track to a faculty member on the Faculty page to assign them.
              </p>
            ) : (
              <details open={p.assignments.length < config.reviewersPerPaper} className="group border-t border-line">
                <summary className="cursor-pointer list-none px-4 py-3 text-sm font-medium text-brand group-open:hidden">+ Add another reviewer</summary>
                <form action={assignReviewer} className="space-y-2 p-4">
                  <input type="hidden" name="paperId" value={p.id} />
                  <label className="label" htmlFor="facultyId">Add a reviewer</label>
                  <select id="facultyId" name="facultyId" required className="input" defaultValue="">
                    <option value="" disabled>Select faculty…</option>
                    <optgroup label={`Faculty who review ${p.domain}`}>
                      {experts.map((f) => <option key={f.id} value={f.id}>{f.name} ({load(f.id)}/{f.maxLoad || "∞"} papers)</option>)}
                    </optgroup>
                  </select>
                  <div className="flex items-end gap-2">
                    <div className="flex-1">
                      <label className="label text-xs" htmlFor="dueDate">Due date</label>
                      <input id="dueDate" type="date" name="dueDate" defaultValue={defaultDue} className="input" />
                    </div>
                    <SubmitButton>Assign</SubmitButton>
                  </div>
                </form>
              </details>
            )}
          </Section>
        </div>

        <div className="space-y-6 lg:col-span-3">
          <Section title={`Reviews (${p.reviews.length}/${p.assignments.length})`}>
            {p.reviews.length === 0 ? (
              <p className="p-4 text-sm text-muted">No reviews submitted yet.</p>
            ) : (
              <div className="divide-y divide-line">
                {p.reviews.map((r) => (
                  <article key={r.id} className="space-y-3 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <div className="font-medium">{name(r.facultyId)}</div>
                        <div className="text-xs text-muted">Submitted {fmtDate(r.submittedAt, true)}</div>
                      </div>
                      <DecisionBadge value={r.recommendation} />
                    </div>
                    <div className="text-sm">
                      <span className="text-muted">Overall evaluation:</span> <span className="font-medium">{r.recommendation}</span>
                    </div>
                    <table className="w-full text-sm">
                      <tbody className="divide-y divide-line">
                        {CRITERIA.map((c) => (
                          <tr key={c.key} title={c.statement}>
                            <td className="py-1.5 pr-3 text-muted">{c.header}</td>
                            <td className="w-16 py-1.5 text-right font-semibold tabular-nums">{r[c.key] || "—"}<span className="text-xs font-normal text-muted">/5</span></td>
                          </tr>
                        ))}
                        <tr>
                          <td className="py-1.5 pr-3 font-medium">Average</td>
                          <td className="py-1.5 text-right font-semibold tabular-nums">{averageScore(r)?.toFixed(1) ?? "—"}<span className="text-xs font-normal text-muted">/5</span></td>
                        </tr>
                      </tbody>
                    </table>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-xs text-muted">Internal:</span>
                      {NOMINATIONS.map((q) => <YesNoBadge key={q.key} label={q.header} value={r[q.key]} />)}
                    </div>
                    <div>
                      <div className="text-xs font-semibold uppercase tracking-wide text-muted">Comments to authors</div>
                      <p className="mt-1 whitespace-pre-wrap text-sm">{r.commentsToAuthors}</p>
                    </div>
                    {r.confidentialComments && (
                      <div className="rounded-lg bg-warn-soft p-3 text-sm text-warn">
                        <div className="text-xs font-semibold uppercase tracking-wide">Confidential (committee only)</div>
                        <p className="mt-1 whitespace-pre-wrap">{r.confidentialComments}</p>
                      </div>
                    )}
                  </article>
                ))}
              </div>
            )}
          </Section>

          <Section title="Final decision">
            <div className="space-y-4 p-4">
              {p.reviewersDisagree && !p.decision && (
                <p className="rounded-lg bg-warn-soft p-3 text-sm text-warn">⚠ Reviewers disagree. Please make the final call.</p>
              )}
              {p.decision && (
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <DecisionBadge value={p.decision.finalDecision} />
                  <span className="text-muted">
                    {p.decision.decidedBy === "AUTO" ? "Auto-drafted from reviewer consensus" : `Set by ${name(p.decision.decidedBy)}`} · {fmtDate(p.decision.decidedAt, true)}
                  </span>
                  <Badge t={p.decision.emailStatus === "Sent" ? "good" : "warn"}>
                    {p.decision.emailStatus === "Sent" ? `✓ Email sent ${fmtDate(p.decision.emailSentAt)}` : "✉ Email not sent"}
                  </Badge>
                </div>
              )}
              <form action={setDecision} className="flex flex-wrap items-end gap-2">
                <input type="hidden" name="paperId" value={p.id} />
                <div className="min-w-64 flex-1">
                  <label className="label text-xs" htmlFor="finalDecision">
                    Decision {p.suggestion && !p.decision && <span className="font-normal text-muted">(suggested: {p.suggestion})</span>}
                  </label>
                  <select id="finalDecision" name="finalDecision" defaultValue={decisionDefault} required className="input">
                    <option value="" disabled>Choose…</option>
                    {RECOMMENDATIONS.map((r) => <option key={r}>{r}</option>)}
                  </select>
                </div>
                <div className="min-w-48 flex-1">
                  <label className="label text-xs" htmlFor="notes">Internal note</label>
                  <input id="notes" name="notes" defaultValue={p.decision?.notes} className="input" placeholder="Optional" />
                </div>
                <SubmitButton>{p.decision ? "Update decision" : "Save decision"}</SubmitButton>
              </form>
              {p.decision && p.decision.emailStatus !== "Sent" && (
                <form action={clearDecision}>
                  <input type="hidden" name="paperId" value={p.id} />
                  <ConfirmSubmit message="Clear the recorded decision for this paper?" className="btn btn-secondary btn-sm">Clear decision</ConfirmSubmit>
                </form>
              )}
            </div>
          </Section>

          {p.decision && (
            <Section title="Decision email">
              <div className="p-4">
                <EmailDraftCard
                  draft={buildDecisionEmail(p, p.decision.finalDecision, p.reviews)}
                  paperId={p.id}
                  emailStatus={p.decision.emailStatus}
                />
              </div>
            </Section>
          )}
        </div>
      </div>
    </>
  );
}
