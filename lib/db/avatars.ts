/**
 * Avatar persistence.
 *
 * Every read is scoped by userId. Passing an avatar id alone would let anyone
 * who guesses an id read or edit someone else's avatar, so the ownership check
 * lives in the query rather than in each caller where it can be forgotten.
 */

import type { AvatarStatus, CreationPath, Prisma } from "@prisma/client";
import { prisma } from "./client";
import {
  avatarParamsSchema,
  bodyParamsSchema,
  faceParamsSchema,
  outfitSchema,
  type AvatarParams,
  type BodyParams,
  type FaceParams,
  type Outfit,
} from "../avatar-engine/params";

export type AvatarWithVersion = Prisma.AvatarGetPayload<{
  include: { currentVersion: true };
}>;

/** Parses the JSON columns back into validated parameter objects. */
export function paramsFromVersion(version: {
  bodyParams: Prisma.JsonValue;
  faceParams: Prisma.JsonValue;
  outfit: Prisma.JsonValue;
}): AvatarParams {
  // Stored rows can predate a schema change, so parse rather than cast. A
  // failed parse falls back to defaults instead of crashing the editor.
  const body = bodyParamsSchema.safeParse(version.bodyParams);
  const face = faceParamsSchema.safeParse(version.faceParams);
  const outfit = outfitSchema.safeParse(version.outfit);

  return avatarParamsSchema.parse({
    body: body.success ? body.data : {},
    face: face.success ? face.data : {},
    outfit: outfit.success ? outfit.data : {},
  });
}

export function listAvatars(userId: string) {
  return prisma.avatar.findMany({
    where: { userId },
    include: { currentVersion: true },
    orderBy: { updatedAt: "desc" },
  });
}

export function getAvatar(userId: string, avatarId: string) {
  return prisma.avatar.findFirst({
    where: { id: avatarId, userId },
    include: { currentVersion: true },
  });
}

export function countAvatars(userId: string) {
  return prisma.avatar.count({ where: { userId } });
}

export interface CreatePendingAvatarInput {
  userId: string;
  name: string;
  path: CreationPath;
  engineProvider: string;
}

/**
 * Creates the avatar row before generation starts.
 *
 * The row comes first because storage keys are derived from the avatar's id,
 * and the id has to be the real one. Reserving an id client-side and hoping the
 * database agrees leaves every file filed under a key nothing can find again.
 *
 * It also means a generation that dies partway leaves a FAILED avatar the user
 * can see and retry, rather than nothing at all.
 */
export function createPendingAvatar(input: CreatePendingAvatarInput) {
  return prisma.avatar.create({
    data: {
      userId: input.userId,
      name: input.name,
      path: input.path,
      status: "GENERATING",
      engineProvider: input.engineProvider,
    },
  });
}

/** Records where the uploaded photo was stored. */
export async function setAvatarSourcePhoto(avatarId: string, key: string) {
  await prisma.avatar.update({ where: { id: avatarId }, data: { sourcePhotoKey: key } });
}

export interface AddVersionInput {
  userId: string;
  avatarId: string;
  body: BodyParams;
  face: FaceParams;
  outfit: Outfit;
  modelKey?: string;
  thumbnailKey?: string;
}

/**
 * Appends a new version and makes it current.
 *
 * Editing never mutates an existing version. That is what makes avatars
 * re-editable rather than one-shot, per idea.md section 3, and it gives edit
 * history for nothing.
 */
export async function addAvatarVersion(input: AddVersionInput) {
  return prisma.$transaction(async (tx) => {
    const avatar = await tx.avatar.findFirst({
      where: { id: input.avatarId, userId: input.userId },
      select: { id: true },
    });

    if (!avatar) {
      throw new Error("That avatar could not be found.");
    }

    const latest = await tx.avatarVersion.findFirst({
      where: { avatarId: input.avatarId },
      orderBy: { version: "desc" },
      select: { version: true },
    });

    const version = await tx.avatarVersion.create({
      data: {
        avatarId: input.avatarId,
        version: (latest?.version ?? 0) + 1,
        bodyParams: input.body as unknown as Prisma.InputJsonValue,
        faceParams: input.face as unknown as Prisma.InputJsonValue,
        outfit: input.outfit as unknown as Prisma.InputJsonValue,
        modelKey: input.modelKey,
        thumbnailKey: input.thumbnailKey,
      },
    });

    return tx.avatar.update({
      where: { id: input.avatarId },
      data: { currentVersionId: version.id, status: "READY", failureReason: null },
      include: { currentVersion: true },
    });
  });
}

export function listVersions(userId: string, avatarId: string) {
  return prisma.avatarVersion.findMany({
    where: { avatarId, avatar: { userId } },
    orderBy: { version: "desc" },
    take: 30,
  });
}

export async function renameAvatar(userId: string, avatarId: string, name: string) {
  const result = await prisma.avatar.updateMany({
    where: { id: avatarId, userId },
    data: { name },
  });
  return result.count > 0;
}

export async function deleteAvatar(userId: string, avatarId: string) {
  const result = await prisma.avatar.deleteMany({ where: { id: avatarId, userId } });
  return result.count > 0;
}

export async function markAvatarFailed(avatarId: string, reason: string) {
  await prisma.avatar.update({
    where: { id: avatarId },
    data: { status: "FAILED" as AvatarStatus, failureReason: reason },
  });
}

/** Storage keys owned by an avatar, so deleting one can clean up after itself. */
export async function avatarStorageKeys(userId: string, avatarId: string): Promise<string[]> {
  const avatar = await prisma.avatar.findFirst({
    where: { id: avatarId, userId },
    include: { versions: true },
  });

  if (!avatar) return [];

  const keys: string[] = [];
  if (avatar.sourcePhotoKey) keys.push(avatar.sourcePhotoKey);
  for (const version of avatar.versions) {
    if (version.modelKey) keys.push(version.modelKey);
    if (version.thumbnailKey) keys.push(version.thumbnailKey);
  }
  return keys;
}
