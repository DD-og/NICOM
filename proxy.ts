import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySession } from "./lib/session-token";

// Optimistic routing only; every page and server action re-checks the session and role.
export async function proxy(req: NextRequest) {
  const user = await verifySession(req.cookies.get(SESSION_COOKIE)?.value);
  const { pathname } = req.nextUrl;
  const home = user?.role === "master" ? "/admin" : "/faculty";

  if (pathname === "/login") return user ? NextResponse.redirect(new URL(home, req.url)) : NextResponse.next();
  if (!user) return NextResponse.redirect(new URL("/login", req.url));
  if (pathname.startsWith("/admin") && user.role !== "master") return NextResponse.redirect(new URL("/faculty", req.url));
  if (pathname.startsWith("/faculty") && user.role !== "faculty") return NextResponse.redirect(new URL("/admin", req.url));
  if (pathname === "/") return NextResponse.redirect(new URL(home, req.url));
  return NextResponse.next();
}

export const config = {
  matcher: ["/", "/login", "/admin/:path*", "/faculty/:path*"],
};
