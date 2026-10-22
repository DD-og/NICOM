import { getUser } from "@/lib/auth";
import { store } from "@/lib/db";
import { nominationTally, NOMINATIONS } from "@/lib/evaluation";
import { paperViews } from "@/lib/logic";

const esc = (v: unknown) => {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export async function GET() {
  const user = await getUser();
  if (user?.role !== "master") return new Response("Forbidden", { status: 403 });
  const db = await store().snapshot();
  const name = (id: string) => db.faculty.find((f) => f.id === id)?.name ?? id;
  const header = [
    "Paper ID", "Title", "Track", "Author", "Email", "Phone", "Affiliation", "Status", "Reviewers",
    "Reviews Completed", "Reviewer Evaluations", "Avg Score (1-5)", ...NOMINATIONS.map((q) => `${q.header} (Yes)`),
    "Final Decision", "Email Status", "Paper Link",
  ];
  const rows = paperViews(db).map((p) => [
    p.id, p.title, p.domain, p.authorName, p.email, p.phone, p.affiliation, p.status,
    p.assignments.map((a) => name(a.facultyId)).join("; "),
    `${p.reviews.length}/${p.assignments.length}`,
    p.reviews.map((r) => `${name(r.facultyId)}: ${r.recommendation}`).join("; "),
    p.avgScore?.toFixed(2) ?? "",
    ...nominationTally(p.reviews).map((t) => (t.total ? `${t.yes}/${t.total}` : "")),
    p.decision?.finalDecision ?? "",
    p.decision?.emailStatus ?? "",
    p.driveLink,
  ]);
  const csv = [header, ...rows].map((r) => r.map(esc).join(",")).join("\n");
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="nicom-papers-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
