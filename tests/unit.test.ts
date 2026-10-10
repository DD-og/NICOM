// Logic, email, sign-in and Google Sheets adapter tests. Run: npm test
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";
import { JWT } from "google-auth-library";
import { findByLogin, resolveAccount } from "../lib/accounts";
import { config } from "../lib/config";
import { AppsScriptStore } from "../lib/db/apps-script";
import { hashPassword, verifyPassword } from "../lib/password";
// @ts-expect-error plain JS test helper
import { createAppsScriptRuntime, dummySheetTabs } from "./support/apps-script-runtime.mjs";
import { mapHeaders, SheetsStore } from "../lib/db/sheets";
import { buildDecisionEmail, gmailComposeUrl, mailtoUrl } from "../lib/email";
import { drivePreviewUrl, driveFileId, firstLink } from "../lib/format";
import { checkIdentity } from "../lib/google-signin";
import { applyOps } from "../lib/db/ops";
import { autoDecisionOps, consensus, paperStatus, paperViews, planDistribution, reviewsComplete } from "../lib/logic";
import { execSync } from "node:child_process";
import { columnsFor } from "../lib/db/schema";
import type { Assignment, DB, Review } from "../lib/types";

const seed = (): DB => JSON.parse(readFileSync("data/seed.json", "utf8"));
const asg = (status: Assignment["status"], i = 0): Assignment => ({
  id: `A${i}`, paperId: "P", facultyId: `F${i}`, assignedAt: "", dueDate: "2099-01-01", status, assignedBy: "MASTER",
});
const rev = (recommendation: Review["recommendation"], i = 0): Review => ({
  id: `R${i}`, assignmentId: `A${i}`, paperId: "P", facultyId: `F${i}`, originality: 4, methodology: 4, relevance: 4,
  clarity: 4, overall: 4, recommendation, commentsToAuthors: `comment from reviewer ${i}`, confidentialComments: `SECRET-${i}`, submittedAt: "",
});

describe("review policy: two reviewers per paper", () => {
  test("paper status follows assignments and decision", () => {
    assert.equal(paperStatus([]), "Unassigned");
    assert.equal(paperStatus([asg("Completed")]), "Under Review", "one finished review is not enough");
    assert.equal(paperStatus([asg("Completed", 1), asg("Pending", 2)]), "Under Review");
    assert.equal(paperStatus([asg("Completed", 1), asg("Completed", 2)]), "Reviewed");
    const d = { paperId: "P", finalDecision: "Accept" as const, decidedBy: "X", decidedAt: "", emailSentAt: "", notes: "" };
    assert.equal(paperStatus([], { ...d, emailStatus: "Draft" }), "Decision Drafted");
    assert.equal(paperStatus([], { ...d, emailStatus: "Sent" }), "Author Notified");
  });

  test("reviewsComplete needs both reviews and nothing pending", () => {
    assert.equal(reviewsComplete([asg("Completed")]), false);
    assert.equal(reviewsComplete([asg("Completed", 1), asg("Completed", 2)]), true);
    assert.equal(reviewsComplete([asg("Completed", 1), asg("Completed", 2), asg("Pending", 3)]), false);
  });

  test("consensus only when every reviewer agrees", () => {
    assert.deepEqual(consensus([]), { suggestion: null, disagree: false });
    assert.deepEqual(consensus([rev("Accept", 1), rev("Accept", 2)]), { suggestion: "Accept", disagree: false });
    assert.deepEqual(consensus([rev("Accept", 1), rev("Reject", 2)]), { suggestion: null, disagree: true });
  });
});

