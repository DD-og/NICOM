import { config, DOMAINS } from "./config";
import { averageScore } from "./evaluation";
import type { WriteOp } from "./db/store";
import type { Assignment, DB, Decision, Faculty, Paper, PaperStatus, Recommendation, Review } from "./types";

export const today = () => new Date().toISOString().slice(0, 10);

export function isOverdue(a: Assignment) {
  return a.status === "Pending" && !!a.dueDate && a.dueDate < today();
}

export interface PaperView extends Paper {
  status: PaperStatus;
  assignments: Assignment[];
  reviews: Review[];
  decision?: Decision;
  suggestion: Recommendation | null;
  reviewersDisagree: boolean;
  avgScore: number | null;
  /** Fewer reviewers assigned than the policy requires (and no decision yet). */
  needsReviewers: number;
}

/** Reviewer consensus: the shared recommendation if all completed reviews agree, else null. */
export function consensus(reviews: Review[]): { suggestion: Recommendation | null; disagree: boolean } {
  if (!reviews.length) return { suggestion: null, disagree: false };
  const recs = new Set(reviews.map((r) => r.recommendation));
  return recs.size === 1 ? { suggestion: reviews[0].recommendation, disagree: false } : { suggestion: null, disagree: true };
}

/** All required reviews are in: at least `reviewersPerPaper` completed and none still pending. */
export function reviewsComplete(assignments: Assignment[], required = config.reviewersPerPaper) {
  const done = assignments.filter((a) => a.status === "Completed").length;
  return done >= required && done === assignments.length;
}

export function paperStatus(assignments: Assignment[], decision?: Decision, required = config.reviewersPerPaper): PaperStatus {
  if (decision) return decision.emailStatus === "Sent" ? "Author Notified" : "Decision Drafted";
  if (!assignments.length) return "Unassigned";
  return reviewsComplete(assignments, required) ? "Reviewed" : "Under Review";
}

export function paperViews(db: DB): PaperView[] {
  return db.papers.map((p) => {
    const assignments = db.assignments.filter((a) => a.paperId === p.id);
    const reviews = db.reviews.filter((r) => r.paperId === p.id);
    const decision = db.decisions.find((d) => d.paperId === p.id);
    const { suggestion, disagree } = consensus(reviews);
    const averages = reviews.map(averageScore).filter((n): n is number => n !== null);
    const avgScore = averages.length ? averages.reduce((s, n) => s + n, 0) / averages.length : null;
    return {
      ...p,
      status: paperStatus(assignments, decision),
      assignments,
      reviews,
      decision,
      suggestion,
      reviewersDisagree: disagree,
      avgScore,
      needsReviewers: decision ? 0 : Math.max(0, config.reviewersPerPaper - assignments.length),
    };
  });
}

export interface FacultyLoad {
  faculty: Faculty;
  assigned: number;
  completed: number;
  pending: number;
  overdue: number;
}

export function facultyLoads(db: DB): FacultyLoad[] {
  return db.faculty
    .filter((f) => f.role === "faculty")
    .map((f) => {
      const mine = db.assignments.filter((a) => a.facultyId === f.id);
      return {
        faculty: f,
        assigned: mine.length,
        completed: mine.filter((a) => a.status === "Completed").length,
        pending: mine.filter((a) => a.status === "Pending").length,
        overdue: mine.filter(isOverdue).length,
      };
    });
}

export interface Proposal {
  paperId: string;
  facultyId: string;
}

export interface DistributionPlan {
  proposals: Proposal[];
  shortfalls: { paperId: string; needed: number; reason: string }[];
}

/**
 * Domain-matched, load-balanced assignment. Every paper ends up with `perPaper` (default: the policy's 2)
 * reviewers where possible: candidates are active faculty whose domains include
 * the paper's track, who are not already on it, and (optionally) under their max load.
 * The least-loaded candidate wins; ties break on faculty id for stable results.
 */
