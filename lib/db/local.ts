import { promises as fs } from "node:fs";
import path from "node:path";
import type { DB } from "../types";
import { TABLE_KEY, type Table } from "./schema";
import type { Store } from "./store";

const DATA_DIR = path.join(process.cwd(), "data");
// LOCAL_DB_FILE lets the test suite use its own throwaway database.
const DB_FILE = process.env.LOCAL_DB_FILE ? path.resolve(process.env.LOCAL_DB_FILE) : path.join(DATA_DIR, "db.json");
const SEED_FILE = process.env.SEED_FILE ? path.resolve(process.env.SEED_FILE) : path.join(DATA_DIR, "seed.json");

/**
 * Demo backend: a JSON file seeded from data/seed.json. If the filesystem is
 * read-only (e.g. serverless hosting), it keeps working in memory only.
 */
export class LocalStore implements Store {
  private cache: DB | null = null;
  private writable = true;
  private queue: Promise<unknown> = Promise.resolve();

  private async load(): Promise<DB> {
    if (this.cache) return this.cache;
    let raw: string;
    try {
      raw = await fs.readFile(DB_FILE, "utf8");
    } catch {
      raw = await fs.readFile(SEED_FILE, "utf8");
    }
    const parsed = JSON.parse(raw);
    this.cache = {
      papers: parsed.papers ?? [],
      faculty: parsed.faculty ?? [],
      assignments: parsed.assignments ?? [],
      reviews: parsed.reviews ?? [],
      decisions: parsed.decisions ?? [],
    };
    return this.cache;
  }

  private async persist(db: DB) {
    if (!this.writable) return;
    try {
      await fs.writeFile(DB_FILE, JSON.stringify(db, null, 2));
    } catch (err) {
      this.writable = false;
      console.warn("[nicom] data/ is not writable; demo changes are kept in memory only.", err);
    }
  }

  private mutate(fn: (db: DB) => void): Promise<void> {
    const run = this.queue.then(async () => {
      const db = await this.load();
      fn(db);
      await this.persist(db);
    });
    this.queue = run.catch(() => undefined);
    return run;
  }

  async snapshot(): Promise<DB> {
    await this.queue;
    return structuredClone(await this.load());
  }

  insert<T extends Table>(table: T, rows: DB[T][number][]) {
    return this.mutate((db) => {
      (db[table] as DB[T][number][]).push(...structuredClone(rows));
    });
  }

  update<T extends Table>(table: T, key: string, patch: Partial<DB[T][number]>) {
    return this.mutate((db) => {
      const k = TABLE_KEY[table];
      const row = (db[table] as unknown as Record<string, unknown>[]).find((r) => r[k] === key);
      if (!row) throw new Error(`${table} ${key} not found`);
      Object.assign(row, patch);
    });
  }

  remove(table: Table, key: string) {
    return this.mutate((db) => {
      const k = TABLE_KEY[table];
      (db as unknown as Record<Table, Record<string, unknown>[]>)[table] = (
        db[table] as unknown as Record<string, unknown>[]
      ).filter((r) => r[k] !== key);
    });
  }
}
