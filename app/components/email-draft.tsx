"use client";

import { useActionState } from "react";
import { createGmailDraftAction, setEmailStatus } from "@/app/actions";
import { gmailComposeUrl, mailtoUrl, type EmailDraft } from "@/lib/email";
import { CopyButton, SubmitButton } from "./client";

export function EmailDraftCard({
  draft,
  paperId,
  emailStatus,
  gmailEnabled,
  compact = false,
}: {
  draft: EmailDraft;
  paperId: string;
  emailStatus?: "Draft" | "Sent";
  gmailEnabled: boolean;
  compact?: boolean;
}) {
  const [state, action] = useActionState(createGmailDraftAction, undefined);
  const full = `To: ${draft.to}\nCc: ${draft.cc}\nSubject: ${draft.subject}\n\n${draft.body}`;

  return (
    <div className="space-y-3">
      <dl className="grid grid-cols-[4.5rem_1fr_auto] items-center gap-x-2 gap-y-1.5 text-sm">
        <dt className="text-muted">To</dt>
        <dd className="truncate font-medium">{draft.to}</dd>
        <dd><CopyButton text={draft.to} label="Copy" /></dd>
        <dt className="text-muted">Cc</dt>
        <dd className="truncate">{draft.cc}</dd>
        <dd />
        <dt className="text-muted">Subject</dt>
        <dd className="truncate font-medium">{draft.subject}</dd>
        <dd><CopyButton text={draft.subject} label="Copy" /></dd>
      </dl>
      <div className="relative">
        <pre className={`overflow-auto whitespace-pre-wrap rounded-lg border border-line bg-surface p-3 font-sans text-sm leading-relaxed ${compact ? "max-h-56" : "max-h-[28rem]"}`}>
          {draft.body}
        </pre>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <a href={gmailComposeUrl(draft)} target="_blank" rel="noreferrer" className="btn btn-primary btn-sm">
          Open in Gmail ↗
        </a>
        <CopyButton text={draft.body} label="Copy body" />
        <CopyButton text={full} label="Copy everything" />
        <a href={mailtoUrl(draft)} className="btn btn-secondary btn-sm">Default mail app</a>
        {gmailEnabled && (
          <form action={action}>
            <input type="hidden" name="paperId" value={paperId} />
            <SubmitButton className="btn btn-secondary btn-sm" pendingText="Creating…">Save to Gmail Drafts</SubmitButton>
          </form>
        )}
        {emailStatus && (
          <form action={setEmailStatus} className="ml-auto">
            <input type="hidden" name="paperId" value={paperId} />
            <input type="hidden" name="status" value={emailStatus === "Sent" ? "Draft" : "Sent"} />
            <SubmitButton className={emailStatus === "Sent" ? "btn btn-secondary btn-sm" : "btn btn-primary btn-sm"}>
              {emailStatus === "Sent" ? "↺ Mark as not sent" : "✓ Mark as sent"}
            </SubmitButton>
          </form>
        )}
      </div>
      {state?.error && <p className="text-sm text-bad">{state.error}</p>}
      {state?.message && <p className="text-sm text-good">{state.message}</p>}
      {!compact && (
        <p className="text-xs text-muted">
          “Open in Gmail” opens a pre-filled compose window in your signed-in Gmail; Gmail keeps it in Drafts until you
          send it. After sending, click “Mark as sent” so the dashboard stays accurate.
        </p>
      )}
    </div>
  );
}
