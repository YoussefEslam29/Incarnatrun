/**
 * Mesh accumulation and the two surface primitives the humanoid is built from.
 *
 * Everything is a tube or an ellipsoid. A tube is a stack of cross-section
 * rings, which covers torso, neck, limbs and fingers; an ellipsoid covers the
 * head. Keeping to two primitives means UVs, normals and winding order are
 * solved once each rather than per body part.
 */

import { normalize, type Vec3 } from "./math";

/**
 * UV atlas regions. The generated texture is laid out to match these exactly.
 *
 * The head takes the top seven eighths of the sheet and the full width. That is
 * a lopsided split, and deliberately so: the head carries the user's actual
 * face, which is the entire point of the product, while the body is close to a
 * flat colour and needs almost no texture space at all.
 *
 * Note that glTF's V axis points DOWN the image, so v=0 is the top row.
 */
export const ATLAS = {
  /** Equirectangular head map. Azimuth across U, elevation down V. */
  head: { u0: 0.0, u1: 1.0, v0: 0.0, v1: 0.875 },
  /** Body skin. Cylindrically unwrapped; close to a flat colour. */
  body: { u0: 0.0, u1: 0.5, v0: 0.875, v1: 1.0 },
  /** Reserved for detail and future garment baking. */
  detail: { u0: 0.5, u1: 1.0, v0: 0.875, v1: 1.0 },
} as const;

/**
 * Which way a tube runs. Body parts do not all run vertically: arms run
 * sideways in a T-pose and feet run forwards, and stacking their rings along Y
 * collapses them into flat slabs.
 */
export type TubeAxis = "x" | "y" | "z";

/**
 * Basis for each axis, chosen so that u x v = -n in every case. Keeping the
 * handedness identical across axes means one triangle winding order is correct
 * for all of them, instead of each axis needing its own.
 */
const TUBE_BASIS: Record<TubeAxis, { u: Vec3; v: Vec3 }> = {
  y: { u: [1, 0, 0], v: [0, 0, 1] },
  x: { u: [0, 0, 1], v: [0, 1, 0] },
  z: { u: [0, 1, 0], v: [1, 0, 0] },
};

export interface Ring {
  center: Vec3;
  /** Radius along the axis's first in-plane direction. */
  radiusU: number;
  /** Radius along the axis's second in-plane direction. */
  radiusV: number;
  /** Position along the part, 0..1, used for the texture V coordinate. */
  t: number;
}

export interface SurfaceVertex {
  position: Vec3;
  normal: Vec3;
  uv: [number, number];
}

/**
 * A mesh bound to the avatar skeleton.
 *
 * The body and every garment share this shape and the same rig, which is what
 * lets clothing be exported as extra primitives on one skinned mesh rather than
 * as separate objects that have to be re-rigged.
 */
export interface SkinnedMesh {
  positions: Float32Array;
  normals: Float32Array;
  uvs: Float32Array;
  joints: Uint8Array;
  weights: Float32Array;
  indices: Uint32Array;
  parts: MeshPart[];
}

/**
 * A named group of vertices sharing one set of candidate bones.
 *
 * Restricting skinning to a declared candidate set is what stops a hand vertex
 * from picking up weight from the hip bone simply because the arms hang near
 * the body. It is the single most important correctness decision in the rig.
 */
export interface MeshPart {
  name: string;
  boneCandidates: string[];
  /** Index of the first vertex belonging to this part. */
  startVertex: number;
  /** Number of vertices in this part. */
  vertexCount: number;
}

export class MeshAccumulator {
  readonly positions: number[] = [];
  readonly normals: number[] = [];
  readonly uvs: number[] = [];
  readonly indices: number[] = [];
  readonly parts: MeshPart[] = [];

  get vertexCount(): number {
    return this.positions.length / 3;
  }

  private pushVertex(v: SurfaceVertex): void {
    this.positions.push(v.position[0], v.position[1], v.position[2]);
    const n = normalize(v.normal);
    this.normals.push(n[0], n[1], n[2]);
    this.uvs.push(v.uv[0], v.uv[1]);
  }

