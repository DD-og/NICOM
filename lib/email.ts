import { config } from "./config";
import { daysUntil, fmtDate } from "./format";
import type { Assignment, Faculty, Paper, Recommendation, Review } from "./types";

export interface EmailDraft {
  to: string;
  cc: string;
  subject: string;
  body: string;
}

const SUBJECT: Record<Recommendation, string> = {
  "Accept as Submitted with Minor Formatting changes if required": "Accepted",
  "Accept With Suggested Minor Revisions": "Accepted with Minor Revisions",
  "Accept After Major Revision": "Major Revision Required",
  Reject: "Decision on your submission",
};

function opening(decision: Recommendation, p: Paper): string {
  const conf = config.conferenceName;
  switch (decision) {
    case "Accept as Submitted with Minor Formatting changes if required":
      return `We are pleased to inform you that your paper "${p.title}" (Paper ID: ${p.id}) has been accepted as submitted for presentation at ${conf}, the National Conference hosted by the Institute of Management, Nirma University. Minor formatting changes may be requested if required.`;
    case "Accept With Suggested Minor Revisions":
      return `We are pleased to inform you that your paper "${p.title}" (Paper ID: ${p.id}) has been accepted for presentation at ${conf}, subject to the minor revisions suggested in the reviewers' comments below.`;
    case "Accept After Major Revision":
      return `Thank you for submitting your paper "${p.title}" (Paper ID: ${p.id}) to ${conf}. The review committee found merit in your work; it can be accepted after a major revision that addresses the reviewers' comments below.`;
    case "Reject":
      return `Thank you for submitting your paper "${p.title}" (Paper ID: ${p.id}) to ${conf}. After careful review, we regret to inform you that we are unable to accept your paper for presentation at this year's conference.`;
  }
}

function nextSteps(decision: Recommendation): string {
  switch (decision) {
    case "Accept as Submitted with Minor Formatting changes if required":
      return "Next steps:\n1. Complete your conference registration.\n2. Submit the camera-ready version of your paper, with any formatting changes requested.\n3. Prepare your presentation as per the session guidelines that will be shared shortly.";
    case "Accept With Suggested Minor Revisions":
      return "Next steps:\n1. Revise the paper addressing each reviewer comment.\n2. Submit the revised paper along with a brief response note.\n3. Complete your conference registration.";
    case "Accept After Major Revision":
      return "Next steps:\n1. Revise the paper thoroughly addressing all reviewer comments.\n2. Resubmit the revised paper with a point-by-point response to the reviewers.\nThe revised version will be reviewed again before final acceptance.";
    case "Reject":
      return "We hope the reviewers' feedback is useful in developing your work further, and we encourage you to participate in future editions of the conference.";
  }
}

export function buildDecisionEmail(paper: Paper, decision: Recommendation, reviews: Review[]): EmailDraft {
  const comments = reviews
    .filter((r) => r.commentsToAuthors?.trim())
    .map((r, i) => `Reviewer ${i + 1}:\n${r.commentsToAuthors.trim()}`)
    .join("\n\n");

  const body = [
    `Dear ${paper.authorName || "Author"},`,
    "Greetings from the Institute of Management, Nirma University!",
    opening(decision, paper),
    comments && `Reviewer comments:\n\n${comments}`,
    nextSteps(decision),
    config.conferenceEmail
      ? `For any queries, please write to us at ${config.conferenceEmail}.`
      : "For any queries, please reply to this email.",
    `Warm regards,\n${config.conferenceName} Organising Committee\nInstitute of Management, Nirma University, Ahmedabad`,
  ]
    .filter(Boolean)
    .join("\n\n");

  return {
    to: paper.email,
    cc: config.conferenceEmail,
    subject: `${config.conferenceName} | Paper ${paper.id} – ${SUBJECT[decision]}`,
    body,
  };
}

