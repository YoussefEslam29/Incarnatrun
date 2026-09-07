/**
 * Every knob the editor exposes, and the only place their ranges are defined.
 *
 * These schemas are the trust boundary. Editor state, Server Action payloads
 * and the JSON columns on AvatarVersion all pass through here, so a malformed
 * or hostile parameter set can never reach the geometry code — which does no
 * validation of its own and assumes it is handed clean numbers.
 */

import { z } from "zod";

const hexColor = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, "Must be a six-digit hex colour such as #a1b2c3");

/** A 0..1 slider. Geometry maps these onto real-world ranges. */
const unit = z.number().min(0).max(1);

// ---------------------------------------------------------------------------
// Body
// ---------------------------------------------------------------------------

/**
 * Pre-made body templates. Path B in PLAN/idea.md attaches a random one of these to
 * a reconstructed face, and the user then edits it.
 */
export const BODY_TEMPLATES = [
  { id: "athletic", label: "Athletic", build: 0.42, muscle: 0.72, shoulderWidth: 0.68 },
  { id: "slim", label: "Slim", build: 0.24, muscle: 0.38, shoulderWidth: 0.42 },
  { id: "average", label: "Average", build: 0.5, muscle: 0.5, shoulderWidth: 0.5 },
  { id: "curvy", label: "Curvy", build: 0.64, muscle: 0.42, shoulderWidth: 0.46 },
  { id: "broad", label: "Broad", build: 0.7, muscle: 0.66, shoulderWidth: 0.78 },
  { id: "petite", label: "Petite", build: 0.34, muscle: 0.44, shoulderWidth: 0.4 },
] as const;

export type BodyTemplateId = (typeof BODY_TEMPLATES)[number]["id"];

const bodyTemplateIds = BODY_TEMPLATES.map((t) => t.id) as [BodyTemplateId, ...BodyTemplateId[]];

export const bodyParamsSchema = z.object({
  /** Real-world height. Drives the overall skeleton scale. */
  heightCm: z.number().min(140).max(210).default(175),
  /** Slim through heavy. Scales every circumference together. */
  build: unit.default(0.5),
  shoulderWidth: unit.default(0.5),
  chest: unit.default(0.5),
  waist: unit.default(0.5),
  hips: unit.default(0.5),
  /** Arm and leg length as a proportion of total height. */
  armLength: unit.default(0.5),
  legLength: unit.default(0.5),
  /** Muscle definition. Adds taper and bulk to limbs without changing height. */
  muscle: unit.default(0.5),
  headSize: unit.default(0.5),
  template: z.enum(bodyTemplateIds).default("average"),
});

export type BodyParams = z.infer<typeof bodyParamsSchema>;

export function defaultBodyParams(): BodyParams {
  return bodyParamsSchema.parse({});
}

// ---------------------------------------------------------------------------
// Face
// ---------------------------------------------------------------------------

export const HAIR_STYLES = ["none", "short", "medium", "long", "bun", "afro"] as const;
export type HairStyle = (typeof HAIR_STYLES)[number];

export const faceParamsSchema = z.object({
  skinTone: hexColor.default("#c68863"),
  hairColor: hexColor.default("#2b1b12"),
  eyeColor: hexColor.default("#4a6741"),
  jawWidth: unit.default(0.5),
  cheekFullness: unit.default(0.5),
  noseSize: unit.default(0.5),
  eyeSize: unit.default(0.5),
  browHeight: unit.default(0.5),
  chinLength: unit.default(0.5),
  mouthWidth: unit.default(0.5),
  hairStyle: z.enum(HAIR_STYLES).default("short"),
});

export type FaceParams = z.infer<typeof faceParamsSchema>;

export function defaultFaceParams(): FaceParams {
  return faceParamsSchema.parse({});
}

// ---------------------------------------------------------------------------
// Outfit
// ---------------------------------------------------------------------------

export const GARMENT_SLOTS = ["TOP", "BOTTOM", "SHOES", "HAIR", "ACCESSORY"] as const;
export type GarmentSlotId = (typeof GARMENT_SLOTS)[number];

/** Slot to garment id. A missing slot means nothing is equipped there. */
export const outfitSchema = z
  .object({
    TOP: z.string().optional(),
    BOTTOM: z.string().optional(),
    SHOES: z.string().optional(),
    HAIR: z.string().optional(),
    ACCESSORY: z.string().optional(),
  })
  .strict();

export type Outfit = z.infer<typeof outfitSchema>;

// ---------------------------------------------------------------------------
// The full parameter set for one avatar version
// ---------------------------------------------------------------------------

export const avatarParamsSchema = z.object({
  body: bodyParamsSchema,
  face: faceParamsSchema,
  outfit: outfitSchema.default({}),
});

export type AvatarParams = z.infer<typeof avatarParamsSchema>;

export function defaultAvatarParams(): AvatarParams {
  return {
    body: defaultBodyParams(),
    face: defaultFaceParams(),
    outfit: {},
  };
}

// ---------------------------------------------------------------------------
// Deterministic randomness
// ---------------------------------------------------------------------------

/**
 * FNV-1a, then a small xorshift. We only need a stable, well-spread stream from
 * a string seed; this is not and does not need to be cryptographic.
 */
function seededRandom(seed: string): () => number {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  let state = h >>> 0 || 1;

  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    return state / 0x100000000;
  };
}

/**
 * Path B: pick a random pre-made body for a face-only upload.
 *
 * Deterministic in the seed so that regenerating an avatar from the same source
 * photo produces the same body rather than silently changing it under the user.
 */
export function randomBodyParams(seed: string): BodyParams {
  const rand = seededRandom(seed);
  const template = BODY_TEMPLATES[Math.floor(rand() * BODY_TEMPLATES.length)];

  // Jitter around the template so two users on the same template are not twins,
  // clamped so the result always satisfies the schema.
  const jitter = (base: number, amount = 0.12) =>
    Math.min(1, Math.max(0, base + (rand() - 0.5) * 2 * amount));

  return bodyParamsSchema.parse({
    heightCm: Math.round(162 + rand() * 26),
    build: jitter(template.build),
    shoulderWidth: jitter(template.shoulderWidth),
    chest: jitter(template.build),
    waist: jitter(template.build),
    hips: jitter(template.build),
    armLength: jitter(0.5, 0.16),
    legLength: jitter(0.5, 0.16),
    muscle: jitter(template.muscle),
    headSize: jitter(0.5, 0.1),
    template: template.id,
  });
}
