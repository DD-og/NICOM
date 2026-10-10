"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { endSession, requireUser, resolveAccount, startSession } from "@/lib/auth";
import { config, isAllowedEmail } from "@/lib/config";
import { newId, store } from "@/lib/db";
import { consensus, planDistribution, reviewsComplete } from "@/lib/logic";
import { RECOMMENDATIONS, type Assignment, type Faculty, type Recommendation, type Review, type Role } from "@/lib/types";

export type FormValues = Record<string, string | string[]>;
export type ActionState = { ok?: boolean; error?: string; message?: string; values?: FormValues } | undefined;

/** React resets a form after its action runs; failed submissions echo the input back so nothing typed is lost. */
function formValues(fd: FormData): FormValues {
  const out: FormValues = {};
  for (const key of new Set(fd.keys())) {
    if (key.startsWith("$ACTION")) continue;
    const all = fd.getAll(key).map(String);
    out[key] = all.length > 1 || key === "domains" ? all : all[0];
  }
  return out;
}

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const addDays = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
const refresh = () => revalidatePath("/", "layout");

// ---------------------------------------------------------------- auth

/** Password-less account picker for the local dummy-data demo only. Real sign-in is Google (/auth/google). */
export async function demoLogin(fd: FormData) {
  if (!config.demoLogin) throw new Error("Demo sign-in is disabled");
  const db = await store().snapshot();
  const row = db.faculty.find((f) => f.id === str(fd, "userId"));
  const user = row && resolveAccount(db, row.email);
  if (!user) redirect("/login?error=not_registered");
  await startSession(user);
  redirect(user.role === "master" ? "/admin" : "/faculty");
}

export async function logout() {
  await endSession();
  redirect("/login");
}

// ---------------------------------------------------------------- faculty: reviews

/** After a paper's reviews change, keep an automatic (not yet sent) decision in sync with reviewer consensus. */
async function syncAutoDecision(paperId: string) {
  const db = await store().snapshot();
  const assignments = db.assignments.filter((a) => a.paperId === paperId);
  const reviews = db.reviews.filter((r) => r.paperId === paperId);
  const existing = db.decisions.find((d) => d.paperId === paperId);
  const allDone = reviewsComplete(assignments); // both reviewers (policy) have submitted
  const { suggestion } = consensus(reviews);

  if (existing) {
    if (existing.decidedBy !== "AUTO" || existing.emailStatus === "Sent") return; // the master's call stands
    if (allDone && suggestion) {
      if (existing.finalDecision !== suggestion) await store().update("decisions", paperId, { finalDecision: suggestion });
    } else {
      await store().remove("decisions", paperId);
    }
    return;
  }
  if (allDone && suggestion) {
    await store().insert("decisions", [
      {
        paperId,
        finalDecision: suggestion,
        decidedBy: "AUTO",
        decidedAt: new Date().toISOString(),
        emailStatus: "Draft",
        emailSentAt: "",
        notes: "Auto-drafted from reviewer consensus",
      },
    ]);
  }
}

export async function submitReview(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser("faculty");
  const fail = (error: string): ActionState => ({ error, values: formValues(fd) });
  const assignmentId = str(fd, "assignmentId");
  const db = await store().snapshot();
  const assignment = db.assignments.find((a) => a.id === assignmentId);
  if (!assignment || assignment.facultyId !== user.id) return fail("This paper is not assigned to you.");
  const decision = db.decisions.find((d) => d.paperId === assignment.paperId);
  if (decision?.emailStatus === "Sent") return fail("The author has already been notified; the review is locked.");

  const score = (k: string) => {
    const n = Number(fd.get(k));
    return Number.isInteger(n) && n >= 1 && n <= 5 ? n : null;
  };
  const scores = {
    originality: score("originality"),
    methodology: score("methodology"),
    relevance: score("relevance"),
    clarity: score("clarity"),
    overall: score("overall"),
  };
  if (Object.values(scores).some((v) => v === null)) return fail("Please rate every criterion from 1 to 5.");
  const recommendation = str(fd, "recommendation") as Recommendation;
  if (!RECOMMENDATIONS.includes(recommendation)) return fail("Please choose a recommendation.");
  const commentsToAuthors = str(fd, "commentsToAuthors");
  if (commentsToAuthors.length < 30) return fail("Comments to authors should be at least 30 characters.");

  const fields = {
    ...(scores as Record<keyof typeof scores, number>),
    recommendation,
    commentsToAuthors,
    confidentialComments: str(fd, "confidentialComments"),
    submittedAt: new Date().toISOString(),
  };
  const existing = db.reviews.find((r) => r.assignmentId === assignmentId);
  if (existing) {
    await store().update("reviews", existing.id, fields);
  } else {
    const review: Review = {
      id: newId("REV"),
      assignmentId,
      paperId: assignment.paperId,
      facultyId: user.id,
      ...fields,
    };
    await store().insert("reviews", [review]);
  }
  if (assignment.status !== "Completed") await store().update("assignments", assignmentId, { status: "Completed" });
  await syncAutoDecision(assignment.paperId);
  refresh();
  redirect(`/faculty/review/${assignmentId}?submitted=1`);
}

