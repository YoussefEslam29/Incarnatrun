/**
 * The avatar skeleton.
 *
 * Bone names are Mixamo's exactly, because that is the whole point of the
 * "Blender-ready" promise in PLAN/idea.md section 8: a file whose rig uses these
 * names can be dropped into Mixamo for auto-animation, and every Mixamo
 * animation retargets onto it without remapping.
 *
 * Proportions are stored as fractions of total height rather than absolute
 * metres, so changing `heightCm` scales the whole rig coherently instead of
 * stretching one part of it.
 *
 * The rest pose is a T-pose (arms straight out along +/-X), which is what
 * Mixamo's auto-rigger and most retargeting tools expect.
 */

import { identityMat4, remap, translationMat4, type Vec3 } from "./math";
import type { BodyParams } from "../params";

export interface BoneDefinition {
  name: string;
  /** Index into MIXAMO_BONES, or -1 for the root. Always less than own index. */
  parent: number;
  /**
   * Local offset from the parent, as a fraction of total body height.
   * X is the character's left, Y is up, Z is forward.
   */
  offset: Vec3;
  /** Which chain this bone belongs to, used when redistributing proportions. */
  chain: "spine" | "leg" | "arm" | "shoulder";
}

/**
 * Reference proportions, derived from a 1.75 m figure and normalised.
 * The spine chain from the hips to the crown sums to 1 - hipHeight, and the leg
 * chain from the hips to the floor sums to hipHeight, so the total is exactly 1.
 */
export const MIXAMO_BONES: readonly BoneDefinition[] = [
  // Root
  { name: "mixamorig:Hips", parent: -1, offset: [0, 0, 0], chain: "spine" },

  // Spine to head
  { name: "mixamorig:Spine", parent: 0, offset: [0, 0.0571, 0], chain: "spine" },
  { name: "mixamorig:Spine1", parent: 1, offset: [0, 0.0629, 0], chain: "spine" },
  { name: "mixamorig:Spine2", parent: 2, offset: [0, 0.0629, 0], chain: "spine" },
  { name: "mixamorig:Neck", parent: 3, offset: [0, 0.0914, 0], chain: "spine" },
  { name: "mixamorig:Head", parent: 4, offset: [0, 0.0514, 0], chain: "spine" },
  { name: "mixamorig:HeadTop_End", parent: 5, offset: [0, 0.1143, 0], chain: "spine" },

  // Left arm
  { name: "mixamorig:LeftShoulder", parent: 3, offset: [0.0286, 0.0686, 0], chain: "shoulder" },
  { name: "mixamorig:LeftArm", parent: 7, offset: [0.0743, 0, 0], chain: "arm" },
  { name: "mixamorig:LeftForeArm", parent: 8, offset: [0.1543, 0, 0], chain: "arm" },
  { name: "mixamorig:LeftHand", parent: 9, offset: [0.1429, 0, 0], chain: "arm" },

  // Right arm
  { name: "mixamorig:RightShoulder", parent: 3, offset: [-0.0286, 0.0686, 0], chain: "shoulder" },
  { name: "mixamorig:RightArm", parent: 11, offset: [-0.0743, 0, 0], chain: "arm" },
  { name: "mixamorig:RightForeArm", parent: 12, offset: [-0.1543, 0, 0], chain: "arm" },
  { name: "mixamorig:RightHand", parent: 13, offset: [-0.1429, 0, 0], chain: "arm" },

  // Left leg
  { name: "mixamorig:LeftUpLeg", parent: 0, offset: [0.0514, -0.0343, 0], chain: "leg" },
  { name: "mixamorig:LeftLeg", parent: 15, offset: [0, -0.24, 0], chain: "leg" },
  { name: "mixamorig:LeftFoot", parent: 16, offset: [0, -0.2343, 0], chain: "leg" },
  { name: "mixamorig:LeftToeBase", parent: 17, offset: [0, -0.0457, 0.0571], chain: "leg" },
  { name: "mixamorig:LeftToe_End", parent: 18, offset: [0, 0, 0.04], chain: "leg" },

  // Right leg
  { name: "mixamorig:RightUpLeg", parent: 0, offset: [-0.0514, -0.0343, 0], chain: "leg" },
  { name: "mixamorig:RightLeg", parent: 20, offset: [0, -0.24, 0], chain: "leg" },
  { name: "mixamorig:RightFoot", parent: 21, offset: [0, -0.2343, 0], chain: "leg" },
  { name: "mixamorig:RightToeBase", parent: 22, offset: [0, -0.0457, 0.0571], chain: "leg" },
  { name: "mixamorig:RightToe_End", parent: 23, offset: [0, 0, 0.04], chain: "leg" },
] as const;

