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

/** Row object keyed by the Sheet's column headers, as the Apps Script expects. */
function toHeaderRow(table: Table, row: Record<string, unknown>) {
  const out: Record<string, string | number> = {};
  for (const c of columnsFor(table)) if (c.key in row) out[c.header] = toCell(row[c.key]);
  return out;
}

const keyHeader = (table: Table) => columnsFor(table).find((c) => c.key === TABLE_KEY[table])!.header;

/** A portal write expressed in the bridge's terms (tab names and column headers). */
function toBridgeOp(o: WriteOp) {
  if (o.table === "papers") throw new Error("The submissions tab is owned by the Google Form; the portal never writes to it.");
  const tab = TABLE_TAB[o.table];
  if (o.op === "insert") {
    return { op: "append", tab, headers: columnsFor(o.table).map((c) => c.header), rows: o.rows.map((r) => toHeaderRow(o.table, r)) };
  }
  if (o.op === "update") return { op: "update", tab, keyHeader: keyHeader(o.table), key: o.key, patch: toHeaderRow(o.table, o.patch) };
  return { op: "delete", tab, keyHeader: keyHeader(o.table), key: o.key };
}

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

  async snapshot(opts: { fresh?: boolean } = {}): Promise<DB> {
    await this.seedOnce();
    if (!opts.fresh && this.cache && Date.now() - this.cache.at < CACHE_MS) return structuredClone(this.cache.db);
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

  async batch(ops: WriteOp[]): Promise<void> {
    if (!ops.length) return;
    const bridgeOps = ops.map(toBridgeOp);
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