/** "7 days remaining", "due tomorrow", "due today", "overdue by 2 days". */
export function timeLeft(dueDate: string): string {
  const d = daysUntil(dueDate);
  if (d === null) return "no due date";
  if (d > 1) return `${d} days remaining`;
  if (d === 1) return "due tomorrow";
  if (d === 0) return "due today";
  return `overdue by ${-d} ${d === -1 ? "day" : "days"}`;
}

/**
 * Email telling a reviewer which papers are waiting for them and how long each has left.
 * A first email when any pending paper has not been notified yet, otherwise a reminder.
 * Double-blind: paper ID, title and track only, never the authors.
 */
export function buildReviewerEmail(
  f: Pick<Faculty, "name" | "email" | "username">,
  mine: { assignment: Assignment; paper?: Paper }[],
): EmailDraft & { kind: "new" | "reminder"; pending: number } {
  const pending = mine
    .filter((m) => m.assignment.status === "Pending")
    .sort((a, b) => a.assignment.dueDate.localeCompare(b.assignment.dueDate));
  const done = mine.length - pending.length;
  const kind = pending.some((m) => !m.assignment.notifiedAt) ? "new" : "reminder";
  const conf = config.conferenceName;
  const n = pending.length;
  const plural = n === 1 ? "" : "s";
  const next = pending[0]?.assignment.dueDate;

  const list = pending
    .map(({ assignment: a, paper: p }, i) =>
      [
        `${i + 1}. ${a.paperId}: ${p?.title ?? ""}`,
        p?.domain ? `   Track: ${p.domain}` : "",
        `   Review due: ${fmtDate(a.dueDate)} (${timeLeft(a.dueDate)})`,
      ]
        .filter(Boolean)
        .join("\n"),
    )
    .join("\n\n");

  const body = [
    `Dear ${f.name},`,
    `Greetings from the ${conf} Organising Committee, Institute of Management, Nirma University!`,
    kind === "new"
      ? `You have been assigned the following paper${plural} for double-blind review for ${conf}. Thank you for your support.`
      : `This is a gentle reminder that the following paper${plural} ${n === 1 ? "is" : "are"} still awaiting your review:`,
    list,
    done > 0 ? `You have already reviewed ${done} paper${done === 1 ? "" : "s"}. Thank you!` : "",
    [
      "To read the papers and submit your reviews:",
      `1. Open ${config.portalUrl}`,
      `2. Sign in with your login ID: ${f.username}`,
      "3. Each paper has a review form with the evaluation statements, your overall evaluation and comments. Your draft is saved as you type.",
    ].join("\n"),
    config.conferenceEmail
      ? `For any help, please write to ${config.conferenceEmail}.`
      : "For any help with your login or the papers, please reply to this email.",
    `Warm regards,\n${conf} Organising Committee\nInstitute of Management, Nirma University, Ahmedabad`,
  ]
    .filter(Boolean)
    .join("\n\n");

  const subject =
    kind === "new"
      ? `${conf} | ${n} paper${plural} assigned for your review (due ${fmtDate(next)})`
      : `${conf} | Reminder: ${n} paper review${plural} pending (next due ${fmtDate(next)})`;
  return { to: f.email, cc: config.conferenceEmail, subject, body, kind, pending: n };
}

/** Opens Gmail's compose window pre-filled, for whoever prefers it over copy-paste. */
export function gmailComposeUrl(e: EmailDraft): string {
  const q = new URLSearchParams({ view: "cm", fs: "1", to: e.to, su: e.subject, body: e.body });
  if (e.cc) q.set("cc", e.cc);
  return `https://mail.google.com/mail/?${q.toString()}`;
}

export function mailtoUrl(e: EmailDraft): string {
  const q = `${e.cc ? `cc=${encodeURIComponent(e.cc)}&` : ""}subject=${encodeURIComponent(e.subject)}&body=${encodeURIComponent(e.body)}`;
  return `mailto:${encodeURIComponent(e.to)}?${q}`;
}
