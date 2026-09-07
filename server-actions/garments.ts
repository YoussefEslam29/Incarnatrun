"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUserId } from "@/lib/auth";
import { action, fail, ok, type ActionResult } from "@/lib/actions/result";
import { GARMENT_SLOTS } from "@/lib/avatar-engine/params";
import { importGarmentMesh, MAX_FILE_BYTES } from "@/lib/clothing/mesh-import";
import { processGarmentPhoto } from "@/lib/clothing/photo-texture";
import { garmentTemplate, templatesForSlot } from "@/lib/clothing/templates";
import { createGarment, deleteGarment, getUserGarment } from "@/lib/db/garments";
import { getStorage, storageKeys } from "@/lib/storage";
import { prisma } from "@/lib/db/client";

const slotSchema = z.enum(GARMENT_SLOTS);

export interface CreatedGarment {
  id: string;
  name: string;
  slot: string;
  warnings: string[];
}

/**
 * Option A from PLAN/idea.md section 6: the user's photo of a real garment, mapped
 * onto a template mesh they choose.
 */
export async function createPhotoGarmentAction(
  _previous: ActionResult<CreatedGarment> | undefined,
  formData: FormData,
): Promise<ActionResult<CreatedGarment>> {
  return action(async () => {
    const userId = await requireUserId();

    const file = formData.get("photo");
    if (!(file instanceof File) || file.size === 0) {
      return fail("Choose a photo of the item.");
    }
    if (file.size > 12 * 1024 * 1024) {
      return fail(`That photo is ${(file.size / 1024 / 1024).toFixed(1)} MB. The limit is 12 MB.`);
    }

    const templateId = String(formData.get("templateId") ?? "");
    const template = garmentTemplate(templateId);
    if (!template) {
      return fail("Pick which kind of garment this is.");
    }

    const name = String(formData.get("name") ?? "").trim() || `My ${template.label.toLowerCase()}`;

    const processed = await processGarmentPhoto({
      photo: Buffer.from(await file.arrayBuffer()),
    });

    // The row first, so the texture key uses the real garment id.
    const garment = await createGarment({
      userId,
      name,
      slot: template.slot,
      source: "PHOTO_TEXTURE",
      meshRef: template.id,
      colorHex: processed.dominantColor,
    });

    const textureKey = storageKeys.garmentTexture(garment.id);
    await getStorage().put(textureKey, processed.texture, { contentType: "image/png" });
    await prisma.garment.update({ where: { id: garment.id }, data: { textureRef: textureKey } });

    revalidatePath("/editor", "layout");

    return ok(
      {
        id: garment.id,
        name: garment.name,
        slot: garment.slot,
        warnings: processed.trimmed
          ? []
          : ["The photo's background could not be trimmed automatically, so it is part of the texture."],
      },
      `Added "${name}".`,
    );
  });
}

/**
 * Option C from PLAN/idea.md section 6: the user's own 3D garment file.
 *
 * The file is parsed and validated here, before anything is stored, so a
 * malformed upload is refused with a specific reason instead of being written
 * and then failing every render afterwards.
 */
export async function createMeshGarmentAction(
  _previous: ActionResult<CreatedGarment> | undefined,
  formData: FormData,
): Promise<ActionResult<CreatedGarment>> {
  return action(async () => {
    const userId = await requireUserId();

    const file = formData.get("mesh");
    if (!(file instanceof File) || file.size === 0) {
      return fail("Choose an OBJ or GLB file.");
    }
    if (file.size > MAX_FILE_BYTES) {
      return fail(
        `That file is ${(file.size / 1024 / 1024).toFixed(1)} MB. The limit is ${MAX_FILE_BYTES / 1024 / 1024} MB.`,
      );
    }

    const slotResult = slotSchema.safeParse(formData.get("slot"));
    if (!slotResult.success) {
      return fail("Pick where this garment goes.");
    }
    const slot = slotResult.data;

    const name =
      String(formData.get("name") ?? "").trim() ||
      file.name.replace(/\.[^.]+$/, "") ||
      "Uploaded garment";

    const bytes = new Uint8Array(await file.arrayBuffer());

    // Parse before storing. importGarmentMesh throws GarmentMeshError with a
    // message written for the user, which action() passes through unchanged.
    const imported = importGarmentMesh(bytes, file.name);

    const garment = await createGarment({
      userId,
      name,
      slot,
      source: "USER_MESH",
      // Replaced below with the real storage key.
      meshRef: "pending",
      colorHex: String(formData.get("colorHex") ?? "#8b5cf6"),
    });

    const extension = imported.format === "obj" ? "obj" : "glb";
    const meshKey = storageKeys.garmentMesh(garment.id, extension);

    await getStorage().put(meshKey, bytes, {
      contentType: imported.format === "obj" ? "text/plain" : "model/gltf-binary",
    });
    await prisma.garment.update({ where: { id: garment.id }, data: { meshRef: meshKey } });

    revalidatePath("/editor", "layout");

    return ok(
      {
        id: garment.id,
        name: garment.name,
        slot: garment.slot,
        warnings: [
          ...imported.warnings,
          `${imported.triangleCount.toLocaleString()} triangles. It will be fitted to your avatar when you put it on.`,
        ],
      },
      `Added "${name}".`,
    );
  });
}

export async function deleteGarmentAction(garmentId: string): Promise<ActionResult<undefined>> {
  return action(async () => {
    const userId = await requireUserId();

    const garment = await getUserGarment(userId, garmentId);
    if (!garment) return fail("That item could not be found.");

    const removed = await deleteGarment(userId, garmentId);
    if (!removed) return fail("That item could not be found.");

    const storage = getStorage();
    const keys = [garment.textureRef, garment.source === "USER_MESH" ? garment.meshRef : null];
    await Promise.allSettled(keys.filter(Boolean).map((key) => storage.delete(key as string)));

    revalidatePath("/editor", "layout");

    return ok(undefined, `Removed "${garment.name}".`);
  });
}

/** The built-in garment shapes a photo can be mapped onto, for the upload form. */
export async function garmentTemplatesForSlotAction(slot: string) {
  const parsed = slotSchema.safeParse(slot);
  if (!parsed.success) return [];
  return templatesForSlot(parsed.data).map((t) => ({
    id: t.id,
    label: t.label,
    defaultColor: t.defaultColor,
  }));
}