export function planDistribution(db: DB, opts: { perPaper?: number; respectMaxLoad: boolean }): DistributionPlan {
  const perPaper = opts.perPaper ?? config.reviewersPerPaper;
  const reviewers = db.faculty.filter((f) => f.role === "faculty" && f.active);
  const load = new Map(reviewers.map((f) => [f.id, db.assignments.filter((a) => a.facultyId === f.id).length]));
  const decided = new Set(db.decisions.map((d) => d.paperId));
  const plan: DistributionPlan = { proposals: [], shortfalls: [] };

  const papers = [...db.papers].sort((a, b) => a.submittedAt.localeCompare(b.submittedAt));
  for (const p of papers) {
    if (decided.has(p.id)) continue;
    const onPaper = new Set(db.assignments.filter((a) => a.paperId === p.id).map((a) => a.facultyId));
    let needed = perPaper - onPaper.size;
    if (needed <= 0) continue;

    const inTrack = reviewers.filter((f) => f.domains.includes(p.domain) && !onPaper.has(f.id));
    const domainPool = inTrack.filter((f) => !isAuthor(f, p));
    const candidates = domainPool
      .filter((f) => !opts.respectMaxLoad || !f.maxLoad || (load.get(f.id) ?? 0) < f.maxLoad)
      .sort((a, b) => (load.get(a.id)! - load.get(b.id)!) || a.id.localeCompare(b.id));

    for (const f of candidates.slice(0, needed)) {
      plan.proposals.push({ paperId: p.id, facultyId: f.id });
      load.set(f.id, (load.get(f.id) ?? 0) + 1);
      needed--;
    }
    if (needed > 0) {
      plan.shortfalls.push({
        paperId: p.id,
        needed,
        reason:
          inTrack.length === 0
            ? `No active faculty mapped to "${p.domain}"`
            : domainPool.length === 0
              ? "The only matching faculty are authors of this paper"
              : "All matching faculty are at max load",
      });
    }
  }
  return plan;
}

const personKey = (name: string) =>
  name.toLowerCase().replace(/^(?:\s*(?:prof|dr|mr|mrs|ms|shri|smt)\b\.?)+/, "").replace(/[^a-z]/g, "");

/**
 * Conflict of interest: the faculty member is one of the paper's authors (same email, or same name ignoring
 * titles like Prof./Dr.). Such a reviewer is never assigned to the paper.
 */
export function isAuthor(f: Pick<Faculty, "name" | "email">, p: Pick<Paper, "email" | "authorEmails" | "authorName" | "coAuthors">): boolean {
  const emails = `${p.email} ${p.authorEmails ?? ""}`.toLowerCase().split(/[\s,;]+/).filter(Boolean);
  if (f.email && emails.includes(f.email.trim().toLowerCase())) return true;
  const me = personKey(f.name);
  return me.length > 0 && [p.authorName, ...(p.coAuthors ?? "").split(/[,;]/)].some((n) => personKey(n ?? "") === me);
}

/** Every track to show: the conference tracks plus any other track a paper or reviewer still uses. */
export function trackList(db: DB): string[] {
  return [...new Set([...DOMAINS, ...db.papers.map((p) => p.domain), ...db.faculty.flatMap((f) => f.domains)])].filter(Boolean);
}

export function countBy<T>(items: T[], key: (t: T) => string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const i of items) out[key(i)] = (out[key(i)] ?? 0) + 1;
  return out;
}

export function sortByDue(a: Assignment, b: Assignment) {
  return (a.dueDate || "9999").localeCompare(b.dueDate || "9999");
}

/**
 * Writes that keep an automatic (not yet sent) decision in line with reviewer consensus, given the data
 * *after* a change. A decision made by an admin, or one already emailed, is never touched.
 */
export function autoDecisionOps(db: DB, paperId: string, now = new Date().toISOString()): WriteOp[] {
  const assignments = db.assignments.filter((a) => a.paperId === paperId);
  const reviews = db.reviews.filter((r) => r.paperId === paperId);
  const existing = db.decisions.find((d) => d.paperId === paperId);
  const allDone = reviewsComplete(assignments); // both reviewers (policy) have submitted
  const { suggestion } = consensus(reviews);

  if (existing) {
    if (existing.decidedBy !== "AUTO" || existing.emailStatus === "Sent") return [];
    if (allDone && suggestion) {
      return existing.finalDecision === suggestion
        ? []
        : [{ op: "update", table: "decisions", key: paperId, patch: { finalDecision: suggestion } }];
    }
    return [{ op: "remove", table: "decisions", key: paperId }];
  }
  if (!allDone || !suggestion) return [];
  return [
    {
      op: "insert",
      table: "decisions",
      rows: [
        {
          paperId,
          finalDecision: suggestion,
          decidedBy: "AUTO",
          decidedAt: now,
          emailStatus: "Draft",
          emailSentAt: "",
          notes: "Auto-drafted from reviewer consensus",
        },
      ],
    },
  ];
}
