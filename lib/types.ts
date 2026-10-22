import type { CriterionKey, NominationKey, YesNo } from "./evaluation";

export type Role = "master" | "faculty";

/** Overall evaluation for publication in the book, worded as on the committee's form. Also the final decisions. */
export const RECOMMENDATIONS = [
  "Accept as Submitted with Minor Formatting changes if required",
  "Accept With Suggested Minor Revisions",
  "Accept After Major Revision",
  "Reject",
] as const;
export type Recommendation = (typeof RECOMMENDATIONS)[number];

/** Short names for badges and charts; the full wording is shown on hover and stored in the Sheet. */
export const SHORT_LABEL: Record<Recommendation, string> = {
  "Accept as Submitted with Minor Formatting changes if required": "Accept as submitted",
  "Accept With Suggested Minor Revisions": "Accept, minor revisions",
  "Accept After Major Revision": "Accept after major revision",
  Reject: "Reject",
};

/** Wording used before the committee's evaluation matrix, still understood when read back. */
export const LEGACY_RECOMMENDATION: Record<string, Recommendation> = {
  Accept: "Accept as Submitted with Minor Formatting changes if required",
  "Accept with Minor Revisions": "Accept With Suggested Minor Revisions",
  "Major Revisions": "Accept After Major Revision",
  "Recommended for Journal Publication": "Accept as Submitted with Minor Formatting changes if required",
};

export interface Paper {
  id: string;
  submittedAt: string;
  title: string;
  domain: string;
  keywords: string;
  abstract: string;
  authorName: string;
  email: string;
  phone: string;
  affiliation: string;
  coAuthors: string;
  driveLink: string;
  /** Every author's email, for conflict-of-interest checks (optional column). */
  authorEmails?: string;
}

export interface Faculty {
  id: string;
  /** Login ID, e.g. "admin" or "meera.iyer". */
  username: string;
  name: string;
  email: string;
  role: Role;
  domains: string[];
  maxLoad: number;
  active: boolean;
  /** scrypt hash; empty = cannot sign in with a password. */
  passwordHash: string;
}

export type AssignmentStatus = "Pending" | "Completed";

export interface Assignment {
  id: string;
  paperId: string;
  facultyId: string;
  assignedAt: string;
  dueDate: string;
  status: AssignmentStatus;
  assignedBy: string;
}

export type Review = {
  id: string;
  assignmentId: string;
  paperId: string;
  facultyId: string;
  recommendation: Recommendation;
  commentsToAuthors: string;
  confidentialComments: string;
  submittedAt: string;
} & Record<CriterionKey, number> &
  Record<NominationKey, YesNo>;

export type EmailStatus = "Draft" | "Sent";

export interface Decision {
  paperId: string;
  finalDecision: Recommendation;
  decidedBy: string; // faculty id of the master admin, or "AUTO"
  decidedAt: string;
  emailStatus: EmailStatus;
  emailSentAt: string;
  notes: string;
}

export interface DB {
  papers: Paper[];
  faculty: Faculty[];
  assignments: Assignment[];
  reviews: Review[];
  decisions: Decision[];
}

export type PaperStatus = "Unassigned" | "Under Review" | "Reviewed" | "Decision Drafted" | "Author Notified";

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  role: Role;
}