  /**
   * Adds a group of vertices and triangles as one skinning part.
   *
   * `triangles` indexes into `vertices` locally; the offset into the merged
   * buffers is applied here so callers never deal with global indices.
   */
  addPart(
    name: string,
    boneCandidates: string[],
    vertices: SurfaceVertex[],
    triangles: number[],
  ): void {
    const startVertex = this.vertexCount;

    for (const vertex of vertices) {
      this.pushVertex(vertex);
    }
    for (const index of triangles) {
      this.indices.push(startVertex + index);
    }

    this.parts.push({
      name,
      boneCandidates,
      startVertex,
      vertexCount: vertices.length,
    });
  }
}

interface Region {
  u0: number;
  u1: number;
  v0: number;
  v1: number;
}

function mapU(region: Region, s: number): number {
  return region.u0 + (region.u1 - region.u0) * s;
}

/**
 * Maps a bottom-up parameter to a V coordinate.
 *
 * glTF's V axis runs down the image, so a part parameterised from its base to
 * its top has to be flipped here. Without this the face is rendered upside
 * down, which is invisible in the geometry tests and glaring in the viewer.
 */
function mapV(region: Region, s: number): number {
  return region.v0 + (region.v1 - region.v0) * (1 - s);
}

export interface TubeOptions {
  /** Vertices around the circumference. */
  radialSegments: number;
  region: Region;
  /** Direction the rings are stacked along. Defaults to "y". */
  axis?: TubeAxis;
  /** Close the first ring with a fan. */
  capStart?: boolean;
  /** Close the last ring with a fan. */
  capEnd?: boolean;
}

/**
 * Builds a tube through a stack of elliptical rings.
 *
 * The ring loop is not closed by reusing vertex 0: the seam column is
 * duplicated with u=1 instead of u=0, otherwise the whole texture is squeezed
 * backwards across the last quad.
 */
export function buildTube(
  rings: Ring[],
  options: TubeOptions,
): { vertices: SurfaceVertex[]; triangles: number[] } {
  const { radialSegments, region, axis = "y" } = options;
  const { u, v } = TUBE_BASIS[axis];
  const vertices: SurfaceVertex[] = [];
  const triangles: number[] = [];
  const columns = radialSegments + 1;

  for (const ring of rings) {
    for (let i = 0; i < columns; i++) {
      const s = i / radialSegments;
      const angle = s * Math.PI * 2;
      const sin = Math.sin(angle);
      const cos = Math.cos(angle);

      const offsetU = sin * ring.radiusU;
      const offsetV = cos * ring.radiusV;

      const position: Vec3 = [
        ring.center[0] + u[0] * offsetU + v[0] * offsetV,
        ring.center[1] + u[1] * offsetU + v[1] * offsetV,
        ring.center[2] + u[2] * offsetU + v[2] * offsetV,
      ];

      // The normal of an ellipse is not its radial direction; each component is
      // scaled by the reciprocal of its own semi-axis.
      const normalU = (sin * ring.radiusV) / Math.max(ring.radiusU, 1e-6);
      const normalV = (cos * ring.radiusU) / Math.max(ring.radiusV, 1e-6);

      const normal: Vec3 = [
        u[0] * normalU + v[0] * normalV,
        u[1] * normalU + v[1] * normalV,
        u[2] * normalU + v[2] * normalV,
      ];

      vertices.push({
        position,
        normal,
        uv: [mapU(region, s), mapV(region, ring.t)],
      });
    }
  }

  for (let r = 0; r < rings.length - 1; r++) {
    for (let i = 0; i < radialSegments; i++) {
      const a = r * columns + i;
      const b = a + 1;
      const c = (r + 1) * columns + i;
      const d = c + 1;
      // Counter-clockwise when seen from outside, which is glTF's front face.
      triangles.push(a, c, b, b, c, d);
    }
  }

  if (options.capStart) {
    addCap(vertices, triangles, rings[0], 0, region, radialSegments, columns, -1, axis);
  }
  if (options.capEnd) {
    const lastRingStart = (rings.length - 1) * columns;
    addCap(
      vertices,
      triangles,
      rings[rings.length - 1],
      lastRingStart,
      region,
      radialSegments,
      columns,
      1,
      axis,
    );
  }

  return { vertices, triangles };
}

