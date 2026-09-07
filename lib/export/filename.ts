/**
 * Filename helpers.
 *
 * In their own module so the format writers can use them without importing the
 * registry that imports the format writers.
 */

/** Turns an avatar name into something safe for a Content-Disposition header. */
export function safeFilename(name: string): string {
  const cleaned = name
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .toLowerCase()
    .slice(0, 60);

  return cleaned || "avatar";
}
