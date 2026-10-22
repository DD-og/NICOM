import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, DecisionBadge, DueBadge } from "@/app/components/badges";
import { CopyButton } from "@/app/components/client";
import { Empty, PageHeader, Section, Stat } from "@/app/components/ui";
import { config } from "@/lib/config";
import { store } from "@/lib/db";
import { buildReviewerEmail, gmailComposeUrl } from "@/lib/email";
import { fmtDate } from "@/lib/format";
import { isOverdue, sortByDue, trackList } from "@/lib/logic";
import { FacultyForm } from "../faculty-form";

export default async function FacultyDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = await store().snapshot();
  const f = db.faculty.find((x) => x.id === id);
  if (!f) notFound();
  const mine = db.assignments.filter((a) => a.facultyId === f.id).sort(sortByDue);
  const pending = mine.filter((a) => a.status === "Pending");
  const domains = trackList(db);
  const paper = (pid: string) => db.papers.find((p) => p.id === pid);

  const reminder = pending.length ? buildReviewerEmail(f, mine.map((assignment) => ({ assignment, paper: paper(assignment.paperId) }))) : null;

  return (
    <>
      <Link href="/admin/faculty" className="text-sm no-underline hover:underline">← All faculty</Link>
      <div className="mt-3">
        <PageHeader
          title={f.name}
          subtitle={
            <span className="inline-flex flex-wrap items-center gap-1.5">
              {f.email} · {f.role === "master" ? "Master admin" : f.domains.map((d) => <Badge key={d} t="brand">{d}</Badge>)}
              {!f.active && <Badge>Inactive</Badge>}
            </span>
          }
        />
      </div>

      {f.role === "faculty" && (
        <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat label="Assigned" value={`${mine.length}/${f.maxLoad || "∞"}`} />
          <Stat label="Completed" value={mine.length - pending.length} />
          <Stat label="Pending" value={pending.length} />
          <Stat label="Overdue" value={mine.filter(isOverdue).length} />
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          {f.role === "faculty" && (
            <Section title="Assigned papers">
              {mine.length === 0 ? (
                <div className="p-4"><Empty>No papers assigned yet.</Empty></div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="border-b border-line">
                      <tr><th className="th">Paper</th><th className="th">Due</th><th className="th">Status</th><th className="th">Recommendation</th></tr>
                    </thead>
                    <tbody className="divide-y divide-line">
                      {mine.map((a) => {
                        const r = db.reviews.find((x) => x.assignmentId === a.id);
                        return (
                          <tr key={a.id}>
                            <td className="td">
                              <div className="font-mono text-xs text-muted">{a.paperId}</div>
                              <Link href={`/admin/papers/${a.paperId}`} className="text-ink">{paper(a.paperId)?.title}</Link>
                            </td>
                            <td className="td whitespace-nowrap text-sm">{fmtDate(a.dueDate)}</td>
                            <td className="td"><DueBadge dueDate={a.dueDate} status={a.status} /></td>
                            <td className="td">{r ? <DecisionBadge value={r.recommendation} /> : <span className="text-xs text-muted">—</span>}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </Section>
          )}

          {reminder && (
            <Section title={reminder?.kind === "new" ? "Assignment email" : "Reminder email"}>
              <div className="space-y-3 p-4">
                <pre className="max-h-56 overflow-auto whitespace-pre-wrap rounded-lg border border-line bg-surface p-3 font-sans text-sm">{reminder.body}</pre>
                <div className="flex gap-2">
                  <a href={gmailComposeUrl(reminder)} target="_blank" rel="noreferrer" className="btn btn-primary btn-sm">Open in Gmail ↗</a>
                  <CopyButton text={reminder.body} label="Copy body" />
                </div>
              </div>
            </Section>
          )}
        </div>

        <Section title="Edit account">
          <div className="p-4">
            <FacultyForm faculty={f} domains={domains} allowedDomain={config.allowedDomain} />
          </div>
        </Section>
      </div>
    </>
  );
}
