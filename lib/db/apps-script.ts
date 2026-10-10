import { readFileSync } from "node:fs";
import path from "node:path";
import { config } from "../config";
import type { DB } from "../types";
import { parseSpreadsheet, type TabValues } from "./parse";
import { columnsFor, TABLE_KEY, TABLE_TAB, toCell, type Table } from "./schema";
import type { Store } from "./store";

// Short on purpose: on serverless hosting several instances run at once, so a long cache would show
// stale data after a save made on another instance. 1s still de-duplicates reads within one page render.
const CACHE_MS = 1_000;
const PORTAL_TABLES = ["faculty", "assignments", "reviews", "decisions"] as const;

/** Row object keyed by the Sheet's column headers, as the Apps Script expects. */
function toHeaderRow(table: Table, row: Record<string, unknown>) {
  const out: Record<string, string | number> = {};
  for (const c of columnsFor(table)) if (c.key in row) out[c.header] = toCell(row[c.key]);
  return out;
}

/**
 * Google Sheets through an Apps Script web app bound to the spreadsheet (apps-script/Code.gs).
 * No Google Cloud project is needed: the script runs as the Sheet owner and checks a shared secret.
 */
export class AppsScriptStore implements Store {
  private cache: { at: number; db: DB } | null = null;
  private inflight: Promise<DB> | null = null;
  private writes = 0; // a read that overlaps a write must not be cached
  private seeded: Promise<void> | null = null;

  constructor() {
    if (!config.appsScriptUrl || !config.appsScriptSecret) {
      throw new Error("DATA_BACKEND=appsscript needs APPS_SCRIPT_URL and APPS_SCRIPT_SECRET");
    }
  }

  private async call<T>(op: string, payload: Record<string, unknown> = {}): Promise<T> {
    const res = await fetch(config.appsScriptUrl, {
      method: "POST",
      // text/plain keeps Apps Script from trying to parse the body as a form
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ secret: config.appsScriptSecret, op, ...payload }),
      redirect: "follow",
      cache: "no-store",
    });
    const text = await res.text();
    let data: { ok: boolean; result?: T; error?: string };
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error(`Apps Script returned non-JSON (HTTP ${res.status}). Is the web app deployed with access "Anyone"?`);
    }
    if (!data.ok) throw new Error(`Apps Script ${op} failed: ${data.error}`);
    return data.result as T;
  }

  /** SEED_DEMO_DATA=true: fill the portal tabs with the demo accounts and reviews if they are still empty. */
  private seedOnce(): Promise<void> {
    if (!config.seedDemoData) return Promise.resolve();
    this.seeded ??= (async () => {
      const file = process.env.SEED_FILE ? path.resolve(process.env.SEED_FILE) : path.join(process.cwd(), "data", "seed.json");
      const seed = JSON.parse(readFileSync(file, "utf8")) as DB;
      const tables: Record<string, { headers: string[]; rows: Record<string, string | number>[] }> = {};
      for (const t of PORTAL_TABLES) {
        tables[TABLE_TAB[t]] = {
          headers: columnsFor(t).map((c) => c.header),
          rows: (seed[t] as unknown as Record<string, unknown>[]).map((r) => toHeaderRow(t, r)),
        };
      }
      const done = await this.call<string[]>("seedIfEmpty", { tables });
      if (done.length) console.log(`[nicom] seeded demo data into: ${done.join(", ")}`);
    })().catch((e) => {
      this.seeded = null; // retry on the next request
      throw e;
    });
    return this.seeded;
  }

  async snapshot(): Promise<DB> {
    await this.seedOnce();
    if (this.cache && Date.now() - this.cache.at < CACHE_MS) return structuredClone(this.cache.db);
    // concurrent callers in the same render share one Apps Script round trip
    const writesAtStart = this.writes;
    if (!this.inflight) {
      const p: Promise<DB> = this.call<TabValues[]>("snapshot")
        .then((tabs) => {
          const db = parseSpreadsheet(tabs);
          if (this.writes === writesAtStart) this.cache = { at: Date.now(), db };
          return db;
        })
        .finally(() => {
          if (this.inflight === p) this.inflight = null;
        });
      this.inflight = p;
    }
    return structuredClone(await this.inflight);
  }

  private headersFor(table: Table) {
    if (table === "papers") throw new Error("The submissions tab is owned by the Google Form; the portal never writes to it.");
    return columnsFor(table).map((c) => c.header);
  }

  private keyHeader(table: Table) {
    return columnsFor(table).find((c) => c.key === TABLE_KEY[table])!.header;
  }

  async insert<T extends Table>(table: T, rows: DB[T][number][]) {
    if (!rows.length) return;
    const headers = this.headersFor(table);
    await this.call("append", {
      tab: TABLE_TAB[table],
      headers,
      rows: rows.map((r) => toHeaderRow(table, r as unknown as Record<string, unknown>)),
    });
    this.cache = null;
    this.inflight = null; // reads started before this write are not reused
    this.writes++;
  }

  async update<T extends Table>(table: T, key: string, patch: Partial<DB[T][number]>) {
    this.headersFor(table);
    await this.call("update", {
      tab: TABLE_TAB[table],
      keyHeader: this.keyHeader(table),
      key,
      patch: toHeaderRow(table, patch as Record<string, unknown>),
    });
    this.cache = null;
    this.inflight = null; // reads started before this write are not reused
    this.writes++;
  }

  async remove(table: Table, key: string) {
    this.headersFor(table);
    await this.call("delete", { tab: TABLE_TAB[table], keyHeader: this.keyHeader(table), key });
    this.cache = null;
    this.inflight = null; // reads started before this write are not reused
    this.writes++;
  }
}
