import { promises as fs } from "node:fs";
import path from "node:path";
import type { DB } from "../types";
import { applyOps } from "./ops";
import { BatchStore, type WriteOp } from "./store";

const DATA_DIR = path.join(process.cwd(), "data");
// LOCAL_DB_FILE lets the test suite use its own throwaway database.
const DB_FILE = process.env.LOCAL_DB_FILE ? path.resolve(process.env.LOCAL_DB_FILE) : path.join(DATA_DIR, "db.json");
const SEED_FILE = process.env.SEED_FILE ? path.resolve(process.env.SEED_FILE) : path.join(DATA_DIR, "seed.json");

/**
 * Demo backend: a JSON file seeded from data/seed.json. If the filesystem is
 * read-only (e.g. serverless hosting), it keeps working in memory only.
 */
export class LocalStore extends BatchStore {
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

  batch(ops: WriteOp[]) {
    // validate on a copy first so a failing op leaves nothing half-applied
    return this.mutate((db) => {
      const next = applyOps(structuredClone(db), ops);
      Object.assign(db, next);
    });
  }
}
