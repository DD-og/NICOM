// Read-only smoke test of a deployed portal: signs in, opens every page, never submits a change.
//   BASE_URL=https://nicom-six.vercel.app ADMIN_ID=admin ADMIN_PW=... TEACHER_ID=meera.iyer TEACHER_PW=... \
//     node scripts/live-smoke.mjs
// Prints one line per check and exits non-zero if anything failed.
import { chromium } from "@playwright/test";

const BASE = (process.env.BASE_URL || "").replace(/\/$/, "");
const { ADMIN_ID = "admin", ADMIN_PW, TEACHER_ID, TEACHER_PW } = process.env;
if (!BASE || !ADMIN_PW || !TEACHER_ID || !TEACHER_PW) {
  console.error("Set BASE_URL, ADMIN_PW, TEACHER_ID and TEACHER_PW");
  process.exit(2);
}

const results = [];
const check = (ok, what, detail = "") => {
  results.push(ok);
  console.log(`${ok ? "PASS" : "FAIL"}  ${what}${detail ? `: ${detail}` : ""}`);
};

const browser = await chromium.launch();

async function session(viewport = { width: 1366, height: 900 }) {
  const ctx = await browser.newContext({ viewport });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  return { ctx, page, errors };
}

async function signIn(page, id, pw) {
  await page.goto(`${BASE}/login`);
  await page.fill("#username", id);
  await page.fill("#password", pw);
  await Promise.all([page.waitForURL(/\/(admin|faculty)/, { timeout: 30_000 }), page.click("button[type=submit]")]);
}

async function visit(s, path, mustSee) {
  const t0 = Date.now();
  const res = await s.page.goto(BASE + path, { waitUntil: "networkidle" });
  const ms = Date.now() - t0;
  const body = await s.page.locator("body").innerText();
  const broken = /Something went wrong|Application error|Not found/i.test(body);
  const width = await s.page.evaluate(() => document.documentElement.scrollWidth);
  const vw = s.page.viewportSize().width;
  check(res.ok() && !broken && (!mustSee || body.toLowerCase().includes(mustSee.toLowerCase())), `${path} loads`, `${res.status()} in ${ms} ms`);
  check(width <= vw, `${path} fits ${vw}px`, width > vw ? `page is ${width}px wide` : "");
  return body;
}

try {
  // ---- signed out
  const anon = await session();
  const login = await anon.page.goto(`${BASE}/login`);
  check(login.ok(), "login page loads", String(login.status()));
  await anon.page.goto(`${BASE}/admin`);
  check(anon.page.url().includes("/login"), "signed-out /admin redirects to login");
  check((await anon.page.request.get(`${BASE}/api/export`)).status() === 403, "CSV export is refused when signed out");
  await anon.page.goto(`${BASE}/login`);
  await anon.page.fill("#username", ADMIN_ID);
  await anon.page.fill("#password", "definitely-wrong");
  await anon.page.click("button[type=submit]");
  check(await anon.page.getByText("Incorrect ID or password.").waitFor({ timeout: 20_000 }).then(() => true, () => false), "wrong password is rejected");

  // ---- admin
  const admin = await session();
  await signIn(admin.page, ADMIN_ID, ADMIN_PW);
  check(admin.page.url().endsWith("/admin"), "admin lands on /admin");
  const overview = await visit(admin, "/admin", "Submissions");
  const num = (label) => (overview.match(new RegExp(`${label}\\s*\\n\\s*([\\d/]+)`, "i")) || [])[1];
  console.log(`      overview: submissions=${num("Submissions")} need-reviewers=${num("Need reviewers")} reviews-done=${num("Reviews done")} awaiting=${num("Awaiting decision")} notified=${num("Authors notified")}`);
  await visit(admin, "/admin/papers", "NICOM26-001");
  await visit(admin, "/admin/papers/NICOM26-001", "Reviewers");
  await visit(admin, "/admin/distribute", "reviewers per paper");
  await visit(admin, "/admin/faculty", "Reviewers");
  await visit(admin, "/admin/faculty/FAC01", "Assigned papers");
  for (const tab of ["decide", "send", "sent"]) await visit(admin, `/admin/decisions?tab=${tab}`, "Decisions & emails");
  const csv = await admin.page.request.get(`${BASE}/api/export`);
  const lines = (await csv.text()).trim().split("\n").length - 1;
  check(csv.status() === 200 && lines > 0, "CSV export works for admin", `${lines} papers`);
  check(admin.errors.length === 0, "no browser errors (admin)", admin.errors.slice(0, 3).join(" | "));

  // ---- teacher
  const teacher = await session();
  await signIn(teacher.page, TEACHER_ID, TEACHER_PW);
  check(teacher.page.url().endsWith("/faculty"), "teacher lands on /faculty");
  const home = await visit(teacher, "/faculty", "Welcome");
  const reviewLink = teacher.page.locator("a", { hasText: /Review paper|View/ }).first();
  if (await reviewLink.count()) {
    await reviewLink.click();
    await teacher.page.waitForURL("**/faculty/review/*");
    const body = await teacher.page.locator("main").innerText();
    check(/Open full paper in Google Drive/.test(body), "review page shows the Drive link");
    check(!/@example\.com/.test(body), "review page hides author email (double-blind)");
  } else {
    check(true, "teacher has no papers yet", "skipped review page");
  }
  await teacher.page.goto(`${BASE}/admin`);
  check(teacher.page.url().endsWith("/faculty"), "teacher cannot open admin pages");
  check(teacher.errors.length === 0, "no browser errors (teacher)", teacher.errors.slice(0, 3).join(" | "));
  void home;

  // ---- phone
  const phone = await session({ width: 390, height: 844 });
  await signIn(phone.page, ADMIN_ID, ADMIN_PW);
  for (const p of ["/admin", "/admin/papers", "/admin/decisions?tab=send", "/admin/faculty"]) await visit(phone, p);
} catch (e) {
  check(false, "smoke run crashed", e.message);
} finally {
  await browser.close();
}

const failed = results.filter((r) => !r).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
