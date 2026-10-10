import type { ColumnSpec } from "./schema";

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/** Map each column spec to its index in the header row (exact match first, then "contains" for long form questions). */
export function mapHeaders(headers: string[], spec: ColumnSpec[]): Record<string, number> {
  const normalized = headers.map((h) => norm(h || ""));
  const out: Record<string, number> = {};
  const used = new Set<number>();
  for (const c of spec) {
    const names = [c.header, ...c.aliases].map(norm);
    let idx = normalized.findIndex((h, i) => !used.has(i) && names.includes(h));
    if (idx < 0) idx = normalized.findIndex((h, i) => !used.has(i) && h && names.some((n) => h.includes(n)));
    if (idx >= 0) {
      out[c.key] = idx;
      used.add(idx);
    }
  }
  return out;
}
