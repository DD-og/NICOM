import { expect, test, type Page } from "@playwright/test";

// One shared demo database, so the journeys run in order.
test.describe.configure({ mode: "serial" });

// tests/support/make-test-seed.mjs gives every demo account this password
const PASSWORD = "e2e-Test-Pass-2026";
const ADMIN = "admin";
const MEERA = "meera.iyer"; // Finance & Accounting, Economics & Public Policy
const NIKHIL = "nikhil.bhatt"; // Economics & Public Policy, Sustainability & ESG

async function signIn(page: Page, username: string, password = PASSWORD) {
  await page.goto("/login");
  await page.fill("#username", username);
  await page.fill("#password", password);
  await Promise.all([page.waitForURL(/\/(admin|faculty)/), page.getByRole("button", { name: "Sign in", exact: true }).click()]);
}

async function signOut(page: Page) {
  await Promise.all([page.waitForURL("**/login"), page.getByRole("button", { name: "Log out" }).click()]);
}

const stat = (page: Page, label: string) => page.locator(".card").filter({ has: page.getByText(label, { exact: true }) }).first();

async function openReview(page: Page, paperId: string) {
  await page.goto("/faculty");
  await page.locator("article").filter({ hasText: paperId }).getByRole("link", { name: /Review paper/ }).click();
  await page.waitForURL("**/faculty/review/*");
}

const ACCEPT = "Accept as Submitted with Minor Formatting changes if required";
const MAJOR = "Accept After Major Revision";
const STATEMENTS = ["novelty", "literature", "methodology", "analysis", "organisation", "contribution", "relevance", "implications", "usefulness"];

async function fillReview(page: Page, score: number, recommendation: string, comments: string, journal = "No") {
  for (const k of STATEMENTS) {
    await page.locator(`input[name=${k}][value="${score}"]`).locator("..").click();
  }
  await page.locator(`input[name=recommendation][value="${recommendation}"]`).locator("..").click();
  await page.locator(`input[name=journal][value="${journal}"]`).locator("..").click();
  await page.locator(`input[name=scopus][value="Yes"]`).locator("..").click();
  await page.locator(`input[name=bestPaper][value="No"]`).locator("..").click();
  await page.fill("#commentsToAuthors", comments);
}

test.describe("sign-in and access control", () => {
  test("signed-out visitors are sent to the sign-in page", async ({ page }) => {
    for (const path of ["/", "/admin", "/admin/papers", "/faculty", "/faculty/review/ASG-001"]) {
      await page.goto(path);
      await expect(page).toHaveURL(/\/login$/);
    }
    expect((await page.request.get("/api/export")).status()).toBe(403);
  });

  test("sign-in page has ID + password (and Google when configured), no account picker", async ({ page }) => {
    await page.goto("/login");
    await expect(page.locator("#username")).toBeVisible();
    await expect(page.locator("#password")).toHaveAttribute("type", "password");
    await expect(page.getByRole("link", { name: /Sign in with Google/ })).toHaveAttribute("href", "/auth/google");
    await expect(page.locator("#userId")).toHaveCount(0);
    await expect(page.getByText(/demo/i)).toHaveCount(0);
  });

  test("wrong password is rejected without revealing which part was wrong", async ({ page }) => {
    await page.goto("/login");
    await page.fill("#username", ADMIN);
    await page.fill("#password", "not-the-password");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page.locator("main p[role=alert]")).toHaveText("Incorrect ID or password.");
    await expect(page.locator("#username")).toHaveValue(ADMIN);
    await page.fill("#username", "no.such.user");
    await page.fill("#password", PASSWORD);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page.locator("main p[role=alert]")).toHaveText("Incorrect ID or password.");
    await expect(page).toHaveURL(/\/login/);
  });

  test("login ID is case-insensitive and email works too", async ({ page }) => {
    await signIn(page, "Meera.Iyer");
    await expect(page).toHaveURL(/\/faculty$/);
    await signOut(page);
    await signIn(page, "meera.iyer@example.edu");
    await expect(page).toHaveURL(/\/faculty$/);
  });

  test("Google sign-in is restricted to the university domain", async ({ page }) => {
    const res = await page.request.get("/auth/google", { maxRedirects: 0 });
    expect(res.status()).toBe(307);
    const url = new URL(res.headers()["location"]);
    expect(url.origin + url.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(url.searchParams.get("hd")).toBe("nirmauni.ac.in");
    expect(url.searchParams.get("client_id")).toBe("test-client.apps.googleusercontent.com");
    expect(url.searchParams.get("redirect_uri")).toBe("http://localhost:3100/auth/google/callback");
    expect(url.searchParams.get("scope")).toBe("openid email profile");
    expect(url.searchParams.get("state")?.length).toBeGreaterThan(20);
    expect(res.headers()["set-cookie"]).toContain("nicom_oauth_state=");
  });

  test("a forged Google callback is rejected", async ({ page }) => {
    await page.goto("/auth/google/callback?code=fake&state=forged");
    await expect(page).toHaveURL(/\/login\?error=state/);
    await expect(page.locator("main p[role=alert]")).toContainText("sign-in session expired");
    await page.goto("/login?error=domain");
    await expect(page.locator("main p[role=alert]")).toContainText("@nirmauni.ac.in");
  });
});

