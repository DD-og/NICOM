"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { findByLogin } from "@/lib/accounts";
import { endSession, requireUser, startSession } from "@/lib/auth";
import { config, googleSignInEnabled, isAllowedEmail } from "@/lib/config";
import { newId, store } from "@/lib/db";
import { applyOps } from "@/lib/db/ops";
import type { WriteOp } from "@/lib/db/store";
import { autoDecisionOps, isAuthor, planDistribution } from "@/lib/logic";
import { hashPassword, verifyPassword } from "@/lib/password";
import { CRITERIA, NOMINATIONS, type CriterionKey, type NominationKey, type YesNo } from "@/lib/evaluation";
import { RECOMMENDATIONS, type Assignment, type DB, type Faculty, type Recommendation, type Review, type Role } from "@/lib/types";

export type FormValues = Record<string, string | string[]>;
export type ActionState = { ok?: boolean; error?: string; message?: string; values?: FormValues } | undefined;

/** React resets a form after its action runs; failed submissions echo the input back so nothing typed is lost. */
function formValues(fd: FormData): FormValues {
  const out: FormValues = {};
  for (const key of new Set(fd.keys())) {
    if (key.startsWith("$ACTION") || key === "password") continue; // never send passwords back
    const all = fd.getAll(key).map(String);
    out[key] = all.length > 1 || key === "domains" ? all : all[0];
  }
  return out;
}

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const addDays = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
const refresh = () => revalidatePath("/", "layout");

// ---------------------------------------------------------------- auth

/** Sign in with a login ID (or email) and password. */
export async function login(_: ActionState, fd: FormData): Promise<ActionState> {
  const id = str(fd, "username");
  const password = String(fd.get("password") ?? "");
  const db = await store().snapshot();
  const row = findByLogin(db, id);
  // Same message for unknown user and wrong password, so IDs can't be probed.
  if (!row || !row.active || !verifyPassword(password, row.passwordHash)) {
    return { error: "Incorrect ID or password.", values: { username: id } };
  }
  await startSession({ id: row.id, name: row.name, email: row.email, role: row.role });
  redirect(row.role === "master" ? "/admin" : "/faculty");
}

export async function logout() {
  await endSession();
  redirect("/login");
}

// ---------------------------------------------------------------- faculty: reviews

/**
 * Save an action's changes in one round trip, together with any automatic-decision update they imply.
 * `db` is the fresh snapshot the action validated against.
 */
async function commit(db: DB, ops: WriteOp[], paperId?: string) {
  if (paperId) ops = [...ops, ...autoDecisionOps(applyOps(structuredClone(db), ops), paperId)];
  await store().batch(ops);
}

export async function submitReview(_: ActionState, fd: FormData): Promise<ActionState> {
  const db = await store().snapshot({ fresh: true });
  const user = await requireUser("faculty");
  const fail = (error: string): ActionState => ({ error, values: formValues(fd) });
  const assignmentId = str(fd, "assignmentId");
  const assignment = db.assignments.find((a) => a.id === assignmentId);
  if (!assignment || assignment.facultyId !== user.id) return fail("This paper is not assigned to you.");
  const decision = db.decisions.find((d) => d.paperId === assignment.paperId);
  if (decision?.emailStatus === "Sent") return fail("The author has already been notified; the review is locked.");

  const scores: Partial<Record<CriterionKey, number>> = {};
  for (const c of CRITERIA) {
    const n = Number(fd.get(c.key));
    if (!Number.isInteger(n) || n < 1 || n > 5) return fail("Please rate every statement from 1 to 5.");
    scores[c.key] = n;
  }
  const recommendation = str(fd, "recommendation") as Recommendation;
  if (!RECOMMENDATIONS.includes(recommendation)) return fail("Please choose your overall evaluation of the paper.");
  const nominations: Partial<Record<NominationKey, YesNo>> = {};
  for (const q of NOMINATIONS) {
    const v = str(fd, q.key);
    if (v !== "Yes" && v !== "No") return fail(`Please answer: ${q.question}`);
    nominations[q.key] = v;
  }
  const commentsToAuthors = str(fd, "commentsToAuthors");
  if (commentsToAuthors.length < 30) return fail("Comments to authors should be at least 30 characters.");

  const fields = {
    ...(scores as Record<CriterionKey, number>),
    ...(nominations as Record<NominationKey, YesNo>),
    recommendation,
    commentsToAuthors,
    confidentialComments: str(fd, "confidentialComments"),
    submittedAt: new Date().toISOString(),
  };
  const existing = db.reviews.find((r) => r.assignmentId === assignmentId);
  const ops: WriteOp[] = [];
  if (existing) {
    ops.push({ op: "update", table: "reviews", key: existing.id, patch: fields });
  } else {
    const review: Review = {
      id: newId("REV"),
      assignmentId,
      paperId: assignment.paperId,
      facultyId: user.id,
      ...fields,
    };
    ops.push({ op: "insert", table: "reviews", rows: [review as unknown as Record<string, unknown>] });
  }
  if (assignment.status !== "Completed") ops.push({ op: "update", table: "assignments", key: assignmentId, patch: { status: "Completed" } });
  await commit(db, ops, assignment.paperId);
  refresh();
  redirect(`/faculty/review/${assignmentId}?submitted=1`);
}

