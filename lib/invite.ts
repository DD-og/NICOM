import "server-only";
import { createHmac, randomBytes } from "node:crypto";
import type { Faculty } from "./types";

/**
 * Passwords sent in the "papers assigned" emails: the reviewer's first name and 4 digits, e.g. "ananya7392".
 *
 * The Sheet only ever holds password hashes, so a password can't be read back to put in an email.
 * Instead the 4 digits are derived from SESSION_SECRET and a random per-person "invite code" stored in the
 * Faculty tab ("ananya.<random>", so renaming someone later doesn't change it): the same inputs always give
 * the same password, so the email can show it again, while the code alone (without the server secret)
 * reveals nothing. Setting a password by hand on the Faculty page clears the code, so the email stops showing it.
 */
const ALPHABET = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no look-alikes (0/O, 1/l/I)

function secret(): string {
  const s = process.env.SESSION_SECRET;
  if (!s && process.env.NODE_ENV === "production") throw new Error("SESSION_SECRET must be set in production");
  return s || "nicom-dev-only-secret-do-not-use-in-production";
}

/** "Prof. M. Mallikarjun" -> "mallikarjun": the first real word of the name, lowercase, letters only. */
export function firstName(f: Pick<Faculty, "name" | "username">): string {
  const words = f.name.toLowerCase().replace(/^(?:\s*(?:prof|dr|mr|mrs|ms|shri|smt)\b\.?)+/, "").split(/\s+/);
  const word = words.map((w) => w.replace(/[^a-z]/g, "")).find((w) => w.length > 1);
  return word || f.username.toLowerCase().replace(/[^a-z]/g, "") || "nicom";
}

export function newInviteCode(f: Pick<Faculty, "name" | "username">): string {
  return `${firstName(f)}.${randomBytes(12).toString("base64url")}`;
}

/** The password for an invite code, e.g. "ananya7392". */
export function invitePassword(facultyId: string, code: string): string {
  const mac = createHmac("sha256", secret()).update(`nicom-invite:${facultyId}:${code}`).digest();
  const dot = code.indexOf(".");
  if (dot > 0) return `${code.slice(0, dot)}${String(mac.readUInt32BE(0) % 10_000).padStart(4, "0")}`;
  // Codes made before the first-name format (no "."): the password already set for them, e.g. "Xk7m-pR3q-Tz9a".
  const chars = Array.from(mac.subarray(0, 12), (b) => ALPHABET[b % ALPHABET.length]).join("");
  return `${chars.slice(0, 4)}-${chars.slice(4, 8)}-${chars.slice(8, 12)}`;
}

/** The password to put in this reviewer's email, or null if none was created (or it was changed by hand). */
export function emailedPassword(f: Pick<Faculty, "id" | "inviteCode">): string | null {
  return f.inviteCode ? invitePassword(f.id, f.inviteCode) : null;
}
