/**
 * The contract every avatar-generation engine implements.
 *
 * PLAN/idea.md sections 4 and 12 leave the vendor undecided, and that decision is
 * commercial rather than technical: cost per generation, licence terms, export
 * rights, embeddability. This interface is how that decision stops blocking
 * anything. The built-in engine implements it fully today, and choosing a
 * vendor later means filling in one adapter file and changing one environment
 * variable. Nothing outside lib/avatar-engine/providers may import a vendor SDK.
 */

import type { BodyParams, FaceParams, GarmentSlotId, Outfit } from "./params";

export type CreationPath = "FULL_BODY" | "FACE_ONLY";

export type GarmentSourceKind = "TEMPLATE" | "PHOTO_TEXTURE" | "USER_MESH";

/**
 * A garment ready to be worn, always as a mesh reference plus a texture
 * reference. Keeping this shape for every source is the requirement from
 * PLAN/idea.md section 6: Phase 2 AI reconstruction only has to supply a different
 * meshRef.
 */
export interface ResolvedGarment {
  id: string;
  name: string;
  slot: GarmentSlotId;
  source: GarmentSourceKind;
  /** Template id, or a storage key for an uploaded mesh. */
  meshRef: string;
  /** PNG bytes, already fetched from storage. */
  texture?: Buffer;
  /**
   * The uploaded OBJ or GLB bytes, for a USER_MESH garment. Fetched by the
   * caller so the engine never has to know that storage exists.
   */
  meshFile?: Buffer;
  /** Original filename, used only to pick a parser when the bytes are ambiguous. */
  meshFilename?: string;
  colorHex: string;
}

export interface GenerateInput {
  /** The photo the user uploaded. */
  photo: Buffer;
  path: CreationPath;
  /** Stable seed, so regenerating gives the same random body for Path B. */
  seed: string;
  name?: string;
}

export interface RenderInput {
  body: BodyParams;
  face: FaceParams;
  outfit: Outfit;
  garments: ResolvedGarment[];
  /** Square face crop kept from the original upload, if there was one. */
  facePhoto?: Buffer;
  name?: string;
}

export interface EngineResult {
  /** The rigged model. */
  glb: Uint8Array;
  /** PNG preview for the dashboard. */
  thumbnail: Uint8Array;
  /** The skin and face atlas, kept so exports can reuse it. */
  texture: Uint8Array;
  body: BodyParams;
  face: FaceParams;
  /** Square face crop, to be stored and reused on later re-renders. */
  faceCrop?: Buffer;
  /** Non-fatal notes to surface to the user, e.g. "no face detected". */
  warnings: string[];
  provider: string;
  /** The engine's own identifier for this avatar, when it has one. */
  engineAssetId?: string;
}

export interface AvatarEngineProvider {
  readonly id: string;
  readonly label: string;
  /** False when required credentials are missing. */
  isConfigured(): boolean;
  /** First generation, from a photo. */
  generate(input: GenerateInput): Promise<EngineResult>;
  /** Re-render after the user edits parameters. No photo analysis. */
  render(input: RenderInput): Promise<EngineResult>;
}

/**
 * Thrown when a provider is selected but cannot run.
 *
 * Separate from a generic error so the API layer can answer 503 with a message
 * about configuration rather than 500 with a stack trace.
 */
export class EngineNotConfiguredError extends Error {
  constructor(
    readonly providerId: string,
    message: string,
  ) {
    super(message);
    this.name = "EngineNotConfiguredError";
  }
}

/** Thrown when the input is unusable, e.g. a corrupt or tiny photo. */
export class EngineInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EngineInputError";
  }
}
