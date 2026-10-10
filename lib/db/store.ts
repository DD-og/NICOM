import type { DB } from "../types";
import type { Table } from "./schema";

export interface Store {
  /** Full snapshot of every table. Data volumes are small (hundreds of rows), so reads are whole-table. */
  snapshot(): Promise<DB>;
  insert<T extends Table>(table: T, rows: DB[T][number][]): Promise<void>;
  update<T extends Table>(table: T, key: string, patch: Partial<DB[T][number]>): Promise<void>;
  remove(table: Table, key: string): Promise<void>;
}
