/**
 * The avatar service: the one place that coordinates the engine, storage and
 * the database.
 *
 * Server Actions and route handlers call into here rather than orchestrating
 * those three themselves, so the ordering rules live in one file. The important
 * one is that files are written to storage before the row that references them
 * is committed: a row pointing at a missing object shows the user a broken
 * avatar, whereas an object with no row is invisible and harmless.
 */

import { getAvatarEngine } from "../avatar-engine";
import { defaultFaceParams, type AvatarParams, type BodyParams, type FaceParams, type Outfit } from "../avatar-engine/params";
import type { CreationPath } from "../avatar-engine/types";
import { buildAvatarGlb } from "../avatar-engine/build-avatar-glb";
import { buildHumanoid, type HumanoidMesh } from "../avatar-engine/geometry/humanoid";
import { buildSkeleton, type Skeleton } from "../avatar-engine/geometry/skeleton";
import type { SkinnedMesh } from "../avatar-engine/geometry/mesh";
import { renderAvatarAtlasPng } from "../avatar-engine/texture/atlas";
import { garmentTemplate } from "../clothing/templates";
import { importGarmentMesh } from "../clothing/mesh-import";
import { fitGarmentToBody } from "../clothing/fit";
import {
  addAvatarVersion,
  createPendingAvatar,
  getAvatar,
  markAvatarFailed,
  setAvatarSourcePhoto,
} from "../db/avatars";
import { resolveOutfit } from "../db/garments";
import { getStorage, storageKeys } from "../storage";

/** Upload limits, enforced before anything reads the bytes. */
export const MAX_PHOTO_BYTES = 12 * 1024 * 1024;
export const ACCEPTED_PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

export class UploadRejected extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UploadRejected";
  }
}

/**
 * Checks an uploaded photo before it reaches the engine.
 *
 * Type and size are checked from the File metadata, which is cheap, so a 200 MB
 * upload is refused without ever being read into memory.
 */
export function assertAcceptablePhoto(file: File): void {
  if (file.size === 0) {
    throw new UploadRejected("That file is empty.");
  }
  if (file.size > MAX_PHOTO_BYTES) {
    throw new UploadRejected(
      `That photo is ${(file.size / 1024 / 1024).toFixed(1)} MB. The limit is ${MAX_PHOTO_BYTES / 1024 / 1024} MB.`,
    );
  }
  if (!ACCEPTED_PHOTO_TYPES.includes(file.type as (typeof ACCEPTED_PHOTO_TYPES)[number])) {
    throw new UploadRejected(
      `${file.type || "That file type"} is not supported. Upload a JPEG, PNG or WebP image.`,
    );
  }
}

function extensionFor(mimeType: string): string {
  if (mimeType === "image/png") return "png";
  if (mimeType === "image/webp") return "webp";
  return "jpg";
}

export interface CreateAvatarResult {
  avatarId: string;
  warnings: string[];
}

/** Path A and Path B both land here; only `path` differs. */
export async function createAvatarFromPhoto(options: {
  userId: string;
  file: File;
  path: CreationPath;
  name: string;
}): Promise<CreateAvatarResult> {
  assertAcceptablePhoto(options.file);

  const photo = Buffer.from(await options.file.arrayBuffer());
  const engine = getAvatarEngine();
  const storage = getStorage();

  // The row first, so storage keys use the real avatar id. It also means a
  // generation that dies partway leaves something the user can see and retry.
  const avatar = await createPendingAvatar({
    userId: options.userId,
    name: options.name,
    path: options.path,
    engineProvider: engine.id,
  });

  const avatarId = avatar.id;

  try {
    const result = await engine.generate({
      photo,
      path: options.path,
      // Seeded from the avatar's own id, so Path B's random body is stable:
      // regenerating gives the same body rather than silently changing it.
      seed: avatarId,
      name: options.name,
    });

    const photoKey = storageKeys.sourcePhoto(avatarId, extensionFor(options.file.type));
    const modelKey = storageKeys.model(avatarId, 1);
    const thumbnailKey = storageKeys.thumbnail(avatarId, 1);
    const textureKey = storageKeys.texture(avatarId, 1);

    // Files before the row that points at them. A row referencing a missing
    // object shows a broken avatar; an object with no row is invisible.
    await Promise.all([
      storage.put(photoKey, new Uint8Array(photo), {
        contentType: options.file.type,
        access: "private",
      }),
      storage.put(modelKey, result.glb, { contentType: "model/gltf-binary" }),
      storage.put(thumbnailKey, result.thumbnail, { contentType: "image/png" }),
      storage.put(textureKey, result.texture, { contentType: "image/png" }),
      result.faceCrop
        ? storage.put(storageKeys.faceCrop(avatarId), new Uint8Array(result.faceCrop), {
            contentType: "image/png",
            access: "private",
          })
        : Promise.resolve(),
    ]);

    await setAvatarSourcePhoto(avatarId, photoKey);

    await addAvatarVersion({
      userId: options.userId,
      avatarId,
      body: result.body,
      face: result.face,
      outfit: {},
      modelKey,
      thumbnailKey,
    });

    return { avatarId, warnings: result.warnings };
  } catch (error) {
    // Record why, so the editor can explain itself instead of showing an empty
    // canvas. Swallow any failure to record it: the original error is the one
    // worth surfacing.
    await markAvatarFailed(
      avatarId,
      error instanceof Error ? error.message : "Generation failed.",
    ).catch(() => {});
    throw error;
  }
}

