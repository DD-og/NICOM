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
}

/** Reviewer consensus: the shared recommendation if all completed reviews agree, else null. */
export function consensus(reviews: Review[]): { suggestion: Recommendation | null; disagree: boolean } {
  if (!reviews.length) return { suggestion: null, disagree: false };
  const recs = new Set(reviews.map((r) => r.recommendation));
  return recs.size === 1 ? { suggestion: reviews[0].recommendation, disagree: false } : { suggestion: null, disagree: true };
}

export function paperStatus(assignments: Assignment[], decision?: Decision): PaperStatus {
  if (decision) return decision.emailStatus === "Sent" ? "Author Notified" : "Decision Drafted";
  if (!assignments.length) return "Unassigned";
  return assignments.every((a) => a.status === "Completed") ? "Reviewed" : "Under Review";
}

export function paperViews(db: DB): PaperView[] {
  return db.papers.map((p) => {
    const assignments = db.assignments.filter((a) => a.paperId === p.id);
    const reviews = db.reviews.filter((r) => r.paperId === p.id);
    const decision = db.decisions.find((d) => d.paperId === p.id);
    const { suggestion, disagree } = consensus(reviews);
    const avgScore = reviews.length ? reviews.reduce((s, r) => s + Number(r.overall || 0), 0) / reviews.length : null;
    return {
      ...p,
      status: paperStatus(assignments, decision),
      assignments,
      reviews,
      decision,
      suggestion,
      reviewersDisagree: disagree,
      avgScore,
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
 * Domain-matched, load-balanced assignment. Every paper ends up with `perPaper`
 * reviewers where possible: candidates are active faculty whose domains include
 * the paper's track, who are not already on it, and (optionally) under their max load.
 * The least-loaded candidate wins; ties break on faculty id for stable results.
 */
export function planDistribution(db: DB, opts: { perPaper: number; respectMaxLoad: boolean }): DistributionPlan {
  const reviewers = db.faculty.filter((f) => f.role === "faculty" && f.active);
  const load = new Map(reviewers.map((f) => [f.id, db.assignments.filter((a) => a.facultyId === f.id).length]));
  const decided = new Set(db.decisions.map((d) => d.paperId));
  const plan: DistributionPlan = { proposals: [], shortfalls: [] };

  const papers = [...db.papers].sort((a, b) => a.submittedAt.localeCompare(b.submittedAt));
  for (const p of papers) {
    if (decided.has(p.id)) continue;
    const onPaper = new Set(db.assignments.filter((a) => a.paperId === p.id).map((a) => a.facultyId));
    let needed = opts.perPaper - onPaper.size;
    if (needed <= 0) continue;

    const domainPool = reviewers.filter((f) => f.domains.includes(p.domain) && !onPaper.has(f.id));
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
        reason: domainPool.length === 0 ? `No active faculty mapped to "${p.domain}"` : "All matching faculty are at max load",
      });
    }
  }
  return plan;
}

export function countBy<T>(items: T[], key: (t: T) => string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const i of items) out[key(i)] = (out[key(i)] ?? 0) + 1;
  return out;
}

export function sortByDue(a: Assignment, b: Assignment) {
  return (a.dueDate || "9999").localeCompare(b.dueDate || "9999");
}