describe("auto-distribution", () => {
  test("gives every undecided paper two reviewers from its own track", () => {
    const db = seed();
    const plan = planDistribution(db, { respectMaxLoad: true });
    assert.equal(plan.shortfalls.length, 0);
    const after = [...db.assignments, ...plan.proposals.map((p, i) => ({ ...asg("Pending", 1000 + i), ...p }))];
    for (const paper of db.papers) {
      if (db.decisions.some((d) => d.paperId === paper.id)) continue;
      const mine = after.filter((a) => a.paperId === paper.id);
      assert.equal(mine.length, 2, `${paper.id} should have 2 reviewers`);
      assert.equal(new Set(mine.map((a) => a.facultyId)).size, 2, `${paper.id} reviewers must differ`);
      for (const a of mine) {
        const f = db.faculty.find((x) => x.id === a.facultyId)!;
        assert.ok(f.domains.includes(paper.domain), `${f.name} is not in ${paper.domain}`);
      }
    }
  });

  test("respects max load and skips inactive faculty", () => {
    const db = seed();
    db.faculty = db.faculty.map((f) => (f.id === "FAC10" ? { ...f, active: false } : { ...f, maxLoad: f.role === "faculty" ? 6 : 0 }));
    const plan = planDistribution(db, { respectMaxLoad: true });
    assert.ok(!plan.proposals.some((p) => p.facultyId === "FAC10"), "inactive faculty got papers");
    const load = (id: string) => db.assignments.filter((a) => a.facultyId === id).length + plan.proposals.filter((p) => p.facultyId === id).length;
    for (const f of db.faculty.filter((x) => x.role === "faculty" && x.active)) assert.ok(load(f.id) <= 6, `${f.name} over max load`);
    assert.ok(plan.shortfalls.length > 0, "should report papers it could not staff");
    assert.ok(plan.shortfalls.every((s) => s.reason.length > 0));
  });

  test("does not touch decided papers and is idempotent once staffed", () => {
    const db = seed();
    const plan = planDistribution(db, { respectMaxLoad: true });
    const decided = new Set(db.decisions.map((d) => d.paperId));
    assert.ok(!plan.proposals.some((p) => decided.has(p.paperId)));
    db.assignments.push(...plan.proposals.map((p, i) => ({ ...asg("Pending", 2000 + i), ...p })));
    assert.equal(planDistribution(db, { respectMaxLoad: true }).proposals.length, 0);
  });

  test("seed data: views and needsReviewers", () => {
    const views = paperViews(seed());
    assert.equal(views.length, 24);
    assert.equal(views.filter((p) => p.needsReviewers > 0).length, 6);
    assert.equal(views.find((p) => p.id === "NICOM26-010")!.status, "Decision Drafted");
    assert.ok(views.find((p) => p.id === "NICOM26-005")!.reviewersDisagree);
  });
});

describe("decision email", () => {
  const paper = seed().papers[1];
  test("anonymous reviewers, no confidential comments, author greeting", () => {
    const e = buildDecisionEmail(paper, "Accept with Minor Revisions", [rev("Accept", 1), rev("Accept", 2)]);
    assert.equal(e.to, paper.email);
    assert.match(e.subject, /NICOM26-002/);
    assert.match(e.subject, /Accepted with Minor Revisions/);
    assert.match(e.body, new RegExp(`^Dear ${paper.authorName},`));
    assert.match(e.body, /Reviewer 1:\ncomment from reviewer 1/);
    assert.match(e.body, /Reviewer 2:\ncomment from reviewer 2/);
    assert.doesNotMatch(e.body, /SECRET-/);
    assert.doesNotMatch(e.body, /F1|F2/);
  });

  test("no Cc and a reply-to line while the conference mailbox is undecided", () => {
    const e = buildDecisionEmail(paper, "Reject", []);
    assert.equal(e.cc, "");
    assert.match(e.body, /please reply to this email/);
    assert.ok(!gmailComposeUrl(e).includes("cc="));
    assert.ok(!mailtoUrl(e).includes("cc="));
  });

  test("every decision has its own wording", () => {
    const bodies = (["Accept", "Accept with Minor Revisions", "Major Revisions", "Reject", "Recommended for Journal Publication"] as const).map(
      (d) => buildDecisionEmail(paper, d, []).body,
    );
    assert.equal(new Set(bodies).size, 5);
    assert.match(bodies[4], /Journal of Business and Management Studies/);
  });
});