// ---------------------------------------------------------------- master: assignments

export async function assignReviewer(fd: FormData) {
  const db = await store().snapshot({ fresh: true });
  const user = await requireUser("master");
  const paperId = str(fd, "paperId");
  const facultyId = str(fd, "facultyId");
  const dueDate = str(fd, "dueDate") || addDays(config.reviewDays);
  const paper = db.papers.find((p) => p.id === paperId);
  const reviewer = db.faculty.find((f) => f.id === facultyId && f.role === "faculty");
  if (!paper) throw new Error("Unknown paper");
  if (!reviewer) throw new Error("Unknown faculty");
  // Faculty review only in the tracks listed for them.
  if (!reviewer.domains.includes(paper.domain)) throw new Error(`${reviewer.name} does not review "${paper.domain}" papers`);
  if (isAuthor(reviewer, paper)) throw new Error(`${reviewer.name} is an author of ${paper.id} and cannot review it`);
  if (db.assignments.some((a) => a.paperId === paperId && a.facultyId === facultyId)) return;
  const a: Assignment = {
    id: newId("ASG"),
    paperId,
    facultyId,
    assignedAt: new Date().toISOString(),
    dueDate,
    status: "Pending",
    assignedBy: user.id,
  };
  await commit(db, [{ op: "insert", table: "assignments", rows: [a as unknown as Record<string, unknown>] }], paperId);
  refresh();
}

export async function removeAssignment(fd: FormData) {
  const db = await store().snapshot({ fresh: true });
  await requireUser("master");
  const id = str(fd, "assignmentId");
  const a = db.assignments.find((x) => x.id === id);
  if (!a) return;
  const review = db.reviews.find((r) => r.assignmentId === id);
  const ops: WriteOp[] = [];
  if (review) ops.push({ op: "remove", table: "reviews", key: review.id });
  ops.push({ op: "remove", table: "assignments", key: id });
  await commit(db, ops, a.paperId);
  refresh();
}

export async function updateDueDate(fd: FormData) {
  await requireUser("master");
  await store().update("assignments", str(fd, "assignmentId"), { dueDate: str(fd, "dueDate") });
  refresh();
}

export async function runDistribution(fd: FormData) {
  const db = await store().snapshot({ fresh: true });
  const user = await requireUser("master");
  const perPaper = config.reviewersPerPaper;
  const dueDays = Math.max(1, Number(fd.get("dueDays")) || config.reviewDays);
  const respectMaxLoad = fd.get("respectMaxLoad") === "on";
  const plan = planDistribution(db, { perPaper, respectMaxLoad });
  const now = new Date().toISOString();
  const dueDate = addDays(dueDays);
  const rows: Assignment[] = plan.proposals.map((p) => ({
    id: newId("ASG"),
    paperId: p.paperId,
    facultyId: p.facultyId,
    assignedAt: now,
    dueDate,
    status: "Pending",
    assignedBy: user.id,
  }));
  await store().insert("assignments", rows);
  refresh();
  redirect(`/admin/distribute?done=${rows.length}&dueDays=${dueDays}&respectMaxLoad=${respectMaxLoad ? "on" : "off"}`);
}

