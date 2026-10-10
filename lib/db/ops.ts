import type { DB } from "../types";
import { TABLE_KEY, type Table } from "./schema";
import type { WriteOp } from "./store";

type Rows = Record<string, unknown>[];

/** Apply write operations to an in-memory snapshot (mutates and returns it). Same semantics as the Sheet bridge. */
export function applyOps(db: DB, ops: WriteOp[]): DB {
  const t = db as unknown as Record<Table, Rows>;
  for (const o of ops) {
    const key = TABLE_KEY[o.table];
    if (o.op === "insert") {
      t[o.table].push(...structuredClone(o.rows));
    } else if (o.op === "update") {
      const row = t[o.table].find((r) => r[key] === o.key);
      if (!row) throw new Error(`${o.table} ${o.key} not found`);
      Object.assign(row, structuredClone(o.patch));
    } else {
      t[o.table] = t[o.table].filter((r) => r[key] !== o.key);
    }
  }
  return db;
}
