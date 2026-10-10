import columns from "../sheet-columns.json";
import type { DB } from "../types";

export type Table = keyof DB;

export const TABLE_TAB: Record<Table, keyof typeof columns> = {
  papers: "Submissions",
  faculty: "Faculty",
  assignments: "Assignments",
  reviews: "Reviews",
  decisions: "Decisions",
};

export const TABLE_KEY: Record<Table, string> = {
  papers: "id",
  faculty: "id",
  assignments: "id",
  reviews: "id",
  decisions: "paperId",
};

export interface ColumnSpec {
  key: string;
  header: string;
  aliases: string[];
}

export function columnsFor(table: Table): ColumnSpec[] {
  return columns[TABLE_TAB[table]] as ColumnSpec[];
}

const NUMBER_KEYS = new Set(["maxLoad", "originality", "methodology", "relevance", "clarity", "overall"]);

/** Convert a raw sheet cell (string) into the typed value for `key`. */
export function fromCell(key: string, raw: unknown): unknown {
  const s = raw == null ? "" : String(raw).trim();
  if (key === "domains") return s ? s.split(/[,;]/).map((d) => d.trim()).filter(Boolean) : [];
  if (key === "active") return s === "" ? true : !/^(false|no|0|inactive)$/i.test(s);
  if (NUMBER_KEYS.has(key)) return s === "" ? 0 : Number(s);
  return s;
}

/** Convert a typed value into what we write into a sheet cell. */
export function toCell(value: unknown): string | number {
  if (Array.isArray(value)) return value.join(", ");
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  if (typeof value === "number") return value;
  return value == null ? "" : String(value);
}