export interface SaveEditResult {
  version: number;
  warnings: string[];
}

/**
 * Re-renders an avatar from edited parameters and appends a new version.
 *
 * The face crop kept from the original upload is reused, so the user's face
 * survives every edit without re-uploading or re-analysing the photo.
 */
export async function saveAvatarEdit(options: {
  userId: string;
  avatarId: string;
  params: AvatarParams;
}): Promise<SaveEditResult> {
  const { userId, avatarId, params } = options;

  const avatar = await getAvatar(userId, avatarId);
  if (!avatar) {
    throw new UploadRejected("That avatar could not be found.");
  }

  const storage = getStorage();
  const engine = getAvatarEngine(avatar.engineProvider);

  const facePhoto = await storage
    .get(storageKeys.faceCrop(avatarId))
    .catch(() => undefined);

  const { garments, warnings } = await resolveOutfit(userId, params.outfit);

  const result = await engine.render({
    body: params.body,
    face: params.face,
    outfit: params.outfit,
    garments,
    facePhoto,
    name: avatar.name,
  });

  const nextVersion = (avatar.currentVersion?.version ?? 0) + 1;
  const modelKey = storageKeys.model(avatarId, nextVersion);
  const thumbnailKey = storageKeys.thumbnail(avatarId, nextVersion);
  const textureKey = storageKeys.texture(avatarId, nextVersion);

  await Promise.all([
    storage.put(modelKey, result.glb, { contentType: "model/gltf-binary" }),
    storage.put(thumbnailKey, result.thumbnail, { contentType: "image/png" }),
    storage.put(textureKey, result.texture, { contentType: "image/png" }),
  ]);

  const updated = await addAvatarVersion({
    userId,
    avatarId,
    body: params.body,
    face: params.face,
    outfit: params.outfit,
    modelKey,
    thumbnailKey,
  });

  return {
    version: updated.currentVersion?.version ?? nextVersion,
    warnings: [...warnings, ...result.warnings],
  };
}

export interface RebuiltGeometry {
  mesh: HumanoidMesh;
  skeleton: Skeleton;
  garments: { name: string; mesh: SkinnedMesh; colorHex: string }[];
  texture: Uint8Array;
  glb: Uint8Array;
  warnings: string[];
}

/**
 * Rebuilds an avatar's actual geometry, without persisting anything.
 *
 * The FBX writer needs vertices, bones and weights, not a GLB container, so a
 * plain re-render is not enough. This reconstructs from the stored parameters
 * using the same builders the engine uses.
 *
 * Note that this is specific to the built-in engine's geometry. A vendor engine
 * returns an opaque GLB, so an FBX export from one would have to convert that
 * GLB rather than rebuild it. GLB export works for either.
 */
export async function rebuildAvatarGeometry(options: {
  userId: string;
  avatarId: string;
  body: BodyParams;
  face: FaceParams;
  outfit: Outfit;
  name: string;
}): Promise<RebuiltGeometry> {
  const storage = getStorage();

  const facePhoto = await storage
    .get(storageKeys.faceCrop(options.avatarId))
    .catch(() => undefined);

  const { garments: resolved, warnings } = await resolveOutfit(options.userId, options.outfit);

  const face = options.face ?? defaultFaceParams();
  const skeleton = buildSkeleton(options.body);
  const mesh = buildHumanoid(options.body, face, skeleton);
  const texture = await renderAvatarAtlasPng({ face, photo: facePhoto });

  const garments: { name: string; mesh: SkinnedMesh; colorHex: string }[] = [];

  for (const garment of resolved) {
    try {
      if (garment.source === "USER_MESH" && garment.meshFile) {
        const imported = importGarmentMesh(
          new Uint8Array(garment.meshFile),
          garment.meshFilename ?? garment.meshRef,
        );
        const fitted = fitGarmentToBody({
          garment: imported,
          slot: garment.slot,
          skeleton,
          body: mesh,
        });
        garments.push({ name: garment.name, mesh: fitted, colorHex: garment.colorHex });
        continue;
      }

      const template = garmentTemplate(garment.meshRef);
      if (template) {
        garments.push({
          name: garment.name,
          mesh: template.build({ body: options.body, skeleton }),
          colorHex: garment.colorHex,
        });
      }
    } catch (error) {
      warnings.push(
        `Left "${garment.name}" out of the export: ${error instanceof Error ? error.message : "unknown error"}`,
      );
    }
  }

  const glb = buildAvatarGlb({
    mesh,
    skeleton,
    texture,
    garments: garments.map((g) => ({ ...g })),
    name: options.name,
  });

  return { mesh, skeleton, garments, texture, glb, warnings };
}
