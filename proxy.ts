/**
 * Route protection.
 *
 * Next.js 16 renamed middleware to proxy; the exported function must be called
 * `proxy`.
 *
 * This only redirects. It reads whether a session cookie is present, which is
 * cheap and edge-safe, and sends anyone without one to sign in with a `next`
 * parameter so they land where they were going. It deliberately does not decide
 * authorisation: the real check is `auth()` inside each protected page, which
 * verifies the session properly. A proxy that merely sees a cookie must never
 * be the only thing standing between a request and someone's data.
 */

import { NextResponse, type NextRequest } from "next/server";
import { isProtectedPath } from "@/lib/auth/config";

const SESSION_COOKIES = [
  "authjs.session-token",
  "__Secure-authjs.session-token",
  "next-auth.session-token",
  "__Secure-next-auth.session-token",
];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (!isProtectedPath(pathname)) {
    return NextResponse.next();
  }

  const hasSession = SESSION_COOKIES.some((name) => request.cookies.has(name));
  if (hasSession) {
    return NextResponse.next();
  }

  const signIn = new URL("/sign-in", request.url);
  signIn.searchParams.set("next", pathname + request.nextUrl.search);
  return NextResponse.redirect(signIn);
}

export const config = {
  matcher: ["/dashboard/:path*", "/create/:path*", "/editor/:path*"],
};
