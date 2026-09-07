/**
 * Fits an uploaded 3D garment onto the avatar and skins it to the rig.
 *
 * PLAN/idea.md section 6 calls this "a garment-fitting/retargeting step to drape and
 * skin the uploaded mesh onto the avatar's body", and distinguishes it from
 * generating a garment out of thin air, which is Phase 2.
 *
 * The approach:
 *
 *   1. Normalise. Uploaded meshes arrive in whatever units and origin their
 *      author used: centimetres, inches, Z-up, centred on the origin or resting
 *      on it. Fit the bounding box to the slot's target region on the body and
 *      everything after that is in avatar space.
 *   2. Shrink-wrap outward. Push any vertex that has ended up inside the body
 *      out along its radial direction, so the skin does not poke through.
 *   3. Skin. Bind to the same bones the equivalent template garment uses, so
 *      the upload animates exactly like a built-in one.
 *
 * What this is not is cloth simulation. A garment much the wrong shape for the
 * body will fit loosely rather than drape correctly. That is the honest limit
 * of a geometric fit, and it is far better than the alternative of asking the
 * user to model against our exact proportions.
 */

import { clamp, type Vec3 } from "../avatar-engine/geometry/math";
import type { MeshPart, SkinnedMesh } from "../avatar-engine/geometry/mesh";
import { boneIndexByName, type Skeleton } from "../avatar-engine/geometry/skeleton";
import { computeSkinWeights } from "../avatar-engine/geometry/skinning";
import type { GarmentSlotId } from "../avatar-engine/params";
import type { ImportedGarmentMesh } from "./mesh-import";

/**
 * Where on the body each slot's garment belongs, and which bones drive it.
 *
 * Expressed as fractions of the skeleton's height so it scales with the avatar.
 */
const SLOT_FIT: Record<
  GarmentSlotId,
  {
    /** Vertical span the garment is scaled into, as bone names. */
    from: string;
    to: string;
    /** Extra height above and below the span, as a fraction of total height. */
    padTop: number;
    padBottom: number;
    bones: string[];
    /** Whether the garment is a mirrored pair placed at each foot. */
    perSide?: boolean;
  }
> = {
  TOP: {
    from: "mixamorig:Hips",
    to: "mixamorig:Neck",
    padTop: 0.01,
    padBottom: 0.05,
    bones: [
      "mixamorig:Hips",
      "mixamorig:Spine",
      "mixamorig:Spine1",
      "mixamorig:Spine2",
      "mixamorig:LeftShoulder",
      "mixamorig:RightShoulder",
      "mixamorig:LeftArm",
      "mixamorig:RightArm",
      "mixamorig:LeftForeArm",
      "mixamorig:RightForeArm",
    ],
  },
  BOTTOM: {
    from: "mixamorig:LeftFoot",
    to: "mixamorig:Spine",
    padTop: 0,
    padBottom: 0,
    bones: [
      "mixamorig:Hips",
      "mixamorig:Spine",
      "mixamorig:LeftUpLeg",
      "mixamorig:RightUpLeg",
      "mixamorig:LeftLeg",
      "mixamorig:RightLeg",
      "mixamorig:LeftFoot",
      "mixamorig:RightFoot",
    ],
  },
  SHOES: {
    from: "mixamorig:LeftToeBase",
    to: "mixamorig:LeftFoot",
    padTop: 0.02,
    padBottom: 0.01,
    bones: [
      "mixamorig:LeftFoot",
      "mixamorig:RightFoot",
      "mixamorig:LeftToeBase",
      "mixamorig:RightToeBase",
    ],
    perSide: true,
  },
  HAIR: {
    from: "mixamorig:Head",
    to: "mixamorig:HeadTop_End",
    padTop: 0.01,
    padBottom: 0.02,
    bones: ["mixamorig:Head", "mixamorig:Neck"],
  },
  ACCESSORY: {
    from: "mixamorig:Hips",
    to: "mixamorig:Head",
    padTop: 0.02,
    padBottom: 0.02,
    bones: ["mixamorig:Hips", "mixamorig:Spine2", "mixamorig:Neck", "mixamorig:Head"],
  },
};