// ---------------------------------------------------------------- master: assignments

export async function assignReviewer(fd: FormData) {
  const user = await requireUser("master");
  const paperId = str(fd, "paperId");
  const facultyId = str(fd, "facultyId");
  const dueDate = str(fd, "dueDate") || addDays(14);
  const db = await store().snapshot();
  if (!db.papers.some((p) => p.id === paperId)) throw new Error("Unknown paper");
  if (!db.faculty.some((f) => f.id === facultyId && f.role === "faculty")) throw new Error("Unknown faculty");
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
  await store().insert("assignments", [a]);
  await syncAutoDecision(paperId);
  refresh();
}

export async function removeAssignment(fd: FormData) {
  await requireUser("master");
  const id = str(fd, "assignmentId");
  const db = await store().snapshot();
  const a = db.assignments.find((x) => x.id === id);
  if (!a) return;
  const review = db.reviews.find((r) => r.assignmentId === id);
  if (review) await store().remove("reviews", review.id);
  await store().remove("assignments", id);
  await syncAutoDecision(a.paperId);
  refresh();
}

export async function updateDueDate(fd: FormData) {
  await requireUser("master");
  await store().update("assignments", str(fd, "assignmentId"), { dueDate: str(fd, "dueDate") });
  refresh();
}

export async function runDistribution(fd: FormData) {
  const user = await requireUser("master");
  const perPaper = config.reviewersPerPaper;
  const dueDays = Math.max(1, Number(fd.get("dueDays")) || 14);
  const respectMaxLoad = fd.get("respectMaxLoad") === "on";
  const db = await store().snapshot();
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
  const user = await requireUser("master");
  const paperId = str(fd, "paperId");
  const finalDecision = str(fd, "finalDecision") as Recommendation;
  if (!RECOMMENDATIONS.includes(finalDecision)) throw new Error("Invalid decision");
  const notes = str(fd, "notes");
  const db = await store().snapshot();
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
  const me = await requireUser("master");
  const fail = (error: string): ActionState => ({ error, values: formValues(fd) });
  const id = str(fd, "id");
  const name = str(fd, "name");
  const email = str(fd, "email").toLowerCase();
  const role: Role = str(fd, "role") === "master" ? "master" : "faculty";
  const domains = role === "faculty" ? fd.getAll("domains").map(String).filter(Boolean) : [];
  const maxLoad = role === "faculty" ? Math.max(0, Number(fd.get("maxLoad")) || 0) : 0;
  const active = fd.get("active") === "on";
  if (!name || !/^\S+@\S+\.\S+$/.test(email)) return fail("Name and a valid email are required.");

  const db = await store().snapshot();
  if (db.faculty.some((f) => f.email.toLowerCase() === email && f.id !== id)) {
    return fail("Another account already uses this email.");
  }
  const current = id ? db.faculty.find((f) => f.id === id) : undefined;
  if (id && !current) return fail("Account not found.");
  // Sign-in is Google-only, so new or changed emails must be on the university domain.
  if ((!current || current.email.toLowerCase() !== email) && !isAllowedEmail(email)) {
    return fail(`Use a @${config.allowedDomain} Google account email; only those can sign in.`);
  }
  if (current && current.id === me.id && (role !== "master" || !active)) {
    return fail("You can't remove your own admin access or deactivate yourself.");
  }

  if (current) {
    await store().update("faculty", current.id, { name, email, role, domains, maxLoad, active } satisfies Partial<Faculty>);
    refresh();
    return { ok: true, message: `Saved ${name}.` };
  }
  const nextNum = db.faculty.reduce((m, f) => Math.max(m, Number(f.id.replace(/\D/g, "")) || 0), 0) + 1;
  await store().insert("faculty", [
    { id: `FAC${String(nextNum).padStart(2, "0")}`, name, email, role, domains, maxLoad, active: true },
  ]);
  refresh();
  return { ok: true, message: `Added ${name}. They can now sign in with Google using ${email}.` };
}
