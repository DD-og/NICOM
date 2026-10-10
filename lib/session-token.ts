// Edge-safe session token helpers (used by proxy.ts and server code).
import { SignJWT, jwtVerify } from "jose";
import type { SessionUser } from "./types";

export const SESSION_COOKIE = "nicom_session";
const MAX_AGE_SECONDS = 60 * 60 * 12;

function secret() {
  const s = process.env.SESSION_SECRET;
  if (!s && process.env.NODE_ENV === "production") {
    throw new Error("SESSION_SECRET must be set in production");
  }
  return new TextEncoder().encode(s || "nicom-dev-only-secret-do-not-use-in-production");
}

export async function signSession(user: SessionUser): Promise<string> {
  return new SignJWT({ ...user })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE_SECONDS}s`)
    .sign(secret());
}

export async function verifySession(token: string | undefined): Promise<SessionUser | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    const { id, name, email, role } = payload as unknown as SessionUser;
    if (!id || (role !== "master" && role !== "faculty")) return null;
    return { id, name, email, role };
  } catch {
    return null;
  }
}

export const sessionMaxAge = MAX_AGE_SECONDS;
