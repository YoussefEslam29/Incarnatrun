/**
 * GLB export.
 *
 * The avatar is already stored as a GLB, so this mostly passes bytes through.
 * It does rewrite the `extras` block to record when and from where the file was
 * exported, which is the difference between a downloaded file you can trace and
 * one you cannot.
 */

import { packGlb, unpackGlb } from "../../avatar-engine/gltf/glb";
import type { ExportOptions, ExportSource } from "../index";

export async function exportGlb(
  source: ExportSource,
  options: ExportOptions,
): Promise<Uint8Array> {
  const { json, bin } = unpackGlb(source.glb);

  const existingExtras = (json.extras as Record<string, unknown> | undefined) ?? {};

  json.extras = {
    ...existingExtras,
    exportedBy: "Incarnatrun",
    exportedAt: new Date().toISOString(),
    exportFormat: "glb",
    avatarName: source.avatarName,
    rigged: options.includeRig !== false,
  };

  // The binary chunk is unchanged, so repacking is only a JSON rewrite. Copy it
  // out of the source view first: `unpackGlb` returns a subarray onto the input
  // buffer, and packGlb would otherwise read past its own allocation.
  return packGlb(json, Uint8Array.from(bin));
}
