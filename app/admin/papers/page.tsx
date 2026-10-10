import Link from "next/link";
import { Badge, DecisionBadge, StatusBadge } from "@/app/components/badges";
import { Empty, PageHeader } from "@/app/components/ui";
import { DOMAINS } from "@/lib/config";
import { store } from "@/lib/db";
import { fmtDate } from "@/lib/format";
import { paperViews } from "@/lib/logic";
import type { PaperStatus } from "@/lib/types";

const STATUSES: PaperStatus[] = ["Unassigned", "Under Review", "Reviewed", "Decision Drafted", "Author Notified"];

export default async function PapersPage({ searchParams }: { searchParams: Promise<{ q?: string; domain?: string; status?: string }> }) {
  const { q = "", domain = "", status = "" } = await searchParams;
  const db = await store().snapshot();
  const all = paperViews(db);
  const needle = q.toLowerCase();
  const papers = all.filter(
    (p) =>
      (!domain || p.domain === domain) &&
      (!status || p.status === status) &&
      (!needle || [p.id, p.title, p.authorName, p.email, p.keywords, p.affiliation].some((v) => v?.toLowerCase().includes(needle))),
  );
  const domains = [...new Set([...DOMAINS, ...db.papers.map((p) => p.domain)])];
  const name = (id: string) => db.faculty.find((f) => f.id === id)?.name ?? id;

  return (
    <>
      <PageHeader title="Papers" subtitle={`${papers.length} of ${all.length} submissions`} actions={<a href="/api/export" className="btn btn-secondary">⤓ Export CSV</a>} />

      <form className="card mb-4 flex flex-wrap items-end gap-3 p-3">
        <div className="min-w-56 flex-1">
          <label className="label text-xs" htmlFor="q">Search</label>
          <input id="q" name="q" defaultValue={q} className="input" placeholder="ID, title, author, email, keyword…" />
        </div>
        <div>
          <label className="label text-xs" htmlFor="domain">Track</label>
          <select id="domain" name="domain" defaultValue={domain} className="input">
            <option value="">All tracks</option>
            {domains.map((d) => <option key={d}>{d}</option>)}
          </select>
        </div>
        <div>
          <label className="label text-xs" htmlFor="status">Status</label>
          <select id="status" name="status" defaultValue={status} className="input">
            <option value="">All statuses</option>
            {STATUSES.map((s) => <option key={s}>{s}</option>)}
          </select>
        </div>
        <button className="btn btn-primary">Filter</button>
        {(q || domain || status) && <Link href="/admin/papers" className="btn btn-secondary">Clear</Link>}
      </form>

      {papers.length === 0 ? (
        <Empty>No papers match these filters.</Empty>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full">
            <thead className="border-b border-line">
              <tr>
                <th className="th">Paper</th><th className="th">Track</th><th className="th">Reviewers</th>
                <th className="th">Status</th><th className="th">Decision</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {papers.map((p) => (
                <tr key={p.id} className="hover:bg-surface">
                  <td className="td max-w-md">
                    <Link href={`/admin/papers/${p.id}`} className="font-medium text-ink no-underline hover:underline">{p.title}</Link>
                    <div className="mt-0.5 text-xs text-muted">
                      <span className="font-mono">{p.id}</span> · {p.authorName} · {p.affiliation} · {fmtDate(p.submittedAt)}
                    </div>
                  </td>
                  <td className="td"><Badge t="brand">{p.domain}</Badge></td>
                  <td className="td">
                    {p.assignments.length === 0 ? (
                      <span className="text-xs text-muted">—</span>
                    ) : (
                      <ul className="space-y-0.5 text-xs">
                        {p.assignments.map((a) => (
                          <li key={a.id} className="whitespace-nowrap">
                            <span className={a.status === "Completed" ? "text-good" : "text-muted"} aria-hidden>{a.status === "Completed" ? "✓" : "◔"}</span>{" "}
                            {name(a.facultyId)} <span className="sr-only">({a.status})</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </td>
                  <td className="td"><StatusBadge status={p.status} /></td>
                  <td className="td">
                    {p.decision ? <DecisionBadge value={p.decision.finalDecision} /> : p.reviewersDisagree ? <Badge t="warn">⚠ Reviewers disagree</Badge> : <span className="text-xs text-muted">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
