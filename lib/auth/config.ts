/**
 * Auth.js configuration.
 *
 * Split from `lib/auth/index.ts` so the parts that must run on the edge (the
 * callbacks the proxy consults) stay free of Node-only imports like Prisma and
 * bcrypt. Importing the adapter into edge code is the usual way this breaks.
 */

import type { NextAuthConfig } from "next-auth";

/** Routes that require a signed-in user. */
export const PROTECTED_PREFIXES = ["/dashboard", "/create", "/editor"] as const;

export function isProtectedPath(pathname: string): boolean {
  return PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

export const authConfig = {
  pages: {
    signIn: "/sign-in",
    error: "/sign-in",
  },
  session: {
    // Required: the Credentials provider cannot use database sessions.
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60,
  },
  callbacks: {
    jwt({ token, user, trigger, session }) {
      if (user) {
        token.id = user.id;
      }
      // Keeps the header's name in step after a profile rename without
      // forcing the user to sign out and back in.
      if (trigger === "update" && session?.user?.name) {
        token.name = session.user.name as string;
      }
      return token;
    },
    session({ session, token }) {
      if (token.id && session.user) {
        session.user.id = token.id as string;
      }
      return session;
    },
    authorized({ auth, request }) {
      const signedIn = Boolean(auth?.user);
      return isProtectedPath(request.nextUrl.pathname) ? signedIn : true;
    },
  },
  providers: [],
} satisfies NextAuthConfig;