describe("Google sign-in rules", () => {
  test("only verified @nirmauni.ac.in accounts", () => {
    assert.deepEqual(checkIdentity({ email: "Asha.Rao@nirmauni.ac.in", email_verified: true, hd: "nirmauni.ac.in", name: "Asha" }), {
      ok: true, email: "asha.rao@nirmauni.ac.in", name: "Asha",
    });
    assert.equal(checkIdentity({ email: "someone@gmail.com", email_verified: true, hd: undefined }).ok, false);
    assert.equal(checkIdentity({ email: "x@nirmauni.ac.in.evil.com", email_verified: true, hd: "nirmauni.ac.in.evil.com" }).ok, false);
    assert.equal(checkIdentity({ email: "x@nirmauni.ac.in", email_verified: true, hd: "evil.com" }).ok, false);
    assert.equal(checkIdentity({ email: "x@nirmauni.ac.in", email_verified: false, hd: "nirmauni.ac.in" }).ok, false);
  });

  test("account must be registered and active", () => {
    const db = seed();
    assert.equal(resolveAccount(db, "MEERA.IYER@example.edu")?.id, "FAC01");
    assert.equal(resolveAccount(db, "nobody@nirmauni.ac.in"), null);
    db.faculty[1].active = false;
    assert.equal(resolveAccount(db, db.faculty[1].email), null);
  });
});

describe("Drive links", () => {
  test("ids and preview urls from form/Drive link shapes", () => {
    assert.equal(driveFileId("https://drive.google.com/open?id=1AbCdEfGhIjKlMn"), "1AbCdEfGhIjKlMn");
    assert.equal(drivePreviewUrl("https://drive.google.com/file/d/1AbCdEfGhIjKlMn/view"), "https://drive.google.com/file/d/1AbCdEfGhIjKlMn/preview");
    assert.equal(drivePreviewUrl("https://docs.google.com/document/d/1AbCdEfGhIjKlMn/edit"), "https://docs.google.com/document/d/1AbCdEfGhIjKlMn/preview");
    assert.equal(firstLink("https://a.example/1, https://a.example/2"), "https://a.example/1");
  });
});

