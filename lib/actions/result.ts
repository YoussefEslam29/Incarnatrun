/**
 * The Server Action contract from PLAN/idea.md section 15.
 *
 * Every Server Action returns `{ success, message, data? }`. The `action()`
 * wrapper enforces it and turns anything thrown into that same shape, so an
 * unhandled exception can never reach the client as a Next.js error page in the
 * middle of a form submission. The frontend wires every result to a toast.
 */

import { UnauthorizedError } from "../auth";
import { EngineInputError, EngineNotConfiguredError } from "../avatar-engine/types";
import { GarmentMeshError } from "../clothing/mesh-import";
import { GarmentPhotoError } from "../clothing/photo-texture";
import { ExportNotAvailableError, UnknownExportFormatError } from "../export";
import { ObjectNotFoundError, StorageError } from "../storage";

export interface ActionResult<T = undefined> {
  success: boolean;
  message: string;
  data?: T;
  /** Field-level messages, keyed by form field name. */
  fieldErrors?: Record<string, string>;
}

export function ok<T>(data: T, message = "Done."): ActionResult<T> {
  return { success: true, message, data };
}

export function fail(
  message: string,
  fieldErrors?: Record<string, string>,
): ActionResult<never> {
  return { success: false, message, ...(fieldErrors ? { fieldErrors } : {}) };
}

/**
 * Turns a thrown value into a message worth showing a user.
 *
 * The error types listed here are the ones whose messages are written for
 * people. Anything else is logged and replaced, because a raw Prisma or Node
 * error leaks schema names and file paths and tells the user nothing they can
 * act on.
 */
export function messageForError(error: unknown): string {
  if (
    error instanceof UnauthorizedError ||
    error instanceof EngineInputError ||
    error instanceof EngineNotConfiguredError ||
    error instanceof GarmentMeshError ||
    error instanceof GarmentPhotoError ||
    error instanceof ExportNotAvailableError ||
    error instanceof UnknownExportFormatError ||
    error instanceof ObjectNotFoundError
  ) {
    return error.message;
  }

  if (error instanceof StorageError) {
    return "Could not save that file. Check the storage configuration and try again.";
  }

  const raw = error instanceof Error ? error.message : String(error);

  // Prisma's connection failures are the single most likely error on a fresh
  // clone, and its own message does not say what to do about it.
  if (/ECONNREFUSED|Can't reach database server|P1001/i.test(raw)) {
    return "Could not reach the database. Start it with `docker compose up -d`, then run `npm run db:push`.";
  }
  if (/P2002/.test(raw)) {
    return "That already exists.";
  }

  console.error("[action]", error);
  return "Something went wrong. Please try again.";
}

/**
 * Wraps a Server Action body so it always resolves to an ActionResult.
 *
 * Next.js redirect() and notFound() work by throwing, so those are rethrown
 * untouched; swallowing them would turn a redirect into a silent no-op.
 */
export async function action<T>(
  run: () => Promise<ActionResult<T>>,
): Promise<ActionResult<T>> {
  try {
    return await run();
  } catch (error) {
    if (isNextControlFlow(error)) throw error;
    return fail(messageForError(error)) as ActionResult<T>;
  }
}

/** Next.js signals redirect and not-found by throwing tagged errors. */
function isNextControlFlow(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const digest = (error as { digest?: unknown }).digest;
  return typeof digest === "string" && (digest.startsWith("NEXT_REDIRECT") || digest === "NEXT_NOT_FOUND");
}
