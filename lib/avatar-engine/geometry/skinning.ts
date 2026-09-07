/**
 * Skin weighting: binds each vertex to the bones that should move it.
 *
 * The approach is distance-to-bone-segment, but restricted to the candidate
 * bones the mesh part declares. That restriction is what makes it work: a
 * global nearest-bone search binds hand vertices to the hip in a T-pose,
 * because the wrist of a short-armed avatar can genuinely sit closer to the hip
 * joint than to the elbow.
 *
 * glTF stores four influences per vertex (JOINTS_0 / WEIGHTS_0 are both VEC4),
 * so we keep the four strongest and renormalise.
 */

import { closestPointOnSegment, type Vec3 } from "./math";
import type { MeshPart } from "./mesh";
import { boneIndexByName, MIXAMO_BONES, type Skeleton } from "./skeleton";

const INFLUENCES = 4;

/** Falloff sharpness. Higher values make the bind tighter around each bone. */
const FALLOFF_POWER = 4;

export interface SkinWeights {
  /** Four bone indices per vertex. */
  joints: Uint8Array;
  /** Four weights per vertex, summing to 1. */
  weights: Float32Array;
}

interface BoneSegment {
  index: number;
  head: Vec3;
  tail: Vec3;
}

/**
 * The line each bone deforms along.
 *
 * A bone's own position is only a joint; what a vertex should be measured
 * against is the limb between that joint and the next one down the chain. For
 * a leaf bone there is no next joint, so the segment is extrapolated a short
 * way along the direction it came from.
 */
export function boneSegments(skeleton: Skeleton): BoneSegment[] {
  const firstChild = new Map<number, number>();
  MIXAMO_BONES.forEach((bone, index) => {
    if (bone.parent >= 0 && !firstChild.has(bone.parent)) {
      firstChild.set(bone.parent, index);
    }
  });

  return skeleton.bones.map((bone, index) => {
    const head = bone.worldPosition;
    const child = firstChild.get(index);

    if (child !== undefined) {
      return { index, head, tail: skeleton.bones[child].worldPosition };
    }

    // Leaf: extend a quarter of the way past the joint, along the incoming
    // direction, so the segment has a sensible length rather than zero.
    const parent = bone.parent >= 0 ? skeleton.bones[bone.parent].worldPosition : head;
    const tail: Vec3 = [
      head[0] + (head[0] - parent[0]) * 0.25,
      head[1] + (head[1] - parent[1]) * 0.25,
      head[2] + (head[2] - parent[2]) * 0.25,
    ];
    return { index, head, tail };
  });
}

/**
 * Computes joint indices and weights for every vertex in the mesh.
 *
 * Weight falls off as an inverse power of distance to the bone segment, so a
 * vertex near a joint blends between the two bones that meet there and a vertex
 * mid-limb is bound almost entirely to one.
 */
export function computeSkinWeights(
  positions: Float32Array,
  parts: MeshPart[],
  skeleton: Skeleton,
): SkinWeights {
  const vertexCount = positions.length / 3;
  const joints = new Uint8Array(vertexCount * INFLUENCES);
  const weights = new Float32Array(vertexCount * INFLUENCES);

  const segments = boneSegments(skeleton);

  for (const part of parts) {
    const candidates = part.boneCandidates.map((name) => segments[boneIndexByName(name)]);

    if (candidates.length === 0) {
      throw new Error(`Mesh part "${part.name}" declares no candidate bones.`);
    }

    for (let v = part.startVertex; v < part.startVertex + part.vertexCount; v++) {
      const point: Vec3 = [positions[v * 3], positions[v * 3 + 1], positions[v * 3 + 2]];

      // Score every candidate, then keep the strongest four.
      const scored = candidates.map((segment) => {
        const { distance } = closestPointOnSegment(point, segment.head, segment.tail);
        // The epsilon both avoids a division by zero for a vertex sitting
        // exactly on a bone and caps how dominant such a vertex becomes.
        return { index: segment.index, score: 1 / Math.pow(distance + 1e-3, FALLOFF_POWER) };
      });

      scored.sort((a, b) => b.score - a.score);
      const top = scored.slice(0, INFLUENCES);
      const total = top.reduce((sum, s) => sum + s.score, 0);

      for (let k = 0; k < INFLUENCES; k++) {
        const slot = v * INFLUENCES + k;
        if (k < top.length && total > 0) {
          joints[slot] = top[k].index;
          weights[slot] = top[k].score / total;
        } else {
          // Unused slots must be joint 0 with weight 0 so they contribute
          // nothing; a stale joint index with weight 0 is legal but confuses
          // some importers.
          joints[slot] = 0;
          weights[slot] = 0;
        }
      }

      // Renormalise against float error from the divisions above, so the
      // weights sum to exactly 1 as the spec requires.
      let sum = 0;
      for (let k = 0; k < INFLUENCES; k++) sum += weights[v * INFLUENCES + k];
      if (sum > 0) {
        for (let k = 0; k < INFLUENCES; k++) weights[v * INFLUENCES + k] /= sum;
      } else {
        // Should be unreachable, but a vertex bound to nothing would vanish at
        // the origin during skinning. Bind it rigidly to the first candidate.
        joints[v * INFLUENCES] = candidates[0].index;
        weights[v * INFLUENCES] = 1;
      }
    }
  }

  return { joints, weights };
}
