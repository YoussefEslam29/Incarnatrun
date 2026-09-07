/**
 * Upload limits, shared by the browser and the server.
 *
 * In their own module with no dependencies, because the create form needs them
 * to reject a wrong file instantly, and importing them from the service would
 * drag `sharp` and Prisma into the client bundle. The server enforces the same
 * numbers; the client check is only there to save a round trip.
 */

export const MAX_PHOTO_BYTES = 12 * 1024 * 1024;

export const ACCEPTED_PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

export type AcceptedPhotoType = (typeof ACCEPTED_PHOTO_TYPES)[number];