export interface FitResult extends SkinnedMesh {
  warnings: string[];
  /** Uniform scale applied to the upload, useful for telling the user. */
  appliedScale: number;
}

/** Widest radius of the body within a horizontal band, for shrink-wrapping. */
function bodyRadiusProfile(
  body: SkinnedMesh,
  minY: number,
  maxY: number,
  bands: number,
): Float32Array {
  const profile = new Float32Array(bands);
  const span = Math.max(maxY - minY, 1e-6);

  for (let v = 0; v < body.positions.length / 3; v++) {
    const y = body.positions[v * 3 + 1];
    if (y < minY || y > maxY) continue;

    const band = Math.min(bands - 1, Math.floor(((y - minY) / span) * bands));
    const radius = Math.hypot(body.positions[v * 3], body.positions[v * 3 + 2]);
    if (radius > profile[band]) profile[band] = radius;
  }

  // Fill empty bands from their neighbours so a gap does not read as radius 0.
  for (let i = 1; i < bands; i++) if (profile[i] === 0) profile[i] = profile[i - 1];
  for (let i = bands - 2; i >= 0; i--) if (profile[i] === 0) profile[i] = profile[i + 1];

  // Dilate: each band takes the widest radius in its neighbourhood rather than
  // in its own slice alone. A garment surface spans several bands between
  // sampled vertices, so clearing only the exact slice lets the body poke
  // through wherever it flares quickly, such as at the shoulders.
  const dilated = new Float32Array(bands);
  const reach = 3;
  for (let i = 0; i < bands; i++) {
    let widest = 0;
    for (let k = Math.max(0, i - reach); k <= Math.min(bands - 1, i + reach); k++) {
      if (profile[k] > widest) widest = profile[k];
    }
    dilated[i] = widest;
  }

  return dilated;
}

export interface FitOptions {
  garment: ImportedGarmentMesh;
  slot: GarmentSlotId;
  skeleton: Skeleton;
  /** The avatar body, used to push the garment outside the skin. */
  body: SkinnedMesh;
  /** Clearance held off the body, as a fraction of height. */
  clearance?: number;
}

