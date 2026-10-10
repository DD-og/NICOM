import { randomBytes } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { googleSignInEnabled } from "@/lib/config";
import { googleAuthUrl, OAUTH_STATE_COOKIE, redirectUri } from "@/lib/google-signin";

export function GET(req: NextRequest) {
  if (!googleSignInEnabled()) return NextResponse.redirect(new URL("/login?error=not_configured", req.url));
  const state = randomBytes(24).toString("base64url");
  const res = NextResponse.redirect(googleAuthUrl(redirectUri(req.nextUrl.origin), state));
  res.cookies.set(OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/auth/google",
    maxAge: 600,
  });
  return res;
}