describe("Google Sheets adapter (fake Sheets API)", () => {
  test("header mapping tolerates long Google Form questions", () => {
    const idx = mapHeaders(["Timestamp", "Email Address", "Which track does your paper belong to?", "Upload your full paper (PDF)"], columnsFor("papers"));
    assert.equal(idx.domain, 2);
    assert.equal(idx.driveLink, 3);
    assert.equal(idx.email, 1);
  });

  test("reads form responses, writes only the portal's own tabs", async () => {
    const data = seed();
    const tabs: Record<string, { sheetId: number; values: string[][] }> = {
      "Form Responses 1": {
        sheetId: 0,
        values: [
          ["Timestamp", "Email Address", "Corresponding Author Name", "Paper Title", "Track / Domain", "Upload Paper"],
          ...data.papers.slice(0, 3).map((p) => ["9/2/2026 14:00:00", p.email, p.authorName, p.title, p.domain, p.driveLink]),
        ],
      },
    };
    let nextId = 1;
    const col = (c: string) => [...c].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;
    const a1 = (r: string) => r.match(/^'(.+?)'(?:!([A-Z]+)(\d+)(?::([A-Z]+)(\d+))?)?$/)!;
    (JWT.prototype as unknown as { getAccessToken: () => Promise<{ token: string }> }).getAccessToken = async () => ({ token: "t" });
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async (url: string, init: RequestInit = {}) => {
      const u = new URL(url);
      const path = decodeURIComponent(u.pathname.replace(/^\/v4\/spreadsheets\/[^/:]+/, ""));
      const body = init.body ? JSON.parse(String(init.body)) : {};
      const ok = (j: unknown) => new Response(JSON.stringify(j));
      if (path === "") return ok({ sheets: Object.entries(tabs).map(([title, t]) => ({ properties: { title, sheetId: t.sheetId } })) });
      if (path === ":batchUpdate") {
        for (const r of body.requests) {
          if (r.addSheet) tabs[r.addSheet.properties.title] = { sheetId: nextId++, values: [] };
          if (r.deleteDimension) Object.values(tabs).find((t) => t.sheetId === r.deleteDimension.range.sheetId)!.values.splice(r.deleteDimension.range.startIndex, 1);
        }
        return ok({});
      }
      if (path === "/values:batchUpdate") {
        for (const d of body.data) {
          const m = a1(d.range);
          (tabs[m[1]].values[Number(m[3]) - 1] ??= [])[col(m[2])] = String(d.values[0][0]);
        }
        return ok({});
      }
      const m = path.match(/^\/values\/(.+?)(:append)?$/)!;
      const r = a1(m[1]);
      const t = tabs[r[1]];
      if (m[2]) t.values.push(...body.values.map((row: unknown[]) => row.map(String)));
      else if (init.method === "PUT") body.values[0].forEach((v: string, i: number) => ((t.values[0] ??= [])[col(r[2]) + i] = v));
      else return ok({ values: t.values });
      return ok({});
    }) as typeof fetch;

    try {
      process.env.GOOGLE_SHEET_ID = "sheet";
      process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL = "svc@example.iam.gserviceaccount.com";
      process.env.GOOGLE_PRIVATE_KEY = "key";
      const s = new SheetsStore();
      for (const t of ["faculty", "assignments", "reviews", "decisions"] as const) await s.ensureTab(t);
      assert.deepEqual(Object.keys(tabs).sort(), ["Assignments", "Decisions", "Faculty", "Form Responses 1", "Reviews"]);

      await s.insert("faculty", data.faculty.slice(0, 3));
      await s.insert("assignments", [{ ...asg("Pending", 1), paperId: "NICOM26-001" }, { ...asg("Pending", 2), paperId: "NICOM26-002" }]);
      await s.update("assignments", "A2", { status: "Completed" });
      await s.remove("assignments", "A1");
      const db = await s.snapshot();

      assert.deepEqual(db.papers.map((p) => p.id), ["NICOM26-001", "NICOM26-002", "NICOM26-003"]);
      assert.equal(db.papers[1].domain, data.papers[1].domain);
      assert.deepEqual(db.faculty[1].domains, data.faculty[1].domains);
      assert.equal(db.faculty[1].active, true);
      assert.deepEqual(db.assignments.map((a) => [a.id, a.status]), [["A2", "Completed"]]);
      assert.equal(tabs["Form Responses 1"].values.length, 4, "form tab untouched");
      await assert.rejects(s.ensureTab("papers"));
    } finally {
      globalThis.fetch = realFetch;
    }
  });
});

describe("ID + password login", () => {
  test("passwords are salted scrypt hashes that verify", () => {
    const h1 = hashPassword("Kq7m-x2Pa-9tRb");
    const h2 = hashPassword("Kq7m-x2Pa-9tRb");
    assert.notEqual(h1, h2, "salted");
    assert.ok(verifyPassword("Kq7m-x2Pa-9tRb", h1));
    assert.ok(!verifyPassword("kq7m-x2pa-9trb", h1));
    assert.ok(!verifyPassword("anything", ""));
  });

  test("every seeded account has a login ID and a password hash", () => {
    const db = seed();
    assert.equal(db.faculty.length, 11);
    assert.equal(db.faculty.filter((f) => f.role === "master").map((f) => f.username).join(), "admin");
    for (const f of db.faculty) {
      assert.match(f.username, /^[a-z0-9._-]{3,40}$/);
      assert.match(f.passwordHash, /^scrypt\$[0-9a-f]{32}\$[0-9a-f]{128}$/);
    }
    assert.equal(new Set(db.faculty.map((f) => f.username)).size, 11);
  });

  test("login works with ID or email, case-insensitive", () => {
    const db = seed();
    assert.equal(findByLogin(db, "Meera.Iyer")?.id, "FAC01");
    assert.equal(findByLogin(db, "MEERA.IYER@example.edu")?.id, "FAC01");
    assert.equal(findByLogin(db, " admin ")?.role, "master");
    assert.equal(findByLogin(db, "nobody"), undefined);
    assert.equal(findByLogin(db, ""), undefined);
  });
});

