import columns from "../sheet-columns.json";
import { DOMAINS } from "../config";
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

const looseKey = (t: string) => t.toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "");
const KNOWN = new Map(DOMAINS.map((d) => [looseKey(d), d]));

/** A track spelled slightly differently ("&" vs "and", spacing, case) is read as the official track name. */
export function canonicalTrack(t: string): string {
  const s = t.trim();
  return KNOWN.get(looseKey(s)) ?? s;
}

/**
 * A faculty member's tracks are written "A; B". Older cells used commas, and track names can contain commas,
 * so comma lists are read by matching the longest known track name first.
 */
export function splitTracks(s: string): string[] {
  if (!s.trim()) return [];
  if (s.includes(";")) return s.split(";").map(canonicalTrack).filter(Boolean);
  const parts = s.split(",");
  const out: string[] = [];
  for (let i = 0; i < parts.length; ) {
    let j = parts.length;
    while (j > i + 1 && !KNOWN.has(looseKey(parts.slice(i, j).join(",")))) j--;
    const name = canonicalTrack(parts.slice(i, j).join(","));
    if (name) out.push(name);
    i = j;
  }
  return out;
}

/** Convert a raw sheet cell (string) into the typed value for `key`. */
export function fromCell(key: string, raw: unknown): unknown {
  const s = raw == null ? "" : String(raw).trim();
  if (key === "domains") return splitTracks(s);
  if (key === "domain") return canonicalTrack(s);
  if (key === "active") return s === "" ? true : !/^(false|no|0|inactive)$/i.test(s);
  if (NUMBER_KEYS.has(key)) return s === "" ? 0 : Number(s);
  return s;
}

/** Convert a typed value into what we write into a sheet cell. */
export function toCell(value: unknown): string | number {
  if (Array.isArray(value)) return value.join("; ");
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  if (typeof value === "number") return value;
  return value == null ? "" : String(value);
}
