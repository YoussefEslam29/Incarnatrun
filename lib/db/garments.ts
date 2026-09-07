/**
 * Garment persistence.
 *
 * The built-in wardrobe lives in code, not in the database, so it needs no
 * seeding and cannot drift from the mesh builders that implement it. Only the
 * user's own garments, from a photo or an uploaded file, are stored as rows.
 *
 * `resolveOutfit` is where the two sources come back together: it turns an
 * outfit of ids into the ResolvedGarment shape the engine takes, whether the id
 * names a template or a row.
 */

import type { GarmentSlot, GarmentSource, Prisma } from "@prisma/client";
import { prisma } from "./client";
import { garmentTemplate, GARMENT_TEMPLATES } from "../clothing/templates";
import type { GarmentSlotId, Outfit } from "../avatar-engine/params";
import type { ResolvedGarment } from "../avatar-engine/types";
import { getStorage, ObjectNotFoundError } from "../storage";

/** Template ids are prefixed so they can never collide with a database id. */
export const TEMPLATE_PREFIX = "template:";

export function templateGarmentId(templateId: string): string {
  return `${TEMPLATE_PREFIX}${templateId}`;
}

export function isTemplateGarmentId(id: string): boolean {
  return id.startsWith(TEMPLATE_PREFIX);
}

export function listUserGarments(userId: string) {
  return prisma.garment.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
  });
}

export function getUserGarment(userId: string, garmentId: string) {
  return prisma.garment.findFirst({ where: { id: garmentId, userId } });
}

export interface CreateGarmentInput {
  userId: string;
  name: string;
  slot: GarmentSlotId;
  source: GarmentSource;
  meshRef: string;
  textureRef?: string;
  colorHex: string;
}

export function createGarment(input: CreateGarmentInput) {
  return prisma.garment.create({
    data: {
      userId: input.userId,
      name: input.name,
      slot: input.slot as GarmentSlot,
      source: input.source,
      meshRef: input.meshRef,
      textureRef: input.textureRef,
      colorHex: input.colorHex,
    },
  });
}

export async function deleteGarment(userId: string, garmentId: string) {
  const result = await prisma.garment.deleteMany({ where: { id: garmentId, userId } });
  return result.count > 0;
}

/**
 * Turns an outfit of ids into garments the engine can wear.
 *
 * A texture that has gone missing from storage downgrades the garment to its
 * flat colour rather than failing the whole render. Losing a print is a much
 * better outcome than the user losing their avatar.
 */
export async function resolveOutfit(
  userId: string,
  outfit: Outfit,
): Promise<{ garments: ResolvedGarment[]; warnings: string[] }> {
  const storage = getStorage();
  const garments: ResolvedGarment[] = [];
  const warnings: string[] = [];

  for (const [slot, id] of Object.entries(outfit)) {
    if (!id) continue;

    if (isTemplateGarmentId(id)) {
      const template = garmentTemplate(id.slice(TEMPLATE_PREFIX.length));
      if (!template) {
        warnings.push(`The ${slot.toLowerCase()} you had on is no longer available.`);
        continue;
      }
      garments.push({
        id,
        name: template.label,
        slot: template.slot,
        source: "TEMPLATE",
        meshRef: template.id,
        colorHex: template.defaultColor,
      });
      continue;
    }

    const row = await getUserGarment(userId, id);
    if (!row) {
      warnings.push(`The ${slot.toLowerCase()} you had on could not be found.`);
      continue;
    }

    let texture: Buffer | undefined;
    if (row.textureRef) {
      try {
        texture = await storage.get(row.textureRef);
      } catch (error) {
        if (!(error instanceof ObjectNotFoundError)) throw error;
        warnings.push(`The texture for "${row.name}" is missing, so its colour was used instead.`);
      }
    }

    // An uploaded garment's mesh is fetched here rather than inside the engine,
    // so the engine never needs to know that storage exists.
    let meshFile: Buffer | undefined;
    if (row.source === "USER_MESH") {
      try {
        meshFile = await storage.get(row.meshRef);
      } catch (error) {
        if (!(error instanceof ObjectNotFoundError)) throw error;
        warnings.push(`The model file for "${row.name}" is missing, so it was left off.`);
        continue;
      }
    }

    garments.push({
      id: row.id,
      name: row.name,
      slot: row.slot as GarmentSlotId,
      source: row.source,
      meshRef: row.meshRef,
      texture,
      meshFile,
      meshFilename: row.meshRef,
      colorHex: row.colorHex,
    });
  }

  return { garments, warnings };
}

/** Everything wearable in a slot: the built-in wardrobe plus the user's own. */
export async function wardrobeForSlot(userId: string, slot: GarmentSlotId) {
  const templates = GARMENT_TEMPLATES.filter((t) => t.slot === slot).map((t) => ({
    id: templateGarmentId(t.id),
    name: t.label,
    slot: t.slot,
    source: "TEMPLATE" as const,
    colorHex: t.defaultColor,
    custom: false,
  }));

  const rows = await prisma.garment.findMany({
    where: { userId, slot: slot as GarmentSlot },
    orderBy: { createdAt: "desc" },
  });

  return [
    ...templates,
    ...rows.map((row) => ({
      id: row.id,
      name: row.name,
      slot: row.slot as GarmentSlotId,
      source: row.source,
      colorHex: row.colorHex,
      custom: true,
    })),
  ];
}

export type WardrobeItem = Awaited<ReturnType<typeof wardrobeForSlot>>[number];

export type GarmentRow = Prisma.GarmentGetPayload<Record<string, never>>;
