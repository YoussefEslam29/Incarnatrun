/**
 * Auth.js wiring: the Prisma adapter, a credentials provider, and the helpers
 * the rest of the app uses to find out who is signed in.
 *
 * Email and password rather than an OAuth provider, because OAuth needs a
 * client id and secret per provider before anyone can sign in at all, and this
 * app is meant to run on a fresh clone. Adding GitHub or Google later is one
 * entry in the providers array.
 */

import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "../db/client";
import { authConfig } from "./config";

export const credentialsSchema = z.object({
  email: z.string().email("Enter a valid email address.").toLowerCase(),
  password: z.string().min(8, "Passwords must be at least 8 characters."),
});

export const signUpSchema = credentialsSchema.extend({
  name: z
    .string()
    .trim()
    .min(1, "Enter your name.")
    .max(60, "That name is too long.")
    .optional(),
});

/** Cost factor. 12 is the usual balance of safety against sign-in latency. */
const BCRYPT_ROUNDS = 12;

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  adapter: PrismaAdapter(prisma),
  providers: [
    Credentials({
      name: "Email and password",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(raw) {
        const parsed = credentialsSchema.safeParse(raw);
        if (!parsed.success) return null;

        const user = await prisma.user.findUnique({
          where: { email: parsed.data.email },
        });

        // Compare against a dummy hash when the user does not exist, so that a
        // missing account and a wrong password take the same time to answer.
        // Skipping it makes account enumeration trivial from response timing.
        const hash =
          user?.passwordHash ??
          "$2a$12$0000000000000000000000000000000000000000000000000000";

        const valid = await bcrypt.compare(parsed.data.password, hash);
        if (!user?.passwordHash || !valid) return null;

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          image: user.image,
        };
      },
    }),
  ],
});

/** The signed-in user's id, or null. */
export async function currentUserId(): Promise<string | null> {
  const session = await auth();
  return session?.user?.id ?? null;
}

/**
 * The signed-in user's id, or throws.
 *
 * Server Actions use this so an unauthenticated call fails loudly at the top of
 * the action rather than quietly operating on `undefined` as a user id.
 */
export async function requireUserId(): Promise<string> {
  const id = await currentUserId();
  if (!id) {
    throw new UnauthorizedError();
  }
  return id;
}

export class UnauthorizedError extends Error {
  constructor(message = "You need to be signed in to do that.") {
    super(message);
    this.name = "UnauthorizedError";
  }
}
