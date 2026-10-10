import { config } from "../config";
import type { DB } from "../types";
import { columnsFor, fromCell, TABLE_TAB, type Table } from "./schema";
import { mapHeaders } from "./headers";

export const TABLES: Table[] = ["papers", "faculty", "assignments", "reviews", "decisions"];

export type TabValues = { title: string; values: string[][] };

/** Which tab holds a table. Form responses: SUBMISSIONS_TAB, else "Submissions", else the first tab. */
export function pickTab<T extends { title: string }>(tabs: T[], table: Table): T | undefined {
  if (table === "papers") {
    const wanted = process.env.SUBMISSIONS_TAB || "Submissions";
    return tabs.find((t) => t.title === wanted) ?? (process.env.SUBMISSIONS_TAB ? undefined : tabs[0]);
  }
  return tabs.find((t) => t.title === TABLE_TAB[table]);
}

/** Turn one tab's header + rows into typed records. */
export function parseRows(table: Table, headers: string[], rows: string[][]): Record<string, unknown>[] {
  const spec = columnsFor(table);
  const idx = mapHeaders(headers, spec);
  const out: Record<string, unknown>[] = [];
  rows.forEach((cells, i) => {
    if (!cells.some((c) => String(c ?? "").trim())) return; // skip blank rows
    const row: Record<string, unknown> = {};
    for (const c of spec) row[c.key] = fromCell(c.key, idx[c.key] != null ? cells[idx[c.key]] : "");
    if (table === "papers" && !row.id) row.id = `${config.paperIdPrefix}${String(i + 1).padStart(3, "0")}`;
    out.push(row);
  });
  return out;
}

export function parseSpreadsheet(tabs: TabValues[]): DB {
  const db = {} as Record<Table, unknown[]>;
  for (const table of TABLES) {
    const tab = pickTab(tabs, table);
    const [headers = [], ...rows] = tab?.values ?? [];
    db[table] = tab ? parseRows(table, headers, rows) : [];
  }
  return db as unknown as DB;
}