describe("Google Sheets via Apps Script (real Code.gs on a fake spreadsheet)", () => {
  const columns = JSON.parse(readFileSync("lib/sheet-columns.json", "utf8"));
  const setup = () => {
    const runtime = createAppsScriptRuntime({ secret: "s3cret", tabs: dummySheetTabs(seed(), columns) });
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async (_url: string, init: RequestInit) => new Response(runtime.post(String(init.body)))) as typeof fetch;
    Object.assign(config, { appsScriptUrl: "https://script.google.com/macros/s/test/exec", appsScriptSecret: "s3cret", seedDemoData: true });
    return { runtime, restore: () => { globalThis.fetch = realFetch; } };
  };

  test("refuses requests without the secret", () => {
    const runtime = createAppsScriptRuntime({ secret: "s3cret", tabs: [] });
    assert.deepEqual(JSON.parse(runtime.post(JSON.stringify({ op: "snapshot" }))), { ok: false, error: "unauthorized" });
    assert.deepEqual(JSON.parse(runtime.post(JSON.stringify({ op: "snapshot", secret: "wrong" }))), { ok: false, error: "unauthorized" });
    const unset = createAppsScriptRuntime({ secret: "PASTE-THE-SECRET-HERE", tabs: [] });
    assert.equal(JSON.parse(unset.post(JSON.stringify({ op: "snapshot", secret: "PASTE-THE-SECRET-HERE" }))).ok, false, "placeholder secret never works");
  });

  test("seeds once, reads, writes and deletes through the bridge", async () => {
    const { runtime, restore } = setup();
    try {
      const store = new AppsScriptStore();
      let db = await store.snapshot();
      assert.equal(db.papers.length, 24, "papers come from the Form tab");
      assert.equal(db.faculty.length, 11, "demo accounts seeded");
      assert.equal(db.assignments.length, 36);
      assert.equal(db.reviews.length, 20);
      assert.deepEqual(db.faculty[1].domains, seed().faculty[1].domains);
      assert.ok(verifyPassword("x", db.faculty[0].passwordHash) === false && db.faculty[0].passwordHash.startsWith("scrypt$"));

      await store.insert("assignments", [{ ...asg("Pending", 9), id: "ASG-NEW", paperId: "NICOM26-019", facultyId: "FAC10", dueDate: "2026-10-24" }]);
      await store.update("assignments", "ASG-NEW", { status: "Completed" });
      await store.update("faculty", "FAC02", { active: false, domains: ["Marketing", "Finance & Accounting"] });
      await store.remove("assignments", "ASG-001");
      db = await store.snapshot();
      const a = db.assignments.find((x) => x.id === "ASG-NEW")!;
      assert.equal(a.status, "Completed");
      assert.equal(a.dueDate, "2026-10-24", "dates stored as plain text");
      assert.ok(!db.assignments.some((x) => x.id === "ASG-001"));
      assert.equal(db.faculty.find((f) => f.id === "FAC02")!.active, false);
      assert.deepEqual(db.faculty.find((f) => f.id === "FAC02")!.domains, ["Marketing", "Finance & Accounting"]);

      // a second server instance must not seed again
      const again = new AppsScriptStore();
      assert.equal((await again.snapshot()).faculty.length, 11);
      assert.equal(runtime.tab("Untitled").length, 25, "Form responses tab untouched");
      await assert.rejects(store.insert("papers", [db.papers[0]]));
      await assert.rejects(store.update("assignments", "NOPE", { status: "Completed" }), /not found/);
    } finally {
      restore();
    }
  });
});