export function fitGarmentToBody(options: FitOptions): FitResult {
  const { garment, slot, skeleton, body, clearance = 0.006 } = options;
  const fit = SLOT_FIT[slot];
  const height = skeleton.height;
  const warnings: string[] = [...garment.warnings];

  const fromY = skeleton.bones[boneIndexByName(fit.from)].worldPosition[1];
  const toY = skeleton.bones[boneIndexByName(fit.to)].worldPosition[1];
  const targetBottom = Math.min(fromY, toY) - fit.padBottom * height;
  const targetTop = Math.max(fromY, toY) + fit.padTop * height;
  const targetHeight = Math.max(targetTop - targetBottom, 1e-4);

  const sourceHeight = Math.max(garment.bounds.max[1] - garment.bounds.min[1], 1e-6);
  const sourceWidth = Math.max(garment.bounds.max[0] - garment.bounds.min[0], 1e-6);

  // Scale by height, since that is the dimension a garment shares with the body
  // it belongs on. Scaling by the bounding-box diagonal would let a wide-armed
  // T-posed shirt come out far too small.
  let scale = targetHeight / sourceHeight;

  // Guard against a garment whose proportions are wildly different: if scaling
  // by height makes it absurdly wide, fall back to fitting by width.
  const scaledWidth = sourceWidth * scale;
  const maxWidth = height * (slot === "TOP" ? 0.62 : 0.34);
  if (scaledWidth > maxWidth) {
    scale = maxWidth / sourceWidth;
    warnings.push(
      "The garment's proportions differ a lot from the avatar's, so it was fitted by width instead of height.",
    );
  }

  if (scale > 500 || scale < 0.002) {
    warnings.push(
      `The file's units looked unusual, so it was rescaled by a factor of ${scale.toPrecision(2)}.`,
    );
  }

  const sourceCentreX = (garment.bounds.min[0] + garment.bounds.max[0]) / 2;
  const sourceCentreZ = (garment.bounds.min[2] + garment.bounds.max[2]) / 2;

  const count = garment.vertexCount;
  const positions = new Float32Array(count * 3);

  for (let v = 0; v < count; v++) {
    positions[v * 3] = (garment.positions[v * 3] - sourceCentreX) * scale;
    positions[v * 3 + 1] =
      (garment.positions[v * 3 + 1] - garment.bounds.min[1]) * scale + targetBottom;
    positions[v * 3 + 2] = (garment.positions[v * 3 + 2] - sourceCentreZ) * scale;
  }

  // --- Shrink-wrap outward -------------------------------------------------
  const BANDS = 48;
  const profile = bodyRadiusProfile(body, targetBottom, targetTop, BANDS);
  const gap = clearance * height;
  let pushed = 0;

  for (let v = 0; v < count; v++) {
    const x = positions[v * 3];
    const y = positions[v * 3 + 1];
    const z = positions[v * 3 + 2];

    const band = clamp(
      Math.floor(((y - targetBottom) / targetHeight) * BANDS),
      0,
      BANDS - 1,
    );
    const minRadius = profile[band] + gap;
    const radius = Math.hypot(x, z);

    // Leave vertices near the axis alone: pushing them out would turn the
    // centre of a garment into a ring.
    if (radius > 1e-4 && radius < minRadius) {
      const factor = minRadius / radius;
      positions[v * 3] = x * factor;
      positions[v * 3 + 2] = z * factor;
      pushed++;
    }
  }

  if (pushed > count * 0.5) {
    warnings.push(
      "Much of the garment sat inside the body and was pushed out, so the fit is approximate.",
    );
  }

  // --- Skin ----------------------------------------------------------------
  const parts: MeshPart[] = [
    { name: `uploaded-${slot.toLowerCase()}`, boneCandidates: fit.bones, startVertex: 0, vertexCount: count },
  ];

  const { joints, weights } = computeSkinWeights(positions, parts, skeleton);

  // Normals must be recomputed: the shrink-wrap moved vertices, so the
  // uploaded normals no longer match the surface.
  const normals = recomputeNormals(positions, garment.indices);

  return {
    positions,
    normals,
    uvs: garment.uvs,
    joints,
    weights,
    indices: garment.indices,
    parts,
    warnings,
    appliedScale: scale,
  };
}

function recomputeNormals(positions: Float32Array, indices: Uint32Array): Float32Array {
  const normals = new Float32Array(positions.length);

  for (let t = 0; t < indices.length; t += 3) {
    const a = indices[t];
    const b = indices[t + 1];
    const c = indices[t + 2];

    const e1: Vec3 = [
      positions[b * 3] - positions[a * 3],
      positions[b * 3 + 1] - positions[a * 3 + 1],
      positions[b * 3 + 2] - positions[a * 3 + 2],
    ];
    const e2: Vec3 = [
      positions[c * 3] - positions[a * 3],
      positions[c * 3 + 1] - positions[a * 3 + 1],
      positions[c * 3 + 2] - positions[a * 3 + 2],
    ];

    const nx = e1[1] * e2[2] - e1[2] * e2[1];
    const ny = e1[2] * e2[0] - e1[0] * e2[2];
    const nz = e1[0] * e2[1] - e1[1] * e2[0];

    for (const index of [a, b, c]) {
      normals[index * 3] += nx;
      normals[index * 3 + 1] += ny;
      normals[index * 3 + 2] += nz;
    }
  }

  for (let i = 0; i < normals.length; i += 3) {
    const length = Math.hypot(normals[i], normals[i + 1], normals[i + 2]);
    if (length > 0) {
      normals[i] /= length;
      normals[i + 1] /= length;
      normals[i + 2] /= length;
    } else {
      normals[i + 1] = 1;
    }
  }

  return normals;
}
