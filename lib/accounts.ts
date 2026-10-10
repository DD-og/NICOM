import { config } from "./config";
import type { DB, SessionUser } from "./types";

export const ENV_ADMIN_PREFIX = "admin:";

/** Account for a login ID or email (case-insensitive). */
export function findByLogin(db: DB, login: string) {
  const l = login.trim().toLowerCase();
  if (!l) return undefined;
  return db.faculty.find((f) => f.username?.toLowerCase() === l || f.email.toLowerCase() === l);
}

/** Who may sign in with this email: an active Faculty-tab account, or a bootstrap admin from MASTER_ADMIN_EMAILS. */
export function resolveAccount(db: DB, email: string, displayName?: string): SessionUser | null {
  const e = email.toLowerCase();
  const row = db.faculty.find((f) => f.email.toLowerCase() === e);
  if (row) return row.active ? { id: row.id, name: row.name, email: row.email, role: row.role } : null;
  if (config.masterAdminEmails.includes(e)) return { id: `${ENV_ADMIN_PREFIX}${e}`, name: displayName || e, email: e, role: "master" };
  return null;
}
