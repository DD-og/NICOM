import { JWT } from "google-auth-library";
import type { DB } from "../types";
import { mapHeaders } from "./headers";
import { parseRows, pickTab, TABLES } from "./parse";
import { columnsFor, TABLE_KEY, TABLE_TAB, toCell, type Table } from "./schema";
import type { Store } from "./store";

const API = "https://sheets.googleapis.com/v4/spreadsheets";
// Short on purpose: on serverless hosting several instances run at once, so a long cache would show
// stale data after a save made on another instance. 1s still de-duplicates reads within one page render.
const CACHE_MS = 1_000;

type SheetMeta = { title: string; sheetId: number };

/** A1 column letter for a 0-based index. */
function colLetter(i: number): string {
  let s = "";
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}

export class SheetsStore implements Store {
  private auth: JWT;
  private sheetId: string;
  private cache: { at: number; db: DB } | null = null;
  private meta: SheetMeta[] | null = null;

  constructor() {
    const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
    const key = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n");
    const sheetId = process.env.GOOGLE_SHEET_ID;
    if (!email || !key || !sheetId) {
      throw new Error("DATA_BACKEND=sheets needs GOOGLE_SHEET_ID, GOOGLE_SERVICE_ACCOUNT_EMAIL and GOOGLE_PRIVATE_KEY");
    }
    this.sheetId = sheetId;
    this.auth = new JWT({ email, key, scopes: ["https://www.googleapis.com/auth/spreadsheets"] });
  }

  private async api<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
    const { token } = await this.auth.getAccessToken();
    const res = await fetch(`${API}/${this.sheetId}${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...init.headers },
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`Sheets API ${res.status}: ${await res.text()}`);
    return (await res.json()) as T;
  }

  private async sheets(refresh = false): Promise<SheetMeta[]> {
    if (!this.meta || refresh) {
      const data = await this.api<{ sheets: { properties: SheetMeta }[] }>("?fields=sheets.properties(title,sheetId)");
      this.meta = data.sheets.map((s) => s.properties);
    }
    return this.meta;
  }

  /** Resolve the tab title for a table. Form responses: SUBMISSIONS_TAB, else "Submissions", else the first tab. */
  private async tabFor(table: Table): Promise<SheetMeta | undefined> {
    return pickTab(await this.sheets(), table);
  }

  private async readTable(table: Table): Promise<{ tab: SheetMeta; headers: string[]; rows: string[][] } | null> {
    const tab = await this.tabFor(table);
    if (!tab) return null;
    const data = await this.api<{ values?: string[][] }>(`/values/${encodeURIComponent(`'${tab.title}'`)}`);
    const [headers = [], ...rows] = data.values ?? [];
    return { tab, headers, rows };
  }

  async snapshot(): Promise<DB> {
    if (this.cache && Date.now() - this.cache.at < CACHE_MS) return structuredClone(this.cache.db);
    const db = { papers: [], faculty: [], assignments: [], reviews: [], decisions: [] } as unknown as DB;
    await Promise.all(
      TABLES.map(async (table) => {
        const t = await this.readTable(table);
        if (!t) return;
        const list = parseRows(table, t.headers, t.rows);
        (db as unknown as Record<Table, unknown[]>)[table] = list;
      }),
    );
    this.cache = { at: Date.now(), db };
    return structuredClone(db);
  }

  /** Create the tab if missing and append any missing headers. Returns the final header row. */
  async ensureTab(table: Table): Promise<string[]> {
    if (table === "papers") throw new Error("The submissions tab is owned by the Google Form; the portal never writes to it.");
    const title = TABLE_TAB[table];
    let tab = await this.tabFor(table);
    if (!tab) {
      await this.api(":batchUpdate", {
        method: "POST",
        body: JSON.stringify({ requests: [{ addSheet: { properties: { title, gridProperties: { frozenRowCount: 1 } } } }] }),
      });
      await this.sheets(true);
      tab = await this.tabFor(table);
    }
    const t = await this.readTable(table);
    const headers = [...(t?.headers ?? [])];
    const idx = mapHeaders(headers, columnsFor(table));
    const missing = columnsFor(table).filter((c) => idx[c.key] == null);
    if (missing.length) {
      const start = headers.length;
      headers.push(...missing.map((c) => c.header));
      const range = `'${title}'!${colLetter(start)}1:${colLetter(headers.length - 1)}1`;
      await this.api(`/values/${encodeURIComponent(range)}?valueInputOption=RAW`, {
        method: "PUT",
        body: JSON.stringify({ values: [missing.map((c) => c.header)] }),
      });
    }
    return headers;
  }

  async insert<T extends Table>(table: T, rows: DB[T][number][]) {
    if (!rows.length) return;
    const headers = await this.ensureTab(table);
    const idx = mapHeaders(headers, columnsFor(table));
    const values = rows.map((r) => {
      const line: (string | number)[] = new Array(headers.length).fill("");
      for (const [key, i] of Object.entries(idx)) line[i] = toCell((r as unknown as Record<string, unknown>)[key]);
      return line;
    });
    const range = encodeURIComponent(`'${TABLE_TAB[table]}'!A1`);
    await this.api(`/values/${range}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`, {
      method: "POST",
      body: JSON.stringify({ values }),
    });
    this.cache = null;
  }

  private async locate(table: Table, key: string) {
    const headers = await this.ensureTab(table);
    const idx = mapHeaders(headers, columnsFor(table));
    const t = await this.readTable(table);
    const keyCol = idx[TABLE_KEY[table]];
    const rowIndex = t!.rows.findIndex((r) => String(r[keyCol] ?? "").trim() === key);
    if (rowIndex < 0) throw new Error(`${table} ${key} not found in sheet`);
    return { tab: t!.tab, idx, sheetRow: rowIndex + 2 }; // +1 header, +1 for 1-based rows
  }

  async update<T extends Table>(table: T, key: string, patch: Partial<DB[T][number]>) {
    const { tab, idx, sheetRow } = await this.locate(table, key);
    const data = Object.entries(patch)
      .filter(([k]) => idx[k] != null)
      .map(([k, v]) => ({ range: `'${tab.title}'!${colLetter(idx[k])}${sheetRow}`, values: [[toCell(v)]] }));
    if (data.length) {
      await this.api("/values:batchUpdate", { method: "POST", body: JSON.stringify({ valueInputOption: "RAW", data }) });
    }
    this.cache = null;
  }

  async remove(table: Table, key: string) {
    const { tab, sheetRow } = await this.locate(table, key);
    await this.api(":batchUpdate", {
      method: "POST",
      body: JSON.stringify({
        requests: [
          { deleteDimension: { range: { sheetId: tab.sheetId, dimension: "ROWS", startIndex: sheetRow - 1, endIndex: sheetRow } } },
        ],
      }),
    });
    this.cache = null;
  }
}
export { mapHeaders } from "./headers";
