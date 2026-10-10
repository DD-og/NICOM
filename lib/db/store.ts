import type { DB } from "../types";
import type { Table } from "./schema";

/** One change to a table. Actions collect these and send them together with `batch`. */
export type WriteOp =
  | { op: "insert"; table: Table; rows: Record<string, unknown>[] }
  | { op: "update"; table: Table; key: string; patch: Record<string, unknown> }
  | { op: "remove"; table: Table; key: string };

export interface Store {
  /**
   * Full snapshot of every table. Data volumes are small (hundreds of rows), so reads are whole-table.
   * `fresh: true` skips any short-lived cache; actions use it before deciding what to write.
   */
  snapshot(opts?: { fresh?: boolean }): Promise<DB>;
  /** Apply several changes in one round trip (and, where the backend supports it, atomically). */
  batch(ops: WriteOp[]): Promise<void>;
  insert<T extends Table>(table: T, rows: DB[T][number][]): Promise<void>;
  update<T extends Table>(table: T, key: string, patch: Partial<DB[T][number]>): Promise<void>;
  remove(table: Table, key: string): Promise<void>;
}

/** insert/update/remove expressed through batch, so every backend only implements batch. */
export abstract class BatchStore implements Store {
  abstract snapshot(opts?: { fresh?: boolean }): Promise<DB>;
  abstract batch(ops: WriteOp[]): Promise<void>;

  insert<T extends Table>(table: T, rows: DB[T][number][]) {
    return rows.length ? this.batch([{ op: "insert", table, rows: rows as unknown as Record<string, unknown>[] }]) : Promise.resolve();
  }
  update<T extends Table>(table: T, key: string, patch: Partial<DB[T][number]>) {
    return this.batch([{ op: "update", table, key, patch: patch as Record<string, unknown> }]);
  }
  remove(table: Table, key: string) {
    return this.batch([{ op: "remove", table, key }]);
  }
}
