import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, sessionMaxAge, signSession, verifySession } from "./session-token";
import type { Role, SessionUser } from "./types";

export async function getUser(): Promise<SessionUser | null> {
  const store = await cookies();
  return verifySession(store.get(SESSION_COOKIE)?.value);
}

export async function requireUser(role?: Role): Promise<SessionUser> {
  const user = await getUser();
  if (!user) redirect("/login");
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
