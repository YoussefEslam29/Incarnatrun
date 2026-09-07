/**
 * The export pipeline: `exportAs(format, options)`.
 *
 * A registry, not a switch. PLAN/idea.md section 7 asks specifically that this be
 * pluggable from day one so a `print-ready` formatter can be added in Phase 2
 * without touching avatar generation or the editor. Adding a format means
 * registering one more entry below; nothing else in the app changes.
 *
 * Formats can be registered but disabled. `stl` is present with
 * `enabled: false` so the UI can show it as coming soon and the API can give a
 * precise reason rather than a generic "unknown format".
 */

import type { SkinnedMesh } from "../avatar-engine/geometry/mesh";
import type { Skeleton } from "../avatar-engine/geometry/skeleton";
import { safeFilename } from "./filename";
import { exportFbx } from "./formats/fbx";
import { exportGlb } from "./formats/glb";

export { safeFilename };

export interface ExportSource {
  /** The already-generated GLB, when the format can pass it through. */
  glb: Uint8Array;
  /** Body mesh, for formats that need geometry rather than a container. */
  mesh?: SkinnedMesh;
  skeleton?: Skeleton;
  garments?: { name: string; mesh: SkinnedMesh; colorHex: string }[];
  texture?: Uint8Array;
  avatarName: string;
}

export interface ExportOptions {
  /** Filename stem, without extension. */
  filename?: string;
  /** Include the rig. Meaningless for formats that cannot carry one. */
  includeRig?: boolean;
  /** Embed textures rather than referencing them. */
  embedTextures?: boolean;
}

export interface ExportResult {
  bytes: Uint8Array;
  filename: string;
  contentType: string;
}

export interface ExportFormat {
  id: string;
  label: string;
  extension: string;
  contentType: string;
  /** One line for the UI, saying what this file is good for. */
  description: string;
  enabled: boolean;
  /** Present only for formats not yet enabled. */
  unavailableReason?: string;
  rigged: boolean;
  run(source: ExportSource, options: ExportOptions): Promise<Uint8Array>;
}

export const EXPORT_FORMATS: ExportFormat[] = [
  {
    id: "glb",
    label: "GLB",
    extension: "glb",
    contentType: "model/gltf-binary",
    description: "Rigged glTF binary. Imports straight into Blender, Unity and three.js.",
    enabled: true,
    rigged: true,
    run: exportGlb,
  },
  {
    id: "fbx",
    label: "FBX + texture",
    extension: "zip",
    contentType: "application/zip",
    description:
      "Rigged FBX with a Mixamo-compatible skeleton, zipped with its texture. Upload the zip straight to Mixamo.",
    enabled: true,
    rigged: true,
    run: exportFbx,
  },
  {
    id: "stl",
    label: "STL (3D print)",
    extension: "stl",
    contentType: "model/stl",
    description: "Single watertight mesh for 3D printing. No rig, no textures.",
    enabled: false,
    unavailableReason:
      "Print-ready export is Phase 2. It needs the mesh merged into one manifold solid and checked for minimum wall thickness, which the current geometry does not guarantee.",
    rigged: false,
    async run() {
      throw new ExportNotAvailableError("stl");
    },
  },
];

const BY_ID = new Map(EXPORT_FORMATS.map((f) => [f.id, f]));

export class UnknownExportFormatError extends Error {
  constructor(format: string) {
    super(
      `Unknown export format "${format}". Available formats: ${EXPORT_FORMATS.filter((f) => f.enabled)
        .map((f) => f.id)
        .join(", ")}.`,
    );
    this.name = "UnknownExportFormatError";
  }
}

export class ExportNotAvailableError extends Error {
  constructor(format: string) {
    const entry = BY_ID.get(format);
    super(entry?.unavailableReason ?? `Export format "${format}" is not available yet.`);
    this.name = "ExportNotAvailableError";
  }
}

export function exportFormat(id: string): ExportFormat | undefined {
  return BY_ID.get(id);
}

/** Formats the UI should offer right now. */
export function availableFormats(): ExportFormat[] {
  return EXPORT_FORMATS.filter((f) => f.enabled);
}

/**
 * The one entry point every caller uses.
 *
 * Keeping the signature `(format, options)` exactly as PLAN/idea.md section 7
 * specifies means the Phase 2 print formatter is a registry entry and nothing
 * more.
 */
export async function exportAs(
  format: string,
  source: ExportSource,
  options: ExportOptions = {},
): Promise<ExportResult> {
  const entry = BY_ID.get(format);

  if (!entry) throw new UnknownExportFormatError(format);
  if (!entry.enabled) throw new ExportNotAvailableError(format);

  const bytes = await entry.run(source, options);
  const stem = safeFilename(options.filename ?? source.avatarName);

  return {
    bytes,
    filename: `${stem}.${entry.extension}`,
    contentType: entry.contentType,
  };
}
