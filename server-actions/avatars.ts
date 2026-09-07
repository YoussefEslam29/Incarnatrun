"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUserId } from "@/lib/auth";
import { action, fail, ok, type ActionResult } from "@/lib/actions/result";
import { avatarParamsSchema } from "@/lib/avatar-engine/params";
import { createAvatarFromPhoto, saveAvatarEdit } from "@/lib/avatars/service";
import {
  avatarStorageKeys,
  deleteAvatar,
  getAvatar,
  renameAvatar,
} from "@/lib/db/avatars";
import { getStorage } from "@/lib/storage";

const createSchema = z.object({
  path: z.enum(["FULL_BODY", "FACE_ONLY"]),
  name: z.string().trim().min(1).max(60).default("My avatar"),
});

export interface CreatedAvatar {
  avatarId: string;
  warnings: string[];
}

/**
 * Path A and Path B both arrive here; the form's `path` field decides which.
 *
 * Returns the new id rather than redirecting, so the client can show any
 * warnings as toasts before navigating. A redirect thrown from inside the
 * action would discard them.
 */
export async function createAvatarAction(
  _previous: ActionResult<CreatedAvatar> | undefined,
  formData: FormData,
): Promise<ActionResult<CreatedAvatar>> {
  return action(async () => {
    const userId = await requireUserId();

    const file = formData.get("photo");
    if (!(file instanceof File)) {
      return fail("Choose a photo to upload.");
    }

    const parsed = createSchema.safeParse({
      path: formData.get("path"),
      name: formData.get("name") || undefined,
    });

    if (!parsed.success) {
      return fail("Pick how you would like to build your avatar.");
    }

    const result = await createAvatarFromPhoto({
      userId,
      file,
      path: parsed.data.path,
      name: parsed.data.name,
    });

    revalidatePath("/dashboard");

    return ok(result, "Avatar created.");
  });
}

const saveSchema = z.object({
  avatarId: z.string().min(1),
  params: avatarParamsSchema,
});

export interface SavedAvatar {
  version: number;
  warnings: string[];
}

export async function saveAvatarAction(
  input: z.input<typeof saveSchema>,
): Promise<ActionResult<SavedAvatar>> {
  return action(async () => {
    const userId = await requireUserId();

    const parsed = saveSchema.safeParse(input);
    if (!parsed.success) {
      return fail("Some of those settings were out of range. Reload and try again.");
    }

    const result = await saveAvatarEdit({
      userId,
      avatarId: parsed.data.avatarId,
      params: parsed.data.params,
    });

    revalidatePath("/dashboard");
    revalidatePath(`/editor/${parsed.data.avatarId}`);

    return ok(result, `Saved as version ${result.version}.`);
  });
}

export async function renameAvatarAction(
  avatarId: string,
  name: string,
): Promise<ActionResult<{ name: string }>> {
  return action(async () => {
    const userId = await requireUserId();
    const trimmed = name.trim();

    if (!trimmed) return fail("Give the avatar a name.");
    if (trimmed.length > 60) return fail("That name is too long. Keep it under 60 characters.");

    const renamed = await renameAvatar(userId, avatarId, trimmed);
    if (!renamed) return fail("That avatar could not be found.");

    revalidatePath("/dashboard");
    revalidatePath(`/editor/${avatarId}`);

    return ok({ name: trimmed }, "Renamed.");
  });
}

export async function deleteAvatarAction(avatarId: string): Promise<ActionResult<undefined>> {
  return action(async () => {
    const userId = await requireUserId();

    const avatar = await getAvatar(userId, avatarId);
    if (!avatar) return fail("That avatar could not be found.");

    // Collect the keys before deleting the rows, since the rows are what say
    // which keys belong to this avatar.
    const keys = await avatarStorageKeys(userId, avatarId);

    const removed = await deleteAvatar(userId, avatarId);
    if (!removed) return fail("That avatar could not be found.");

    // Storage cleanup is best-effort. An orphaned object costs a little space;
    // failing the delete because of one would leave the user with an avatar
    // they have already been told is gone.
    const storage = getStorage();
    await Promise.allSettled(keys.map((key) => storage.delete(key)));

    revalidatePath("/dashboard");

    return ok(undefined, `Deleted "${avatar.name}".`);
  });
}