// ---------------------------------------------------------------- master: decisions & emails

export async function setDecision(fd: FormData) {
  const db = await store().snapshot({ fresh: true });
  const user = await requireUser("master");
  const paperId = str(fd, "paperId");
  const finalDecision = str(fd, "finalDecision") as Recommendation;
  if (!RECOMMENDATIONS.includes(finalDecision)) throw new Error("Invalid decision");
  const notes = str(fd, "notes");
  const existing = db.decisions.find((d) => d.paperId === paperId);
  const fields = { finalDecision, decidedBy: user.id, decidedAt: new Date().toISOString(), notes };
  if (existing) await store().update("decisions", paperId, fields);
  else await store().insert("decisions", [{ paperId, ...fields, emailStatus: "Draft", emailSentAt: "" }]);
  refresh();
}

export async function clearDecision(fd: FormData) {
  await requireUser("master");
  await store().remove("decisions", str(fd, "paperId"));
  refresh();
}

export async function setEmailStatus(fd: FormData) {
  await requireUser("master");
  const sent = str(fd, "status") === "Sent";
  await store().update("decisions", str(fd, "paperId"), {
    emailStatus: sent ? "Sent" : "Draft",
    emailSentAt: sent ? new Date().toISOString() : "",
  });
  refresh();
}

// ---------------------------------------------------------------- master: faculty management

export async function saveFaculty(_: ActionState, fd: FormData): Promise<ActionState> {
  const db = await store().snapshot({ fresh: true });
  const me = await requireUser("master");
  const fail = (error: string): ActionState => ({ error, values: formValues(fd) });
  const id = str(fd, "id");
  const name = str(fd, "name");
  const username = str(fd, "username").toLowerCase();
  const email = str(fd, "email").toLowerCase();
  const password = String(fd.get("password") ?? "");
  const role: Role = str(fd, "role") === "master" ? "master" : "faculty";
  const domains = role === "faculty" ? fd.getAll("domains").map(String).filter(Boolean) : [];
  const maxLoad = role === "faculty" ? Math.max(0, Number(fd.get("maxLoad")) || 0) : 0;
  const active = fd.get("active") === "on";
  if (!name || !/^\S+@\S+\.\S+$/.test(email)) return fail("Name and a valid email are required.");
  if (!/^[a-z0-9._-]{3,40}$/.test(username)) return fail("Login ID: 3–40 characters, letters, numbers, dots, dashes or underscores.");
  if (password && password.length < 8) return fail("Password must be at least 8 characters.");

  if (db.faculty.some((f) => f.email.toLowerCase() === email && f.id !== id)) return fail("Another account already uses this email.");
  if (db.faculty.some((f) => f.username.toLowerCase() === username && f.id !== id)) return fail("This login ID is already taken.");
  const current = id ? db.faculty.find((f) => f.id === id) : undefined;
  if (id && !current) return fail("Account not found.");
  if (!current && !password) return fail("Set an initial password (at least 8 characters).");
  // With Google sign-in switched on, new or changed emails must be on the university domain.
  if (googleSignInEnabled() && (!current || current.email.toLowerCase() !== email) && !isAllowedEmail(email)) {
    return fail(`Use a @${config.allowedDomain} Google account email; only those can sign in.`);
  }
  if (current && current.id === me.id && (role !== "master" || !active)) {
    return fail("You can't remove your own admin access or deactivate yourself.");
  }

  const fields: Partial<Faculty> = { name, username, email, role, domains, maxLoad, active };
  if (password) fields.passwordHash = hashPassword(password);
  if (current) {
    await store().update("faculty", current.id, fields);
    refresh();
    return { ok: true, message: `Saved ${name}${password ? " (password changed)" : ""}.` };
  }
  const nextNum = db.faculty.reduce((m, f) => Math.max(m, Number(f.id.replace(/\D/g, "")) || 0), 0) + 1;
  await store().insert("faculty", [
    { id: `FAC${String(nextNum).padStart(2, "0")}`, name, username, email, role, domains, maxLoad, active: true, passwordHash: hashPassword(password) },
  ]);
  refresh();
  return { ok: true, message: `Added ${name}. They can sign in with ID “${username}” and the password you set.` };
}