describe("speed: batched writes and caching", () => {
  test("applyOps inserts, updates and removes like the Sheet does", () => {
    const db = seed();
    applyOps(db, [
      { op: "insert", table: "assignments", rows: [{ ...asg("Pending", 7), id: "X1", paperId: "NICOM26-019" }] },
      { op: "update", table: "assignments", key: "X1", patch: { status: "Completed" } },
      { op: "remove", table: "decisions", key: "NICOM26-010" },
    ]);
    assert.equal(db.assignments.find((a) => a.id === "X1")?.status, "Completed");
    assert.ok(!db.decisions.some((d) => d.paperId === "NICOM26-010"));
    assert.throws(() => applyOps(db, [{ op: "update", table: "assignments", key: "nope", patch: {} }]), /not found/);
  });

  test("autoDecisionOps drafts, updates, withdraws and respects admin decisions", () => {
    const db = seed();
    // NICOM26-019 has two pending reviewers; nothing until both agree
    assert.deepEqual(autoDecisionOps(db, "NICOM26-019"), []);
    const pending = db.assignments.filter((a) => a.paperId === "NICOM26-005");
    assert.equal(pending.length, 2);
    // 005 has a disagreement and no decision -> nothing
    assert.deepEqual(autoDecisionOps(db, "NICOM26-005"), []);
    // make 005 agree -> insert an AUTO draft
    db.reviews.filter((r) => r.paperId === "NICOM26-005").forEach((r) => (r.recommendation = "Accept"));
    const ins = autoDecisionOps(db, "NICOM26-005", "T");
    assert.equal(ins.length, 1);
    assert.equal(ins[0].op, "insert");
    // an AUTO draft whose reviewers now disagree is withdrawn
    db.reviews.filter((r) => r.paperId === "NICOM26-010")[0].recommendation = "Reject";
    assert.deepEqual(autoDecisionOps(db, "NICOM26-010"), [{ op: "remove", table: "decisions", key: "NICOM26-010" }]);
    // an admin's decision is never touched
    assert.deepEqual(autoDecisionOps(db, "NICOM26-003"), []);
  });

  const columns = JSON.parse(readFileSync("lib/sheet-columns.json", "utf8"));
  const connect = (runtime: { post(b: string): string }) => {
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async (_u: string, init: RequestInit) => new Response(runtime.post(String(init.body)))) as typeof fetch;
    Object.assign(config, { appsScriptUrl: "https://script.google.com/macros/s/test/exec", appsScriptSecret: "s3cret", seedDemoData: true });
    return () => { globalThis.fetch = realFetch; };
  };

  test("a multi-step save is one round trip, and the next page needs none", async () => {
    const runtime = createAppsScriptRuntime({ secret: "s3cret", tabs: dummySheetTabs(seed(), columns) });
    const restore = connect(runtime);
    try {
      const store = new AppsScriptStore();
      await store.snapshot();
      const before = runtime.calls;
      await store.batch([
        { op: "insert", table: "reviews", rows: [{ id: "R-NEW", assignmentId: "ASG-033", paperId: "NICOM26-017", facultyId: "FAC04", recommendation: "Accept" }] },
        { op: "update", table: "assignments", key: "ASG-033", patch: { status: "Completed" } },
        { op: "insert", table: "decisions", rows: [{ paperId: "NICOM26-017", finalDecision: "Accept", decidedBy: "AUTO", emailStatus: "Draft" }] },
      ]);
      assert.equal(runtime.calls - before, 1, "three writes, one request");
      const db = await store.snapshot();
      assert.equal(runtime.calls - before, 1, "page after the save is served from the write-through cache");
      assert.ok(db.reviews.some((r) => r.id === "R-NEW"));
      assert.equal(db.assignments.find((a) => a.id === "ASG-033")?.status, "Completed");
      // and the Sheet really has it
      const fresh = await new AppsScriptStore().snapshot({ fresh: true });
      assert.ok(fresh.decisions.some((d) => d.paperId === "NICOM26-017"));
    } finally {
      restore();
    }
  });

  test("Apps Script answers repeat reads from its cache, and refreshes on writes and new Form rows", async () => {
    const runtime = createAppsScriptRuntime({ secret: "s3cret", tabs: dummySheetTabs(seed(), columns) });
    const restore = connect(runtime);
    try {
      const store = new AppsScriptStore();
      await store.snapshot({ fresh: true }); // seeds + first full read
      const r0 = runtime.reads;
      await store.snapshot({ fresh: true });
      assert.equal(runtime.reads, r0, "second read served from the script cache");
      // a new Google Form submission changes the tab size -> cache ignored
      runtime.spreadsheet.getSheetByName("Untitled").cells.push(["NICOM26-025", "now", "new@example.com", "New Author"]);
      const db = await store.snapshot({ fresh: true });
      assert.equal(db.papers.length, 25, "new submission visible immediately");
      assert.ok(runtime.reads > r0);
      // a write through the portal clears the cache too
      const r1 = runtime.reads;
      await store.update("faculty", "FAC03", { maxLoad: 7 });
      const after = await new AppsScriptStore().snapshot({ fresh: true });
      assert.equal(after.faculty.find((f) => f.id === "FAC03")?.maxLoad, 7);
      assert.ok(runtime.reads > r1);
    } finally {
      restore();
    }
  });

  test("still works with a Code.gs deployed before batching existed", async () => {
    const oldSource = execSync("git show ed0b267:apps-script/Code.gs", { encoding: "utf8" });
    assert.ok(!oldSource.includes('"batch"'));
    const runtime = createAppsScriptRuntime({ secret: "s3cret", tabs: dummySheetTabs(seed(), columns), source: oldSource });
    const restore = connect(runtime);
    try {
      const store = new AppsScriptStore();
      await store.snapshot();
      await store.batch([
        { op: "update", table: "assignments", key: "ASG-033", patch: { status: "Completed" } },
        { op: "remove", table: "decisions", key: "NICOM26-010" },
      ]);
      const db = await new AppsScriptStore().snapshot({ fresh: true });
      assert.equal(db.assignments.find((a) => a.id === "ASG-033")?.status, "Completed");
      assert.ok(!db.decisions.some((d) => d.paperId === "NICOM26-010"));
    } finally {
      restore();
    }
  });
});

