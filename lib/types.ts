export type Role = "master" | "faculty";

export const RECOMMENDATIONS = [
  "Accept",
  "Accept with Minor Revisions",
  "Major Revisions",
  "Reject",
  "Recommended for Journal Publication",
] as const;
export type Recommendation = (typeof RECOMMENDATIONS)[number];

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

export interface Review {
  id: string;
  assignmentId: string;
  paperId: string;
  facultyId: string;
  originality: number;
  methodology: number;
  relevance: number;
  clarity: number;
  overall: number;
  recommendation: Recommendation;
  commentsToAuthors: string;
  confidentialComments: string;
  submittedAt: string;
}

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
