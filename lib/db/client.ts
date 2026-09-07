/**
 * The Prisma client, as a singleton.
 *
 * Next.js hot-reloads modules in development, and a fresh PrismaClient per
 * reload exhausts the database's connection limit within a few edits. Stashing
 * it on globalThis is the documented way around that.
 */

import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

/**
 * True when a DATABASE_URL is configured at all.
 *
 * The app is usable without one for everything that does not persist, and the
 * UI says so plainly rather than showing a stack trace from the first query.
 */
export function isDatabaseConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

/** A one-line reason the database is unreachable, for the UI to show. */
export async function databaseStatus(): Promise<{ ok: boolean; message?: string }> {
  if (!isDatabaseConfigured()) {
    return {
      ok: false,
      message:
        "DATABASE_URL is not set. Copy .env.example to .env, then run `docker compose up -d` and `npm run db:push`.",
    };
  }

  try {
    await prisma.$queryRaw`SELECT 1`;
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error
          ? `Could not reach the database: ${error.message.split("\n")[0]}`
          : "Could not reach the database.",
    };
  }
}
