import { config } from "./config";
import type { Paper, Recommendation, Review } from "./types";

export interface EmailDraft {
  to: string;
  cc: string;
  subject: string;
  body: string;
}

const SUBJECT: Record<Recommendation, string> = {
  Accept: "Accepted",
  "Accept with Minor Revisions": "Accepted with Minor Revisions",
  "Major Revisions": "Major Revisions Required",
  Reject: "Decision on your submission",
  "Recommended for Journal Publication": "Accepted & Recommended for Journal Publication",
};

function opening(decision: Recommendation, p: Paper): string {
  const conf = config.conferenceName;
  switch (decision) {
    case "Accept":
      return `We are pleased to inform you that your paper "${p.title}" (Paper ID: ${p.id}) has been accepted for presentation at ${conf}, the National Conference hosted by the Institute of Management, Nirma University.`;
    case "Accept with Minor Revisions":
      return `We are pleased to inform you that your paper "${p.title}" (Paper ID: ${p.id}) has been accepted for presentation at ${conf}, subject to minor revisions based on the reviewers' comments below.`;
    case "Major Revisions":
      return `Thank you for submitting your paper "${p.title}" (Paper ID: ${p.id}) to ${conf}. The review committee found merit in your work; however, it requires major revisions before it can be considered for presentation.`;
    case "Reject":
      return `Thank you for submitting your paper "${p.title}" (Paper ID: ${p.id}) to ${conf}. After careful review, we regret to inform you that we are unable to accept your paper for presentation at this year's conference.`;
    case "Recommended for Journal Publication":
      return `Congratulations! Your paper "${p.title}" (Paper ID: ${p.id}) has been accepted for presentation at ${conf}. In addition, the reviewers have recommended it for consideration for publication in the ${config.journalName}.`;
  }
}

function nextSteps(decision: Recommendation): string {
  switch (decision) {
    case "Accept":
      return "Next steps:\n1. Complete your conference registration.\n2. Submit the camera-ready version of your paper.\n3. Prepare your presentation as per the session guidelines that will be shared shortly.";
    case "Accept with Minor Revisions":
      return "Next steps:\n1. Revise the paper addressing each reviewer comment.\n2. Submit the revised paper along with a brief response note.\n3. Complete your conference registration.";
    case "Major Revisions":
      return "Next steps:\n1. Revise the paper thoroughly addressing all reviewer comments.\n2. Resubmit the revised paper with a point-by-point response to the reviewers.\nThe revised version will undergo another round of review.";
    case "Reject":
      return "We hope the reviewers' feedback is useful in developing your work further, and we encourage you to participate in future editions of the conference.";
    case "Recommended for Journal Publication":
      return "Next steps:\n1. Complete your conference registration and submit the camera-ready version.\n2. The journal's editorial team will contact you regarding the publication process and formatting requirements.";
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
