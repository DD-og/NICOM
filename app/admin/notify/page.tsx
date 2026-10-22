import Link from "next/link";
import { markNotified } from "@/app/actions";
import { Badge } from "@/app/components/badges";
import { SubmitButton } from "@/app/components/client";
import { EmailDraftCard } from "@/app/components/email-draft";
import { Empty, PageHeader } from "@/app/components/ui";
import { store } from "@/lib/db";
import { buildReviewerEmail, timeLeft } from "@/lib/email";
import { fmtDate } from "@/lib/format";
import { isOverdue } from "@/lib/logic";

export default async function NotifyPage({ searchParams }: { searchParams: Promise<{ show?: string }> }) {
  const { show } = await searchParams;
  const db = await store().snapshot();

  const rows = db.faculty
    .filter((f) => f.role === "faculty")
    .flatMap((f) => {
      const mine = db.assignments
        .filter((a) => a.facultyId === f.id)
        .map((assignment) => ({ assignment, paper: db.papers.find((p) => p.id === assignment.paperId) }));
      const pending = mine.filter((m) => m.assignment.status === "Pending").map((m) => m.assignment);
      if (!pending.length) return [];
      const draft = buildReviewerEmail(f, mine);
      const notified = pending.map((a) => a.notifiedAt ?? "").filter(Boolean).sort().at(-1) ?? "";
      const nextDue = pending.map((a) => a.dueDate).sort()[0] ?? "";
      return [{ f, draft, notified, nextDue, overdue: pending.filter(isOverdue).length }];
    })
    // Not yet notified first, then the most urgent deadline.
    .sort((a, b) => Number(a.draft.kind !== "new") - Number(b.draft.kind !== "new") || a.nextDue.localeCompare(b.nextDue) || a.f.name.localeCompare(b.f.name));
  const todo = rows.filter((r) => r.draft.kind === "new");
  const showAll = show === "all";
  const list = showAll ? rows : todo;

  return (
    <>
      <PageHeader
        title="Notify reviewers"
        subtitle="Email each reviewer the papers assigned to them and how many days are left for each. Send it from your own mailbox, then mark it here."
      />

      <nav className="mb-4 flex flex-wrap gap-2 text-sm" aria-label="Filter">
        <Link href="/admin/notify" className={`btn btn-sm ${showAll ? "btn-secondary" : "btn-primary"}`}>Not yet notified ({todo.length})</Link>
        <Link href="/admin/notify?show=all" className={`btn btn-sm ${showAll ? "btn-primary" : "btn-secondary"}`}>All with pending reviews ({rows.length})</Link>
      </nav>

      {list.length === 0 ? (
        <Empty>
          {rows.length === 0 ? (
            <>No reviews are pending. Papers appear here after you <Link href="/admin/distribute">distribute</Link> them.</>
          ) : (
            <>Everyone with pending reviews has been notified. Open “All with pending reviews” to send reminders.</>
          )}
        </Empty>
      ) : (
        <div className="space-y-3">
          {list.map(({ f, draft, notified, nextDue, overdue }) => (
            <details key={f.id} className="card group">
              <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-3">
                <span className="inline-block text-muted transition group-open:rotate-90" aria-hidden>▸</span>
                <span className="min-w-0 flex-1">
                  <span className="font-medium">{f.name}</span>
                  <span className="block truncate text-xs text-muted">{f.email}</span>
                </span>
                <Badge>{draft.pending} {draft.pending === 1 ? "paper" : "papers"} pending</Badge>
                <Badge t={overdue ? "bad" : "info"}>Next due {fmtDate(nextDue)} · {timeLeft(nextDue)}</Badge>
                {draft.kind === "new" ? (
                  <Badge t="warn">{notified ? "New papers not yet notified" : "Not yet notified"}</Badge>
                ) : (
                  <Badge t="good">✓ Notified {fmtDate(notified)}</Badge>
                )}
              </summary>
              <div className="border-t border-line p-4">
                <EmailDraftCard
                  draft={draft}
                  compact
                  actions={
                    <div className="flex flex-wrap gap-2">
                      {notified && (
                        <form action={markNotified}>
                          <input type="hidden" name="facultyId" value={f.id} />
                          <input type="hidden" name="undo" value="1" />
                          <SubmitButton className="btn btn-secondary btn-sm">↺ Undo</SubmitButton>
                        </form>
                      )}
                      <form action={markNotified}>
                        <input type="hidden" name="facultyId" value={f.id} />
                        <SubmitButton className="btn btn-primary btn-sm">
                          {draft.kind === "new" ? "✓ Mark as notified" : "✓ Mark reminder as sent"}
                        </SubmitButton>
                      </form>
                    </div>
                  }
                />
              </div>
            </details>
          ))}
        </div>
      )}
      <p className="mt-4 text-xs text-muted">
        Emails list paper IDs, titles and tracks only, never the authors. Days remaining are counted from today, so open this page on the day you send.
      </p>
    </>
  );
}
