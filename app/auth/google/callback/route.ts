import { NextResponse, type NextRequest } from "next/server";
import { resolveAccount, startSession } from "@/lib/auth";
import { googleSignInEnabled } from "@/lib/config";
import { store } from "@/lib/db";
import { checkIdentity, OAUTH_STATE_COOKIE, redirectUri, verifyGoogleCode } from "@/lib/google-signin";

export async function GET(req: NextRequest) {
  const fail = (error: string) => {
    const res = NextResponse.redirect(new URL(`/login?error=${error}`, req.url));
    res.cookies.delete({ name: OAUTH_STATE_COOKIE, path: "/auth/google" });
    return res;
  };
  if (!googleSignInEnabled()) return fail("not_configured");

  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  if (req.nextUrl.searchParams.get("error")) return fail("cancelled");
  if (!code || !state || state !== req.cookies.get(OAUTH_STATE_COOKIE)?.value) return fail("state");

  let identity;
  try {
    identity = checkIdentity(await verifyGoogleCode(code, redirectUri(req.nextUrl.origin)));
  } catch (e) {
    console.error("[nicom] Google sign-in failed", e);
    return fail("google");
  }
  if (!identity.ok) return fail(identity.reason);

  const user = resolveAccount(await store().snapshot(), identity.email, identity.name);
  if (!user) return fail("not_registered");
  await startSession(user);

  const res = NextResponse.redirect(new URL(user.role === "master" ? "/admin" : "/faculty", req.url));
  res.cookies.delete({ name: OAUTH_STATE_COOKIE, path: "/auth/google" });
  return res;
}