test.describe("master admin", () => {
  test("overview shows the live numbers", async ({ page }) => {
    await signIn(page, ADMIN);
    await expect(page).toHaveURL(/\/admin$/);
    await expect(stat(page, "Submissions")).toContainText("24");
    await expect(stat(page, "Need reviewers")).toContainText("6");
    await expect(stat(page, "Reviews done")).toContainText("20/36");
    await expect(stat(page, "Authors notified")).toContainText("2");
    await expect(page.getByText("Pipeline by track")).toBeVisible();
    await expect(page.getByText("Faculty progress")).toBeVisible();
  });

  test("papers list filters by track, status and search", async ({ page }) => {
    await signIn(page, ADMIN);
    await page.goto("/admin/papers?domain=Marketing");
    await expect(page.locator("tbody tr")).toHaveCount(3);
    await page.goto("/admin/papers?status=Unassigned");
    await expect(page.locator("tbody tr")).toHaveCount(6);
    await page.goto("/admin/papers?q=green+bonds");
    await expect(page.locator("tbody tr")).toHaveCount(1);
    await expect(page.locator("tbody")).toContainText("NICOM26-022");
  });

  test("a reviewer can only be added from the paper's own track", async ({ page }) => {
    await signIn(page, ADMIN);
    await page.goto("/admin/papers/NICOM26-022"); // Sustainability & ESG: Vikram Joshi and Nikhil Bhatt
    const options = page.locator("#facultyId option:not([disabled])");
    await expect(options).toHaveCount(2);
    await expect(page.locator("#facultyId")).toContainText("Dr. Nikhil Bhatt");
    await expect(page.locator("#facultyId")).toContainText("Dr. Vikram Joshi");
    await expect(page.locator("#facultyId")).not.toContainText("Meera");
  });

  test("auto-distribution assigns two track reviewers to every paper", async ({ page }) => {
    await signIn(page, ADMIN);
    await page.goto("/admin/distribute");
    await expect(page.getByText("2 reviewers per paper")).toBeVisible();
    await expect(page.getByText("Preview: 12 new assignments across 6 papers")).toBeVisible();
    await expect(page.getByText(/Could not fully staff/)).toHaveCount(0);
    await Promise.all([page.waitForURL(/done=12/), page.getByRole("button", { name: /Confirm & assign 12/ }).click()]);
    await expect(page.getByText("Created 12 assignments")).toBeVisible();
    await expect(page.getByText("Preview: 0 new assignments")).toBeVisible();

    await page.goto("/admin");
    await expect(stat(page, "Need reviewers")).toContainText("0");
    await page.goto("/admin/papers/NICOM26-019");
    await expect(page.getByText("Reviewers (2/2)")).toBeVisible();
    await expect(page.getByRole("link", { name: "Dr. Meera Iyer" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Dr. Nikhil Bhatt" })).toBeVisible();
  });

  test("notify reviewers: one email per reviewer with days left per paper", async ({ page }) => {
    await signIn(page, ADMIN);
    await page.goto("/admin/notify");
    const card = page.locator("details").filter({ hasText: "Dr. Meera Iyer" });
    await expect(card).toContainText("Not yet notified");
    await card.locator(":scope > summary").click();
    const email = card.locator("pre");
    await expect(email).toContainText("Dear Dr. Meera Iyer,");
    await expect(email).toContainText("NICOM26-019");
    await expect(email).toContainText("(7 days remaining)"); // distributed just now with the 7-day default
    await expect(email).toContainText("login ID: meera.iyer");
    expect(await email.innerText()).not.toContain("Krish Parmar"); // double-blind: no authors
    await card.getByRole("button", { name: "✓ Mark as notified" }).click();
    await expect(page.locator("details").filter({ hasText: "Dr. Meera Iyer" })).toHaveCount(0);

    await page.goto("/admin/notify?show=all");
    const again = page.locator("details").filter({ hasText: "Dr. Meera Iyer" });
    await expect(again).toContainText("Notified");
    await again.locator(":scope > summary").click();
    await expect(again.locator("pre")).toContainText("gentle reminder");
  });

  test("notify reviewers: the email carries a password the reviewer can sign in with", async ({ page }) => {
    await signIn(page, ADMIN);
    await page.goto("/admin/notify");
    const card = page.locator("details").filter({ hasText: "Dr. Ananya Rao" });
    await expect(card).toContainText("No password in email");
    await card.locator(":scope > summary").click();
    await expect(card.locator("pre")).toContainText("password is shared separately");
    page.once("dialog", (d) => d.accept());
    await card.getByRole("button", { name: /Create password/ }).click();

    const after = page.locator("details").filter({ hasText: "Dr. Ananya Rao" });
    await expect(after).not.toContainText("No password in email");
    await after.evaluate((d: HTMLDetailsElement) => (d.open = true));
    const text = await after.locator("pre").innerText();
    const password = text.match(/login ID: ananya\.rao and password: (\S{4}-\S{4}-\S{4})/)?.[1];
    expect(password, text).toBeTruthy();
    // Showing the page again gives the same password, so the email can be re-sent.
    await page.reload();
    await page.locator("details").filter({ hasText: "Dr. Ananya Rao" }).locator(":scope > summary").click();
    await expect(page.locator("details").filter({ hasText: "Dr. Ananya Rao" }).locator("pre")).toContainText(`password: ${password}`);

    await signOut(page);
    await signIn(page, "ananya.rao", password!);
    await expect(page).toHaveURL(/\/faculty$/);
    await expect(page.getByRole("heading", { name: "Welcome, Dr. Ananya Rao" })).toBeVisible();
  });
});

test.describe("faculty review (double-blind)", () => {
  test("faculty home shows only their papers in their tracks", async ({ page }) => {
    await signIn(page, NIKHIL);
    await expect(page).toHaveURL(/\/faculty$/);
    await expect(page.getByRole("heading", { name: "Welcome, Dr. Nikhil Bhatt" })).toBeVisible();
    await expect(page.locator("article")).toHaveCount(6);
    for (const id of ["NICOM26-019", "NICOM26-020", "NICOM26-021", "NICOM26-022", "NICOM26-023", "NICOM26-024"]) {
      await expect(page.locator("article").filter({ hasText: id })).toHaveCount(1);
    }
    await expect(page.getByText("NICOM26-001")).toHaveCount(0);
  });

  test("review page hides author identity and links to the paper", async ({ page }) => {
    await signIn(page, NIKHIL);
    await openReview(page, "NICOM26-019");
    const body = await page.locator("main").innerText();
    expect(body).not.toContain("Krish Parmar");
    expect(body).not.toContain("krish.parmar@example.com");
    expect(body).not.toContain("Symbiosis");
    await expect(page.getByText("Double-blind review")).toBeVisible();
    await expect(page.getByRole("link", { name: /Open full paper in Google Drive/ })).toHaveAttribute("href", /docs\.google\.com\/document\/d\//);
  });

  test("review form validates and saves", async ({ page }) => {
    await signIn(page, NIKHIL);
    await openReview(page, "NICOM26-019");
    await expect(page.getByText("The research indicates the novelty of the study in present time")).toBeVisible();
    await expect(page.getByText("Can this paper be considered for publication in Journal of NIRMA?")).toBeVisible();
    await fillReview(page, 4, ACCEPT, "Too short", "Yes");
    await page.locator("#commentsToAuthors").evaluate((el) => el.removeAttribute("minlength"));
    await page.getByRole("button", { name: "Submit review" }).click();
    await expect(page.getByText("at least 30 characters")).toBeVisible();
    // nothing the reviewer entered is lost
    await expect(page.locator('input[name=usefulness][value="4"]')).toBeChecked();
    await expect(page.locator(`input[name=recommendation][value="${ACCEPT}"]`)).toBeChecked();
    await expect(page.locator('input[name=journal][value="Yes"]')).toBeChecked();
    await expect(page.locator("#commentsToAuthors")).toHaveValue("Too short");

    await page.fill("#commentsToAuthors", "Clear research question, solid panel data and convincing robustness checks. Well suited for the conference.");
    await page.fill("#confidentialComments", "CONFIDENTIAL-NOTE-XYZ");
    await Promise.all([page.waitForURL(/submitted=1/), page.getByRole("button", { name: "Submit review" }).click()]);
    await expect(page.getByText("Review submitted. Thank you!")).toBeVisible();
    await page.goto("/faculty");
    await expect(page.locator("article")).toHaveCount(5);
    await expect(page.getByText("Completed reviews (1)")).toBeVisible();
  });

  test("faculty cannot reach admin pages or other reviewers' papers", async ({ page }) => {
    await signIn(page, NIKHIL);
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/faculty$/);
    await page.goto("/faculty/review/ASG-001"); // assigned to someone else
    await expect(page.getByRole("heading", { name: "Not found" })).toBeVisible();
    expect((await page.request.get("/api/export")).status()).toBe(403);
  });

  test("second matching review auto-drafts the decision email", async ({ page }) => {
    await signIn(page, MEERA);
    await openReview(page, "NICOM26-019");
    await fillReview(page, 5, ACCEPT, "A well-argued policy paper. The GST data work is careful and the implications are useful for practitioners.");
    await Promise.all([page.waitForURL(/submitted=1/), page.getByRole("button", { name: "Submit review" }).click()]);
    await signOut(page);

    await signIn(page, ADMIN);
    await page.goto("/admin/decisions?tab=send");
    const item = page.locator("details").filter({ hasText: "NICOM26-019" });
    await expect(item).toContainText("Auto");
    await item.locator(":scope > summary").click();
    const email = item.locator("pre");
    await expect(email).toContainText("Dear Krish Parmar,");
    await expect(email).toContainText("has been accepted as submitted for presentation at NICOM 2027");
    await expect(email).toContainText("Reviewer 1:");
    await expect(email).toContainText("Reviewer 2:");
    await expect(email).toContainText("please reply to this email");
    const text = await email.innerText();
    for (const hidden of ["CONFIDENTIAL-NOTE-XYZ", "Meera", "Nikhil", "Journal of NIRMA", "SCOPUS", "Best Paper"]) expect(text).not.toContain(hidden);
    await expect(item.getByText("krish.parmar@example.com")).toBeVisible();
    await expect(item.locator("dt", { hasText: "Cc" })).toHaveCount(0);
  });

  test("copy buttons put the email on the clipboard, then mark as sent", async ({ page, context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await signIn(page, ADMIN);
    await page.goto("/admin/papers/NICOM26-019");
    await expect(page.getByText("Journal of NIRMA: Yes")).toHaveCount(1); // internal: Nikhil said Yes, Meera No
    await expect(page.getByText("Journal of NIRMA: No")).toHaveCount(1);
    await page.getByRole("button", { name: "Copy email body" }).click();
    await expect(page.getByRole("button", { name: "✓ Copied" })).toBeVisible();
    const clip = await page.evaluate(() => navigator.clipboard.readText());
    expect(clip).toMatch(/^Dear Krish Parmar,/);
    expect(clip).toContain("Organising Committee");

    await page.getByRole("button", { name: "✓ Mark as sent" }).click();
    await expect(page.getByText(/Email sent/)).toBeVisible();
    await page.goto("/admin/decisions?tab=sent");
    await expect(page.locator("tbody")).toContainText("NICOM26-019");
  });

  test("after the author is notified the review is read-only", async ({ page }) => {
    await signIn(page, NIKHIL);
    await page.goto("/faculty");
    await page.locator("tr").filter({ hasText: "NICOM26-019" }).getByRole("link", { name: "View" }).click();
    await expect(page.getByText("this review is now read-only")).toBeVisible();
    await expect(page.getByRole("button", { name: /Update review|Submit review/ })).toHaveCount(0);
  });
});

test.describe("decisions when reviewers disagree", () => {
  test("admin makes the call and the email is drafted", async ({ page }) => {
    await signIn(page, ADMIN);
    await page.goto("/admin/decisions?tab=decide");
    const card = page.locator(".card").filter({ hasText: "NICOM26-005" });
    await expect(card).toContainText("Reviewers disagree");
    await card.locator("select").selectOption(MAJOR);
    await card.getByRole("button", { name: /Save & draft email/ }).click();
    await expect(page.locator(".card").filter({ hasText: "NICOM26-005" })).toHaveCount(0);

    await page.goto("/admin/papers/NICOM26-005");
    await expect(page.locator("pre")).toContainText("accepted after a major revision");
    await expect(page.getByText("Email not sent")).toBeVisible();
  });
});

test.describe("faculty & admin accounts", () => {
  test("only @nirmauni.ac.in emails can be added", async ({ page }) => {
    await signIn(page, ADMIN);
    await page.goto("/admin/faculty");
    await page.getByText("+ Add an account").click();
    await page.fill("#name-new", "Dr. Outside Person");
    await page.fill("#email-new", "outside.person@gmail.com");
    await page.fill("#username-new", "outside.person");
    await page.fill("#password-new", "Outside-Pass-1");
    await page.getByRole("button", { name: "Add account" }).click();
    await expect(page.getByText("Use a @nirmauni.ac.in Google account email")).toBeVisible();
    await expect(page.locator("#name-new")).toHaveValue("Dr. Outside Person");
    await expect(page.locator("#username-new")).toHaveValue("outside.person");
    await expect(page.locator("#password-new")).toHaveValue("");

    await page.fill("#email-new", "test.reviewer@nirmauni.ac.in");
    await page.fill("#name-new", "Dr. Test Reviewer");
    await page.fill("#username-new", "test.reviewer");
    await page.fill("#password-new", "Reviewer-Pass-1");
    await page.getByRole("checkbox", { name: "Sustainability, ESG & Responsible Business" }).check();
    await page.getByRole("button", { name: "Add account" }).click();
    await expect(page.getByText("Added Dr. Test Reviewer")).toBeVisible();
  });

  test("a committee member can be made an admin", async ({ page }) => {
    await signIn(page, ADMIN);
    await page.goto("/admin/faculty");
    await page.getByText("+ Add an account").click();
    await page.fill("#name-new", "Dr. Conference Coordinator");
    await page.fill("#email-new", "coordinator@nirmauni.ac.in");
    await page.fill("#username-new", "coordinator");
    await page.fill("#password-new", "Coordinator-Pass-1");
    await page.locator("label", { hasText: "Admin" }).locator("input[type=radio]").check();
    await page.getByRole("button", { name: "Add account" }).click();
    await expect(page.getByText("Added Dr. Conference Coordinator")).toBeVisible();
    await signOut(page);

    await signIn(page, "coordinator", "Coordinator-Pass-1");
    await expect(page).toHaveURL(/\/admin$/);
    await expect(page.getByText("Master Admin")).toBeVisible();
  });

  test("new teacher signs in with the ID and password the admin set", async ({ page }) => {
    await signIn(page, "test.reviewer", "Reviewer-Pass-1");
    await expect(page).toHaveURL(/\/faculty$/);
    await expect(page.getByRole("heading", { name: "Welcome, Dr. Test Reviewer" })).toBeVisible();
  });

  test("admin can reset a teacher's password", async ({ page }) => {
    await signIn(page, ADMIN);
    await page.goto("/admin/faculty/FAC03");
    await page.locator("#password-FAC03").evaluate((el) => el.removeAttribute("minlength")); // test the server-side check
    await page.fill("#password-FAC03", "short");
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByText("at least 8 characters")).toBeVisible();
    await page.fill("#password-FAC03", "Brand-New-Pass-9");
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByText("Saved Dr. Kavita Nair (password changed)")).toBeVisible();
    await signOut(page);

    await page.fill("#username", "kavita.nair");
    await page.fill("#password", PASSWORD);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page.locator("main p[role=alert]")).toHaveText("Incorrect ID or password.");
    await signIn(page, "kavita.nair", "Brand-New-Pass-9");
    await expect(page).toHaveURL(/\/faculty$/);
  });

  test("admins cannot demote themselves", async ({ page }) => {
    await signIn(page, ADMIN);
    await page.goto("/admin/faculty/MASTER");
    await page.locator("label", { hasText: "Reviewer" }).locator("input[type=radio]").check();
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByText("can't remove your own admin access")).toBeVisible();
  });

  test("deactivating an account signs that person out immediately", async ({ page, browser }) => {
    const reviewer = await (await browser.newContext()).newPage();
    await signIn(reviewer, "rohan.desai");
    await expect(reviewer).toHaveURL(/\/faculty$/);

    await signIn(page, ADMIN);
    await page.goto("/admin/faculty/FAC02");
    await page.getByLabel(/Active \(can sign in/).uncheck();
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByText("Saved Dr. Rohan Desai")).toBeVisible();

    await reviewer.reload();
    await expect(reviewer).toHaveURL(/\/login\?error=session_ended/);
    await expect(reviewer.locator("main p[role=alert]")).toContainText("session has ended");
    await reviewer.goto("/faculty");
    await expect(reviewer).toHaveURL(/\/login$/);
    await page.goto("/login");
  });
});

