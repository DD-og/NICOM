import Link from "next/link";
import { setDecision } from "@/app/actions";
import { Badge, DecisionBadge } from "@/app/components/badges";
import { SubmitButton } from "@/app/components/client";
import { EmailDraftCard } from "@/app/components/email-draft";
import { Empty, PageHeader } from "@/app/components/ui";
import { store } from "@/lib/db";
import { buildDecisionEmail } from "@/lib/email";
import { fmtDate } from "@/lib/format";
import { paperViews } from "@/lib/logic";
import { RECOMMENDATIONS } from "@/lib/types";

const TABS = [
  { key: "decide", label: "Needs decision" },
  { key: "send", label: "Ready to send" },
  { key: "sent", label: "Sent" },
] as const;

export default async function DecisionsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab: rawTab } = await searchParams;
  const db = await store().snapshot();
  const papers = paperViews(db);
  const lists = {
    decide: papers.filter((p) => p.status === "Reviewed"),
    send: papers.filter((p) => p.status === "Decision Drafted"),
    sent: papers.filter((p) => p.status === "Author Notified"),
  };
  const tab = (TABS.find((t) => t.key === rawTab)?.key ?? (lists.decide.length ? "decide" : "send")) as keyof typeof lists;
  const name = (id: string) => db.faculty.find((f) => f.id === id)?.name ?? id;

  return (
    <>
      <PageHeader
        title="Decisions & emails"
        subtitle="Finalise decisions from reviewer recommendations, then send the drafted email to each author."
      />

      <nav className="mb-5 flex gap-1 border-b border-line">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={`/admin/decisions?tab=${t.key}`}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium no-underline ${tab === t.key ? "border-brand text-brand" : "border-transparent text-muted hover:text-ink"}`}
          >
            {t.label} <span className="ml-1 rounded-full bg-surface px-1.5 py-0.5 text-xs tabular-nums text-muted">{lists[t.key].length}</span>
          </Link>
        ))}
      </nav>

      {tab === "decide" &&
        (lists.decide.length === 0 ? (
          <Empty>No reviewed papers are waiting for a decision. Papers whose reviewers all agree get a decision drafted automatically.</Empty>
        ) : (
          <div className="space-y-3">
            {lists.decide.map((p) => (
              <div key={p.id} className="card p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs text-muted">{p.id}</span>
                      <Badge t="brand">{p.domain}</Badge>
                      {p.reviewersDisagree && <Badge t="warn">⚠ Reviewers disagree</Badge>}
                      {p.avgScore !== null && <span className="text-xs text-muted">Avg. overall {p.avgScore.toFixed(1)}/5</span>}
                    </div>
                    <Link href={`/admin/papers/${p.id}`} className="mt-1 block font-medium text-ink">{p.title}</Link>
                    <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
                      {p.reviews.map((r) => (
                        <li key={r.id} className="flex items-center gap-1.5">
                          <span className="text-muted">{name(r.facultyId)}:</span> <DecisionBadge value={r.recommendation} />
                        </li>
                      ))}
                    </ul>
                  </div>
                  <form action={setDecision} className="flex w-full flex-wrap items-end gap-2 sm:w-auto">
                    <input type="hidden" name="paperId" value={p.id} />
                    <select name="finalDecision" defaultValue={p.suggestion ?? ""} required className="input w-full sm:w-64" aria-label={`Decision for ${p.id}`}>
                      <option value="" disabled>Choose decision…</option>
                      {RECOMMENDATIONS.map((r) => <option key={r}>{r}</option>)}
                    </select>
                    <SubmitButton>Save &amp; draft email</SubmitButton>
                  </form>
                </div>
              </div>
            ))}
          </div>
        ))}

      {tab === "send" &&
        (lists.send.length === 0 ? (
          <Empty>No drafted emails waiting to be sent.</Empty>
        ) : (
          <div className="space-y-3">
            {lists.send.map((p, i) => (
              <details key={p.id} className="card group" open={i === 0}>
                <summary className="flex cursor-pointer list-none flex-wrap items-center gap-2 p-4">
                  <span className="text-muted group-open:rotate-90" aria-hidden>▸</span>
                  <span className="font-mono text-xs text-muted">{p.id}</span>
                  <span className="min-w-0 flex-1 truncate font-medium">{p.title}</span>
                  <DecisionBadge value={p.decision!.finalDecision} />
                  {p.decision!.decidedBy === "AUTO" && <Badge title="Drafted automatically because all reviewers agreed">Auto</Badge>}
                </summary>
                <div className="border-t border-line p-4">
                  <EmailDraftCard
                    draft={buildDecisionEmail(p, p.decision!.finalDecision, p.reviews)}
                    paperId={p.id}
                    emailStatus="Draft"
                  />
                  <div className="mt-3 text-right">
                    <Link href={`/admin/papers/${p.id}`} className="text-xs">Change decision →</Link>
                  </div>
                </div>
              </details>
            ))}
          </div>
        ))}

      {tab === "sent" &&
        (lists.sent.length === 0 ? (
          <Empty>No emails marked as sent yet.</Empty>
        ) : (
          <div className="card overflow-x-auto">
            <table className="w-full">
              <thead className="border-b border-line">
                <tr><th className="th">Paper</th><th className="th">Author</th><th className="th">Decision</th><th className="th">Sent</th></tr>
              </thead>
              <tbody className="divide-y divide-line">
                {lists.sent.map((p) => (
                  <tr key={p.id}>
                    <td className="td">
                      <div className="font-mono text-xs text-muted">{p.id}</div>
                      <Link href={`/admin/papers/${p.id}`} className="text-ink">{p.title}</Link>
                    </td>
                    <td className="td text-sm">{p.authorName}<div className="text-xs text-muted">{p.email}</div></td>
                    <td className="td"><DecisionBadge value={p.decision!.finalDecision} /></td>
                    <td className="td whitespace-nowrap text-sm">{fmtDate(p.decision!.emailSentAt, true)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
    </>
  );
}
