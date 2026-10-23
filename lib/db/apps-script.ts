import { readFileSync } from "node:fs";
import path from "node:path";
import { config } from "../config";
import type { DB } from "../types";
import { applyOps } from "./ops";
import { parseSpreadsheet, type TabValues } from "./parse";
import { columnsFor, TABLE_KEY, TABLE_TAB, toCell, type Table } from "./schema";
import { BatchStore, type WriteOp } from "./store";

/**
 * How long a snapshot is reused. Every Apps Script round trip costs ~1-2 s, so this matters for speed.
 * Writes made by this server instance update the cached copy in place (write-through), so the page
 * shown right after a save never waits for Google. Another instance can lag by at most this long,
 * and actions always read fresh data before deciding what to write.
 */
const CACHE_MS = 5_000;
const PORTAL_TABLES = ["faculty", "assignments", "reviews", "decisions"] as const;

/** The Sheet's header row for each tab, as last read. */
type SheetHeaders = Map<string, string[]>;

/**
 * The header to write a column under: the current name if the tab has it, else an older name (alias) the
 * tab still uses, so a renamed column keeps filling the existing one instead of the bridge adding a new
 * column at the end. A column the tab doesn't have yet gets the current name.
 */
function headerNames(table: Table, sheet: SheetHeaders): Record<string, string> {
  const existing = new Set((sheet.get(TABLE_TAB[table]) ?? []).map((h) => h.trim()));
  return Object.fromEntries(
    columnsFor(table).map((c) => [c.key, existing.has(c.header) ? c.header : (c.aliases.find((a) => existing.has(a)) ?? c.header)]),
  );
}

/** Row object keyed by the Sheet's column headers, as the Apps Script expects. */
function toHeaderRow(table: Table, row: Record<string, unknown>, names: Record<string, string>) {
  const out: Record<string, string | number> = {};
  for (const c of columnsFor(table)) if (c.key in row) out[names[c.key]] = toCell(row[c.key]);
  return out;
}

/** A portal write expressed in the bridge's terms (tab names and column headers). */
function toBridgeOp(o: WriteOp, sheet: SheetHeaders) {
  if (o.table === "papers") throw new Error("The submissions tab is owned by the Google Form; the portal never writes to it.");
  const tab = TABLE_TAB[o.table];
  const names = headerNames(o.table, sheet);
  const keyHeader = names[TABLE_KEY[o.table]];
  if (o.op === "insert") {
    return { op: "append", tab, headers: columnsFor(o.table).map((c) => names[c.key]), rows: o.rows.map((r) => toHeaderRow(o.table, r, names)) };
  }
  if (o.op === "update") return { op: "update", tab, keyHeader, key: o.key, patch: toHeaderRow(o.table, o.patch, names) };
  return { op: "delete", tab, keyHeader, key: o.key };
}

const headersOf = (tabs: TabValues[]): SheetHeaders => new Map(tabs.map((t) => [t.title, (t.values[0] ?? []).map(String)]));

/**
 * Google Sheets through an Apps Script web app bound to the spreadsheet (apps-script/Code.gs).
 * No Google Cloud project is needed: the script runs as the Sheet owner and checks a shared secret.
 */
export class AppsScriptStore extends BatchStore {
  private cache: { at: number; db: DB } | null = null;
  private inflight: Promise<DB> | null = null;
  private writes = 0; // a read that overlaps a write must not be cached
  private seeded: Promise<void> | null = null;
  private bridgeHasBatch = true; // scripts deployed before the "batch" op fall back to one call per op
  private sheetHeaders: SheetHeaders | null = null;

  constructor() {
    super();
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

  /**
   * SEED_DEMO_DATA=true: fill a brand-new Sheet (no accounts yet) with the demo accounts and reviews.
   * Once the Faculty tab has accounts nothing is seeded, so deleting the Assignments/Reviews/Decisions
   * tabs to start a demo over really leaves them empty.
   */
  private seedOnce(): Promise<void> {
    if (!config.seedDemoData) return Promise.resolve();
    this.seeded ??= (async () => {
      const tabs = await this.call<TabValues[]>("snapshot");
      this.sheetHeaders = headersOf(tabs);
      const current = parseSpreadsheet(tabs);
      if (current.faculty.length) {
        this.cache = { at: Date.now(), db: current };
        return;
      }
      const file = process.env.SEED_FILE ? path.resolve(process.env.SEED_FILE) : path.join(process.cwd(), "data", "seed.json");
      const seed = JSON.parse(readFileSync(file, "utf8")) as DB;
      const tables: Record<string, { headers: string[]; rows: Record<string, string | number>[] }> = {};
      for (const t of PORTAL_TABLES) {
        tables[TABLE_TAB[t]] = {
          headers: columnsFor(t).map((c) => c.header),
          rows: (seed[t] as unknown as Record<string, unknown>[]).map((r) => toHeaderRow(t, r, headerNames(t, new Map()))),
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

  async snapshot(opts: { fresh?: boolean } = {}): Promise<DB> {
    await this.seedOnce();
    if (!opts.fresh && this.cache && Date.now() - this.cache.at < CACHE_MS) return structuredClone(this.cache.db);
    // concurrent callers in the same render share one Apps Script round trip
    const writesAtStart = this.writes;
    if (!this.inflight) {
      const p: Promise<DB> = this.call<TabValues[]>("snapshot")
        .then((tabs) => {
          this.sheetHeaders = headersOf(tabs);
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

  async batch(ops: WriteOp[]): Promise<void> {
    if (!ops.length) return;
    if (!this.sheetHeaders) await this.snapshot(); // learn the Sheet's column names before writing
    const sheet = this.sheetHeaders ?? new Map();
    const bridgeOps = ops.map((o) => toBridgeOp(o, sheet));
    try {
      if (this.bridgeHasBatch) {
        await this.call("batch", { ops: bridgeOps });
      } else {
        for (const b of bridgeOps) await this.call(b.op, b);
      }
    } catch (e) {
      if (this.bridgeHasBatch && /Unknown operation: batch/.test(String(e))) {
        this.bridgeHasBatch = false; // older Code.gs: same writes, one call each
        return this.batch(ops);
      }
      this.cache = null; // unknown state after a failed write; read again next time
      this.inflight = null;
      this.writes++;
      throw e;
    }
    this.inflight = null; // reads started before this write are not reused
    this.writes++;
    if (this.cache) {
      // write-through: keep serving our own just-written data without another round trip
      try {
        this.cache = { at: Date.now(), db: applyOps(this.cache.db, ops) };
      } catch {
        this.cache = null;
      }
    }
  }
}
