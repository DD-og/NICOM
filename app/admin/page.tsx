import Link from "next/link";
import { Badge, DecisionBadge } from "@/app/components/badges";
import { Meter, PageHeader, Section, Stat } from "@/app/components/ui";
import { config, DOMAINS } from "@/lib/config";
import { store } from "@/lib/db";
import { fmtDate } from "@/lib/format";
import { facultyLoads, isOverdue, paperViews } from "@/lib/logic";
import { RECOMMENDATIONS, type PaperStatus } from "@/lib/types";

const STAGES: { key: string; label: string; statuses: PaperStatus[]; color: string }[] = [
  { key: "u", label: "Unassigned", statuses: ["Unassigned"], color: "bg-stage-1" },
  { key: "r", label: "Under review", statuses: ["Under Review"], color: "bg-stage-2" },
  { key: "w", label: "Awaiting decision", statuses: ["Reviewed"], color: "bg-stage-3" },
  { key: "d", label: "Decided", statuses: ["Decision Drafted", "Author Notified"], color: "bg-stage-4" },
];

export default async function AdminOverview() {
  const db = await store().snapshot();
  const papers = paperViews(db);
  const loads = facultyLoads(db).sort((a, b) => b.pending - a.pending || a.faculty.name.localeCompare(b.faculty.name));
  const totalAssignments = db.assignments.length;
  const completed = db.assignments.filter((a) => a.status === "Completed").length;
  const overdue = db.assignments.filter(isOverdue).length;
  const needReviewers = papers.filter((p) => p.needsReviewers > 0).length;
  const awaiting = papers.filter((p) => p.status === "Reviewed");
  const drafts = papers.filter((p) => p.status === "Decision Drafted").length;
  const notified = papers.filter((p) => p.status === "Author Notified").length;

  const domains = [...new Set([...DOMAINS, ...db.papers.map((p) => p.domain)])].filter((d) => papers.some((p) => p.domain === d));
  const maxTrack = Math.max(1, ...domains.map((d) => papers.filter((p) => p.domain === d).length));
  const decisionCounts = RECOMMENDATIONS.map((r) => ({ r, n: db.decisions.filter((d) => d.finalDecision === r).length }));
  const maxDecision = Math.max(1, ...decisionCounts.map((d) => d.n));
  const recent = [...db.reviews].sort((a, b) => b.submittedAt.localeCompare(a.submittedAt)).slice(0, 6);

  const todo = [
    needReviewers && {
      text: `${needReviewers} paper${needReviewers > 1 ? "s" : ""} still need${needReviewers > 1 ? "" : "s"} reviewers (${config.reviewersPerPaper} per paper)`,
      href: "/admin/distribute",
      cta: "Distribute",
    },
    awaiting.length && {
      text: `${awaiting.length} reviewed paper${awaiting.length > 1 ? "s" : ""} awaiting your decision${awaiting.some((p) => p.reviewersDisagree) ? " (reviewers disagree on some)" : ""}`,
      href: "/admin/decisions",
      cta: "Decide",
    },
    drafts && { text: `${drafts} decision email${drafts > 1 ? "s" : ""} drafted and ready to send`, href: "/admin/decisions", cta: "Send" },
    overdue && { text: `${overdue} review${overdue > 1 ? "s are" : " is"} overdue`, href: "/admin/faculty", cta: "Follow up" },
  ].filter(Boolean) as { text: string; href: string; cta: string }[];

  return (
    <>
      <PageHeader
        title="Overview"
        subtitle="Live status of submissions, reviews and decisions"
        actions={<a href="/api/export" className="btn btn-secondary">⤓ Export CSV</a>}
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Stat label="Submissions" value={papers.length} href="/admin/papers" />
        <Stat label="Need reviewers" value={needReviewers} hint={`Fewer than ${config.reviewersPerPaper} assigned`} href="/admin/distribute" />
        <Stat label="Reviews done" value={`${completed}/${totalAssignments}`} hint={<Meter value={completed} max={totalAssignments} label={`${totalAssignments ? Math.round((completed / totalAssignments) * 100) : 0}%`} />} />
        <Stat label="Pending reviews" value={totalAssignments - completed} hint={overdue ? `${overdue} overdue` : "None overdue"} href="/admin/faculty" />
        <Stat label="Awaiting decision" value={awaiting.length} href="/admin/decisions" />
        <Stat label="Authors notified" value={notified} hint={`${drafts} email${drafts === 1 ? "" : "s"} to send`} href="/admin/decisions" />
      </div>

      {todo.length > 0 && (
        <div className="card mt-6 divide-y divide-line">
          {todo.map((t) => (
            <div key={t.text} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
              <span><span className="mr-2 text-warn" aria-hidden>●</span>{t.text}</span>
              <Link href={t.href} className="btn btn-secondary btn-sm">{t.cta} →</Link>
            </div>
          ))}
        </div>
      )}

      <div className="mt-6 grid gap-6 xl:grid-cols-5">
        <div className="xl:col-span-3">
          <Section
            title="Pipeline by track"
            actions={
              <div className="flex flex-wrap gap-3 text-xs text-muted">
                {STAGES.map((s) => (
                  <span key={s.key} className="inline-flex items-center gap-1.5"><span className={`size-2.5 rounded-sm ${s.color}`} />{s.label}</span>
                ))}
              </div>
            }
          >
            <div className="space-y-3 p-4">
              {domains.map((d) => {
                const inTrack = papers.filter((p) => p.domain === d);
                return (
                  <Link key={d} href={`/admin/papers?domain=${encodeURIComponent(d)}`} className="group block text-ink no-underline">
                    <div className="mb-1 flex justify-between text-sm">
                      <span className="font-medium group-hover:underline">{d}</span>
                      <span className="tabular-nums text-muted">{inTrack.length} paper{inTrack.length === 1 ? "" : "s"}</span>
                    </div>
                    <div className="flex h-3 gap-[2px]" style={{ width: `${(inTrack.length / maxTrack) * 100}%` }}>
                      {STAGES.map((s) => {
                        const n = inTrack.filter((p) => s.statuses.includes(p.status)).length;
                        return n ? (
                          <div key={s.key} title={`${d} · ${s.label}: ${n}`} className={`${s.color} h-full first:rounded-l last:rounded-r`} style={{ flexGrow: n, flexBasis: 0 }} />
                        ) : null;
                      })}
                    </div>
                  </Link>
                );
              })}
            </div>
            <details className="border-t border-line px-4 py-2 text-sm">
              <summary className="cursor-pointer text-xs text-muted">Show as table</summary>
              <table className="mt-2 w-full">
                <thead><tr><th className="th">Track</th>{STAGES.map((s) => <th key={s.key} className="th text-right">{s.label}</th>)}</tr></thead>
                <tbody className="divide-y divide-line">
                  {domains.map((d) => (
                    <tr key={d}>
                      <td className="td">{d}</td>
                      {STAGES.map((s) => (
                        <td key={s.key} className="td text-right tabular-nums">{papers.filter((p) => p.domain === d && s.statuses.includes(p.status)).length}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </details>
          </Section>
        </div>

        <div className="space-y-6 xl:col-span-2">
          <Section title="Final decisions">
            <div className="space-y-2.5 p-4">
              {decisionCounts.map(({ r, n }) => (
                <div key={r} className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1">
                  <DecisionBadge value={r} />
                  <span className="text-sm font-medium tabular-nums">{n}</span>
                  <div className="col-span-2 h-1.5 rounded-full bg-line">
                    <div className="h-full rounded-full bg-stage-3" style={{ width: `${(n / maxDecision) * 100}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </Section>
          <Section title="Latest reviews">
            <ul className="divide-y divide-line">
              {recent.map((r) => {
                const f = db.faculty.find((x) => x.id === r.facultyId);
                return (
                  <li key={r.id} className="px-4 py-2.5 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <Link href={`/admin/papers/${r.paperId}`} className="font-mono text-xs">{r.paperId}</Link>
                      <span className="text-xs text-muted">{fmtDate(r.submittedAt)}</span>
                    </div>
                    <div className="mt-0.5 flex items-center justify-between gap-2">
                      <span className="truncate">{f?.name}</span>
                      <DecisionBadge value={r.recommendation} />
                    </div>
                  </li>
                );
              })}
            </ul>
          </Section>
        </div>
      </div>

      <div className="mt-6">
        <Section title="Faculty progress" actions={<Link href="/admin/faculty" className="text-xs">Manage faculty →</Link>}>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="border-b border-line">
                <tr>
                  <th className="th">Faculty</th><th className="th">Tracks</th>
                  <th className="th text-right">Assigned</th><th className="th text-right">Done</th>
                  <th className="th text-right">Pending</th><th className="th text-right">Overdue</th><th className="th w-48">Progress</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {loads.map((l) => (
                  <tr key={l.faculty.id}>
                    <td className="td font-medium"><Link href={`/admin/faculty/${l.faculty.id}`}>{l.faculty.name}</Link></td>
                    <td className="td"><div className="flex flex-wrap gap-1">{l.faculty.domains.map((d) => <Badge key={d}>{d}</Badge>)}</div></td>
                    <td className="td text-right tabular-nums">{l.assigned}</td>
                    <td className="td text-right tabular-nums">{l.completed}</td>
                    <td className="td text-right tabular-nums">{l.pending}</td>
                    <td className="td text-right tabular-nums">{l.overdue ? <Badge t="bad">! {l.overdue}</Badge> : "0"}</td>
                    <td className="td"><Meter value={l.completed} max={l.assigned} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      </div>
    </>
  );
}
