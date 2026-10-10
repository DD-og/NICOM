/**
 * Prepare the Google Sheet for the portal:
 *   npm run sheets:init            -> create Faculty/Assignments/Reviews/Decisions tabs (with headers) if missing
 *   npm run sheets:init -- --seed  -> also copy the demo faculty/assignments/reviews/decisions from data/seed.json
 *                                    into any of those tabs that are still empty
 * The first master admin signs in via MASTER_ADMIN_EMAILS and then adds everyone else on the Faculty page.
 * Reads GOOGLE_SHEET_ID, GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_PRIVATE_KEY from .env.local / .env.
 */
import { readFileSync, existsSync } from "node:fs";
import { SheetsStore } from "../lib/db/sheets";
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
  console.log("Done.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
