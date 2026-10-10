import "server-only";
import { OAuth2Client, type TokenPayload } from "google-auth-library";
import { config } from "./config";

export const OAUTH_STATE_COOKIE = "nicom_oauth_state";

/** Must exactly match an "Authorised redirect URI" on the Google OAuth client. */
export function redirectUri(requestOrigin: string) {
  return `${config.appUrl || requestOrigin}/auth/google/callback`;
}

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";

export function googleAuthUrl(redirectUri: string, state: string): string {
  const q = new URLSearchParams({
    client_id: config.googleClientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "openid email profile",
    state,
    hd: config.allowedDomain, // Google shows only accounts from this domain
    prompt: "select_account",
  });
  return `${AUTH_URL}?${q.toString()}`;
}

export type IdentityCheck = { ok: true; email: string; name: string } | { ok: false; reason: "unverified" | "domain" };

/** The `hd` hint is only a UI filter, so the domain is enforced again here on the verified token. */
export function checkIdentity(p: Pick<TokenPayload, "email" | "email_verified" | "hd" | "name">): IdentityCheck {
  const email = (p.email || "").toLowerCase();
  if (!email || !p.email_verified) return { ok: false, reason: "unverified" };
  if ((p.hd || "").toLowerCase() !== config.allowedDomain || !email.endsWith(`@${config.allowedDomain}`)) {
    return { ok: false, reason: "domain" };
  }
  return { ok: true, email, name: p.name || email };
}

/** Exchange the authorization code and verify the ID token's signature, audience and expiry. */
export async function verifyGoogleCode(code: string, redirectUri: string): Promise<TokenPayload> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: config.googleClientId,
      client_secret: config.googleClientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });
  if (!res.ok) throw new Error(`Google token exchange failed: ${res.status}`);
  const { id_token } = (await res.json()) as { id_token?: string };
  if (!id_token) throw new Error("Google did not return an ID token");
  const ticket = await new OAuth2Client(config.googleClientId).verifyIdToken({ idToken: id_token, audience: config.googleClientId });
  const payload = ticket.getPayload();
  if (!payload) throw new Error("Empty ID token");
  return payload;
}