test.describe("export & layout", () => {
  test("CSV export has every paper", async ({ page }) => {
    await signIn(page, ADMIN);
    const res = await page.request.get("/api/export");
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toContain("text/csv");
    const lines = (await res.text()).trim().split("\n");
    expect(lines[0]).toContain("Paper ID,Title,Track");
    expect(lines).toHaveLength(25);
    expect(lines.find((l) => l.startsWith("NICOM26-019"))).toContain("Author Notified");
  });

  test("every page fits a phone screen", async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await ctx.newPage();
    const fits = async (path: string) => {
      await page.goto(path);
      expect(await page.evaluate(() => document.documentElement.scrollWidth), path).toBeLessThanOrEqual(390);
    };
    await fits("/login");
    await signIn(page, ADMIN);
    for (const p of ["/admin", "/admin/papers", "/admin/papers/NICOM26-019", "/admin/distribute", "/admin/faculty", "/admin/faculty/FAC01", "/admin/decisions?tab=decide", "/admin/decisions?tab=send", "/admin/decisions?tab=sent"]) {
      await fits(p);
    }
    await signOut(page);
    await signIn(page, MEERA);
    await fits("/faculty");
    await page.locator("tr").filter({ hasText: "NICOM26-019" }).getByRole("link").click();
    await fits(page.url());
  });
});
