/**
 * Prepare the Google Sheet for the portal:
 *   npm run sheets:init            -> create Faculty/Assignments/Reviews/Decisions tabs (with headers) if missing
 *   npm run sheets:init -- --admin me@nirmauni.ac.in:Secret123  -> also create a master admin account (if none exists)
 *   npm run sheets:init -- --seed  -> also copy the demo faculty/assignments/reviews/decisions from data/seed.json
 *                                    into any of those tabs that are still empty
 * Reads GOOGLE_SHEET_ID, GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_PRIVATE_KEY from .env.local / .env.
 */
import { readFileSync, existsSync } from "node:fs";
import { SheetsStore } from "../lib/db/sheets";
import { hashPassword } from "../lib/password";
import type { DB } from "../lib/types";

for (const file of [".env.local", ".env"]) {
  if (!existsSync(file)) continue;
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

async function main() {
  const seed = process.argv.includes("--seed");
  const sheets = new SheetsStore();
  const tables = ["faculty", "assignments", "reviews", "decisions"] as const;
  for (const t of tables) {
    await sheets.ensureTab(t);
    console.log(`✓ tab ready: ${t}`);
  }
  const current = await sheets.snapshot();
  console.log(`✓ submissions found: ${current.papers.length}`);
  if (seed) {
    const data = JSON.parse(readFileSync("data/seed.json", "utf8")) as DB;
    for (const t of tables) {
      if (current[t].length) {
        console.log(`- ${t}: already has ${current[t].length} rows, skipped`);
        continue;
      }
      await sheets.insert(t, data[t] as never);
      console.log(`✓ ${t}: seeded ${data[t].length} rows`);
    }
  }
  const adminArg = process.argv[process.argv.indexOf("--admin") + 1];
  if (process.argv.includes("--admin") && adminArg) {
    const [email, ...rest] = adminArg.split(":");
    const password = rest.join(":");
    const now = await sheets.snapshot();
    if (now.faculty.some((f) => f.role === "master")) {
      console.log("- master admin already exists, skipped");
    } else if (!email.includes("@") || password.length < 8) {
      throw new Error("--admin expects email:password (password at least 8 characters)");
    } else {
      await sheets.insert("faculty", [
        { id: "MASTER", name: "NICOM Conference Office", email: email.toLowerCase(), role: "master", domains: [], maxLoad: 0, active: true, passwordHash: hashPassword(password) },
      ]);
      console.log(`✓ master admin created: ${email}`);
    }
  }
  console.log("Done.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