const BONE_INDEX = new Map(MIXAMO_BONES.map((b, i) => [b.name, i]));

/** Resolves a bone name to its index, throwing rather than returning -1. */
export function boneIndexByName(name: string): number {
  const index = BONE_INDEX.get(name);
  if (index === undefined) {
    throw new Error(`Unknown bone "${name}".`);
  }
  return index;
}

export interface Bone {
  name: string;
  parent: number;
  /** Offset from the parent, in metres. */
  localTranslation: Vec3;
  /** Absolute rest-pose position, in metres. */
  worldPosition: Vec3;
}

export interface Skeleton {
  bones: Bone[];
  /** Flat MAT4 array, one 16-float matrix per bone, in bone order. */
  inverseBindMatrices: Float32Array;
  /** Total height in metres, equal to heightCm / 100. */
  height: number;
  /** Rest-pose hip height in metres. Useful for placing garments. */
  hipHeight: number;
}

/**
 * The share of total height taken up by the legs.
 *
 * `legLength` moves this fraction; the spine chain absorbs the remainder. That
 * is why changing leg length lengthens the legs without changing how tall the
 * avatar is, which is what a user dragging a "leg length" slider expects.
 */
function legHeightFraction(body: BodyParams): number {
  return remap(body.legLength, 0.46, 0.55);
}

/** Sum of the vertical offsets down one leg, in reference fractions. */
const REFERENCE_LEG_DROP = 0.0343 + 0.24 + 0.2343 + 0.0457;
/** Sum of the vertical offsets from the hips to the crown, in reference fractions. */
const REFERENCE_SPINE_RISE = 0.0571 + 0.0629 + 0.0629 + 0.0914 + 0.0514 + 0.1143;

export function buildSkeleton(body: BodyParams): Skeleton {
  const height = body.heightCm / 100;

  // Vertical scaling: legs and spine get independent factors chosen so each
  // chain spans exactly the share of `height` it is allotted. The leg chain
  // then reaches the floor at y=0 and the spine chain reaches the crown at
  // y=height, whatever the leg-length slider says. Normalising against each
  // chain's own reference sum is what makes this exact rather than approximate.
  const hipFraction = legHeightFraction(body);
  const legScale = hipFraction / REFERENCE_LEG_DROP;
  const spineScale = (1 - hipFraction) / REFERENCE_SPINE_RISE;

  // Horizontal scaling.
  const shoulderScale = remap(body.shoulderWidth, 0.82, 1.24);
  const armScale = remap(body.armLength, 0.88, 1.12);
  const hipWidthScale = remap(body.hips, 0.88, 1.16);

  const bones: Bone[] = MIXAMO_BONES.map((def) => {
    let [x, y, z] = def.offset;

    switch (def.chain) {
      case "leg":
        x *= hipWidthScale;
        y *= legScale;
        z *= legScale;
        break;
      case "spine":
        y *= spineScale;
        break;
      case "shoulder":
        x *= shoulderScale;
        y *= spineScale;
        break;
      case "arm":
        x *= armScale;
        break;
    }

    return {
      name: def.name,
      parent: def.parent,
      localTranslation: [x * height, y * height, z * height] as Vec3,
      worldPosition: [0, 0, 0] as Vec3,
    };
  });

  // The hips sit at hipFraction of total height. Every other bone is relative.
  bones[0].localTranslation = [0, hipFraction * height, 0];

  // Single pass is enough because parents always precede children.
  for (const bone of bones) {
    const parentWorld: Vec3 = bone.parent === -1 ? [0, 0, 0] : bones[bone.parent].worldPosition;
    bone.worldPosition = [
      parentWorld[0] + bone.localTranslation[0],
      parentWorld[1] + bone.localTranslation[1],
      parentWorld[2] + bone.localTranslation[2],
    ];
  }

  // The rest pose has no rotation, so a bone's world transform is a pure
  // translation and its inverse is the negated translation. Built explicitly
  // rather than through the general inverse, which would only add float error.
  const inverseBindMatrices = new Float32Array(bones.length * 16);
  bones.forEach((bone, i) => {
    const [x, y, z] = bone.worldPosition;
    inverseBindMatrices.set(translationMat4(-x, -y, -z), i * 16);
  });

  return {
    bones,
    inverseBindMatrices,
    height,
    hipHeight: bones[0].worldPosition[1],
  };
}

/** Identity matrix, exported so callers do not have to import the maths module. */
export { identityMat4 };
