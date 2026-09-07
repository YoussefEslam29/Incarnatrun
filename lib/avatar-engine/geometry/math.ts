/**
 * Minimal vector and matrix maths for avatar generation.
 *
 * Hand-rolled rather than pulled from three.js because generation runs on the
 * server, where importing a renderer to multiply four-by-four matrices would be
 * absurd. Matrices are column-major Float32Array(16), matching glTF exactly, so
 * no conversion happens anywhere between here and the file on disk.
 */

export type Vec3 = [number, number, number];
export type Mat4 = Float32Array;

// ---------------------------------------------------------------------------
// Scalars
// ---------------------------------------------------------------------------

export function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Hermite ease used to blend body-shape influences without visible seams. */
export function smoothstep(t: number): number {
  const x = clamp(t, 0, 1);
  return x * x * (3 - 2 * x);
}

/** Maps a 0..1 slider to a range, which is how every body parameter is applied. */
export function remap(t: number, min: number, max: number): number {
  return lerp(min, max, clamp(t, 0, 1));
}

// ---------------------------------------------------------------------------
// Vectors
// ---------------------------------------------------------------------------

export function subtract(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

export function add(a: Vec3, b: Vec3): Vec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

export function scale(a: Vec3, s: number): Vec3 {
  return [a[0] * s, a[1] * s, a[2] * s];
}

export function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

export function cross(a: Vec3, b: Vec3): Vec3 {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

export function length(a: Vec3): number {
  return Math.hypot(a[0], a[1], a[2]);
}

export function normalize(a: Vec3): Vec3 {
  const len = length(a);
  return len === 0 ? [0, 0, 0] : [a[0] / len, a[1] / len, a[2] / len];
}

export function distance(a: Vec3, b: Vec3): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

export interface ClosestPoint {
  point: Vec3;
  /** Parametric position along the segment, clamped to 0..1. */
  t: number;
  distance: number;
}

/**
 * Closest point on segment `a`-`b` to point `p`.
 *
 * This is the core of skin weighting: a vertex belongs to the bones whose
 * segments it sits nearest to.
 */
export function closestPointOnSegment(p: Vec3, a: Vec3, b: Vec3): ClosestPoint {
  const ab = subtract(b, a);
  const lengthSquared = dot(ab, ab);

  // A zero-length segment has no direction to project onto. Treat it as the
  // single point `a` instead of dividing by zero.
  if (lengthSquared === 0) {
    return { point: [...a], t: 0, distance: distance(p, a) };
  }

  const t = clamp(dot(subtract(p, a), ab) / lengthSquared, 0, 1);
  const point = add(a, scale(ab, t));
  return { point, t, distance: distance(p, point) };
}

// ---------------------------------------------------------------------------
// Matrices (column-major, glTF layout)
// ---------------------------------------------------------------------------

export function identityMat4(): Mat4 {
  // prettier-ignore
  return new Float32Array([
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    0, 0, 0, 1,
  ]);
}

export function translationMat4(x: number, y: number, z: number): Mat4 {
  // prettier-ignore
  return new Float32Array([
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    x, y, z, 1,
  ]);
}

/** Returns `a * b`, applying `b` first then `a` when transforming a point. */
export function multiplyMat4(a: Mat4, b: Mat4): Mat4 {
  const out = new Float32Array(16);
  for (let col = 0; col < 4; col++) {
    for (let row = 0; row < 4; row++) {
      let sum = 0;
      for (let k = 0; k < 4; k++) {
        sum += a[k * 4 + row] * b[col * 4 + k];
      }
      out[col * 4 + row] = sum;
    }
  }
  return out;
}

export function transformPoint(m: Mat4, p: Vec3): Vec3 {
  const x = m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12];
  const y = m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13];
  const z = m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14];
  return [x, y, z];
}

/**
 * General 4x4 inverse via cofactor expansion.
 *
 * Throws on a singular matrix rather than returning NaNs, because a silently
 * broken inverse bind matrix produces an avatar that renders as an exploded
 * mess with no error anywhere to explain it.
 */
export function invertMat4(m: Mat4): Mat4 {
  const [
    m00, m01, m02, m03,
    m10, m11, m12, m13,
    m20, m21, m22, m23,
    m30, m31, m32, m33,
  ] = m;

  const b00 = m00 * m11 - m01 * m10;
  const b01 = m00 * m12 - m02 * m10;
  const b02 = m00 * m13 - m03 * m10;
  const b03 = m01 * m12 - m02 * m11;
  const b04 = m01 * m13 - m03 * m11;
  const b05 = m02 * m13 - m03 * m12;
  const b06 = m20 * m31 - m21 * m30;
  const b07 = m20 * m32 - m22 * m30;
  const b08 = m20 * m33 - m23 * m30;
  const b09 = m21 * m32 - m22 * m31;
  const b10 = m21 * m33 - m23 * m31;
  const b11 = m22 * m33 - m23 * m32;

  const det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;

  if (det === 0 || !Number.isFinite(det)) {
    throw new Error("Cannot invert a singular matrix.");
  }

  const invDet = 1 / det;

  return new Float32Array([
    (m11 * b11 - m12 * b10 + m13 * b09) * invDet,
    (m02 * b10 - m01 * b11 - m03 * b09) * invDet,
    (m31 * b05 - m32 * b04 + m33 * b03) * invDet,
    (m22 * b04 - m21 * b05 - m23 * b03) * invDet,

    (m12 * b08 - m10 * b11 - m13 * b07) * invDet,
    (m00 * b11 - m02 * b08 + m03 * b07) * invDet,
    (m32 * b02 - m30 * b05 - m33 * b01) * invDet,
    (m20 * b05 - m22 * b02 + m23 * b01) * invDet,

    (m10 * b10 - m11 * b08 + m13 * b06) * invDet,
    (m01 * b08 - m00 * b10 - m03 * b06) * invDet,
    (m30 * b04 - m31 * b02 + m33 * b00) * invDet,
    (m21 * b02 - m20 * b04 - m23 * b00) * invDet,

    (m11 * b07 - m10 * b09 - m12 * b06) * invDet,
    (m00 * b09 - m01 * b07 + m02 * b06) * invDet,
    (m31 * b01 - m30 * b03 - m32 * b00) * invDet,
    (m20 * b03 - m21 * b01 + m22 * b00) * invDet,
  ]);
}
