"use client";

import { setEmailStatus } from "@/app/actions";
import { gmailComposeUrl, mailtoUrl, type EmailDraft } from "@/lib/email";
import { CopyButton, SubmitButton } from "./client";

/**
 * Decision email shown in the portal. The committee member copies it and sends it from
 * whichever mailbox they use, then marks it as sent here.
 */
export function EmailDraftCard({
  draft,
  paperId,
  emailStatus,
  compact = false,
  actions,
  note,
}: {
  draft: EmailDraft;
  paperId?: string;
  emailStatus?: "Draft" | "Sent";
  compact?: boolean;
  /** Replaces the decision "Mark as sent" button, e.g. for reviewer emails. */
  actions?: React.ReactNode;
  note?: string;
}) {
  const full = `To: ${draft.to}\n${draft.cc ? `Cc: ${draft.cc}\n` : ""}Subject: ${draft.subject}\n\n${draft.body}`;

  return (
    <div className="space-y-3">
      <dl className="grid grid-cols-[4.5rem_1fr_auto] items-center gap-x-2 gap-y-1.5 text-sm">
        <dt className="text-muted">To</dt>
        <dd className="truncate font-medium">{draft.to}</dd>
        <dd><CopyButton text={draft.to} label="Copy" /></dd>
        {draft.cc && (
          <>
            <dt className="text-muted">Cc</dt>
            <dd className="truncate">{draft.cc}</dd>
            <dd />
          </>
        )}
        <dt className="text-muted">Subject</dt>
        <dd className="truncate font-medium">{draft.subject}</dd>
        <dd><CopyButton text={draft.subject} label="Copy" /></dd>
      </dl>
      <pre className={`overflow-auto whitespace-pre-wrap rounded-lg border border-line bg-surface p-3 font-sans text-sm leading-relaxed ${compact ? "max-h-56" : "max-h-[28rem]"}`}>
        {draft.body}
      </pre>
      <div className="flex flex-wrap items-center gap-2">
        <CopyButton text={draft.body} label="Copy email body" className="btn btn-primary btn-sm" />
        <CopyButton text={full} label="Copy everything" />
        <details className="relative">
          <summary className="btn btn-secondary btn-sm cursor-pointer list-none">Open in mail app ▾</summary>
          <div className="absolute z-10 mt-1 flex w-48 flex-col rounded-lg border border-line bg-panel p-1 shadow-lg">
            <a href={gmailComposeUrl(draft)} target="_blank" rel="noreferrer" className="rounded px-3 py-2 text-sm text-ink no-underline hover:bg-surface">Gmail (web) ↗</a>
            <a href={mailtoUrl(draft)} className="rounded px-3 py-2 text-sm text-ink no-underline hover:bg-surface">Default mail app</a>
          </div>
        </details>
        {actions && <div className="ml-auto">{actions}</div>}
        {emailStatus && paperId && (
          <form action={setEmailStatus} className="ml-auto">
            <input type="hidden" name="paperId" value={paperId} />
            <input type="hidden" name="status" value={emailStatus === "Sent" ? "Draft" : "Sent"} />
            <SubmitButton className={emailStatus === "Sent" ? "btn btn-secondary btn-sm" : "btn btn-primary btn-sm"}>
              {emailStatus === "Sent" ? "↺ Mark as not sent" : "✓ Mark as sent"}
            </SubmitButton>
          </form>
        )}
      </div>
      {!compact && (
        <p className="text-xs text-muted">
          {note ?? "Copy the email and send it to the author from your own mailbox, then click “Mark as sent” so everyone can see it has gone out."}
        </p>
      )}
    </div>
  );
}
