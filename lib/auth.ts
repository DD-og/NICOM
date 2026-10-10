import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ENV_ADMIN_PREFIX } from "./accounts";
import { config } from "./config";
import { store } from "./db";
import { SESSION_COOKIE, sessionMaxAge, signSession, verifySession } from "./session-token";
import type { Role, SessionUser } from "./types";

export { resolveAccount } from "./accounts";

/** Current user, re-checked against the data on every request so deactivation or role changes apply immediately. */
export async function getUser(): Promise<SessionUser | null> {
  const token = await verifySession((await cookies()).get(SESSION_COOKIE)?.value);
  if (!token) return null;
  if (token.id.startsWith(ENV_ADMIN_PREFIX)) {
    return config.masterAdminEmails.includes(token.email.toLowerCase()) ? token : null;
  }
  const db = await store().snapshot();
  const row = db.faculty.find((f) => f.id === token.id);
  if (!row || !row.active) return null;
  return { id: row.id, name: row.name, email: row.email, role: row.role };
}

export async function requireUser(role?: Role): Promise<SessionUser> {
  const user = await getUser();
  // A cookie that no longer maps to an active account must be cleared, or proxy.ts would bounce back here.
  if (!user) redirect((await cookies()).has(SESSION_COOKIE) ? "/auth/signout" : "/login");
  if (role && user.role !== role) redirect(user.role === "master" ? "/admin" : "/faculty");
  return user;
}

export async function startSession(user: SessionUser) {
  const store = await cookies();
  store.set(SESSION_COOKIE, await signSession(user), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: sessionMaxAge,
  });
}

export async function endSession() {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}