/** Closes one end of a tube with a triangle fan around a new centre vertex. */
function addCap(
  vertices: SurfaceVertex[],
  triangles: number[],
  ring: Ring,
  ringStart: number,
  region: Region,
  radialSegments: number,
  columns: number,
  direction: -1 | 1,
  axis: TubeAxis,
): void {
  const normalAxis: Vec3 = axis === "x" ? [1, 0, 0] : axis === "z" ? [0, 0, 1] : [0, 1, 0];

  const centerIndex = vertices.length;
  vertices.push({
    position: [...ring.center],
    normal: [
      normalAxis[0] * direction,
      normalAxis[1] * direction,
      normalAxis[2] * direction,
    ],
    uv: [mapU(region, 0.5), mapV(region, ring.t)],
  });

  for (let i = 0; i < radialSegments; i++) {
    const a = ringStart + i;
    const b = ringStart + ((i + 1) % columns);
    if (direction === 1) {
      triangles.push(centerIndex, a, b);
    } else {
      triangles.push(centerIndex, b, a);
    }
  }
}

export interface EllipsoidOptions {
  center: Vec3;
  radii: Vec3;
  /** Vertices around the equator. */
  radialSegments: number;
  /** Vertices from pole to pole. */
  heightSegments: number;
  region: Region;
  /**
   * Rotates the U origin so a chosen azimuth lands at the centre of the region.
   * The head uses this to put the face in the middle of its atlas strip.
   */
  uOffset?: number;
}

/**
 * Builds an ellipsoid with an equirectangular UV map.
 *
 * Used for the head. The azimuth runs the full 360 degrees across the region's
 * U range, so the face occupies the middle of the strip and the seam falls at
 * the back of the skull where nothing is looking.
 */
export function buildEllipsoid(
  options: EllipsoidOptions,
): { vertices: SurfaceVertex[]; triangles: number[] } {
  const { center, radii, radialSegments, heightSegments, region, uOffset = 0 } = options;
  const vertices: SurfaceVertex[] = [];
  const triangles: number[] = [];
  const columns = radialSegments + 1;

  for (let row = 0; row <= heightSegments; row++) {
    const v = row / heightSegments;
    // phi runs from the south pole to the north pole.
    const phi = (v - 0.5) * Math.PI;
    const cosPhi = Math.cos(phi);
    const sinPhi = Math.sin(phi);

    for (let col = 0; col < columns; col++) {
      const s = col / radialSegments;
      const theta = (s - 0.5) * Math.PI * 2;
      const sinTheta = Math.sin(theta);
      const cosTheta = Math.cos(theta);

      // theta = 0 points at +Z, the front of the head.
      const unit: Vec3 = [cosPhi * sinTheta, sinPhi, cosPhi * cosTheta];

      const position: Vec3 = [
        center[0] + unit[0] * radii[0],
        center[1] + unit[1] * radii[1],
        center[2] + unit[2] * radii[2],
      ];

      const normal: Vec3 = [unit[0] / radii[0], unit[1] / radii[1], unit[2] / radii[2]];

      let u = s + uOffset;
      u = u - Math.floor(u);

      vertices.push({
        position,
        normal,
        uv: [mapU(region, u), mapV(region, v)],
      });
    }
  }

  for (let row = 0; row < heightSegments; row++) {
    for (let col = 0; col < radialSegments; col++) {
      const a = row * columns + col;
      const b = a + 1;
      const c = (row + 1) * columns + col;
      const d = c + 1;

      // Skip the degenerate triangles that collapse at each pole.
      if (row !== 0) triangles.push(a, c, b);
      if (row !== heightSegments - 1) triangles.push(b, c, d);
    }
  }

  return { vertices, triangles };
}