describe("scale: 300 submissions", () => {
  test("300 papers, 600 assignments, 600 reviews: small payload, fast processing, cache still works", async () => {
    const base = seed();
    const columns = JSON.parse(readFileSync("lib/sheet-columns.json", "utf8"));
    const big = structuredClone(base);
    big.papers = Array.from({ length: 300 }, (_, i) => ({ ...base.papers[i % 24], id: `NICOM26-${String(i + 1).padStart(3, "0")}` }));
    big.assignments = big.papers.flatMap((p, i) => [0, 1].map((k) => ({ ...asg(k ? "Completed" : "Pending", i * 2 + k), id: `A${i}-${k}`, paperId: p.id })));
    big.reviews = big.assignments.map((a, i) => ({ ...rev("Accept", i), id: `R${i}`, assignmentId: a.id, paperId: a.paperId, commentsToAuthors: "x".repeat(400) }));
    const tabs = dummySheetTabs(big, columns);
    const runtime = createAppsScriptRuntime({ secret: "s3cret", tabs });
    // portal tabs filled through the bridge, the way the site writes them
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async (_u: string, init: RequestInit) => new Response(runtime.post(String(init.body)))) as typeof fetch;
    Object.assign(config, { appsScriptUrl: "https://script.google.com/macros/s/test/exec", appsScriptSecret: "s3cret", seedDemoData: false });
    try {
      const store = new AppsScriptStore();
      await store.batch([
        { op: "insert", table: "faculty", rows: base.faculty as unknown as Record<string, unknown>[] },
        { op: "insert", table: "assignments", rows: big.assignments as unknown as Record<string, unknown>[] },
        { op: "insert", table: "reviews", rows: big.reviews as unknown as Record<string, unknown>[] },
      ]);
      const payload = runtime.post(JSON.stringify({ secret: "s3cret", op: "snapshot" }));
      const t0 = performance.now();
      const db = await store.snapshot({ fresh: true });
      const views = paperViews(db);
      const ms = performance.now() - t0;
      console.log(`      300-paper snapshot: ${(payload.length / 1024).toFixed(0)} KB, parsed + computed in ${ms.toFixed(0)} ms`);
      assert.equal(db.papers.length, 300);
      assert.equal(db.reviews.length, 600);
      assert.equal(views.length, 300);
      assert.ok(payload.length < 1_500_000, "well under typical limits");
      assert.ok(ms < 500, "processing is not the bottleneck");
      const r0 = runtime.reads;
      await store.snapshot({ fresh: true });
      assert.equal(runtime.reads, r0, "large snapshot is cached in chunks on the Apps Script side");
    } finally {
      globalThis.fetch = realFetch;
    }
  });
});
