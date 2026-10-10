import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/lib/session-token";

/** Clears a session whose account was deactivated or changed, so the proxy stops trusting the stale cookie. */
export function GET(req: NextRequest) {
  const res = NextResponse.redirect(new URL("/login?error=session_ended", req.url));
  res.cookies.delete(SESSION_COOKIE);
  return res;
}
