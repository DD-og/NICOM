import "server-only";
import { createHmac, randomBytes } from "node:crypto";
import type { Faculty } from "./types";

/**
 * Passwords sent in the "papers assigned" emails.
 *
 * The Sheet only ever holds password hashes, so a password can't be read back to put in an email.
 * Instead the portal derives each emailed password from SESSION_SECRET and a random per-person
 * "invite code" stored in the Faculty tab: the same inputs always give the same password, so the
 * email can show it again, while the code alone (without the server secret) reveals nothing.
 * Setting a password by hand on the Faculty page clears the code, so the email stops showing it.
 */
const ALPHABET = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no look-alikes (0/O, 1/l/I)

function secret(): string {
  const s = process.env.SESSION_SECRET;
  if (!s && process.env.NODE_ENV === "production") throw new Error("SESSION_SECRET must be set in production");
  return s || "nicom-dev-only-secret-do-not-use-in-production";
}

export function newInviteCode(): string {
  return randomBytes(12).toString("base64url");
}

/** The password for an invite code, e.g. "Xk7m-pR3q-Tz9a". */
export function invitePassword(facultyId: string, code: string): string {
  const mac = createHmac("sha256", secret()).update(`nicom-invite:${facultyId}:${code}`).digest();
  const chars = Array.from(mac.subarray(0, 12), (b) => ALPHABET[b % ALPHABET.length]).join("");
  return `${chars.slice(0, 4)}-${chars.slice(4, 8)}-${chars.slice(8, 12)}`;
}

/** The password to put in this reviewer's email, or null if none was created (or it was changed by hand). */
export function emailedPassword(f: Pick<Faculty, "id" | "inviteCode">): string | null {
  return f.inviteCode ? invitePassword(f.id, f.inviteCode) : null;
}
