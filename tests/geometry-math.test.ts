import { describe, it, expect } from "vitest";
import {
  identityMat4,
  translationMat4,
  multiplyMat4,
  invertMat4,
  transformPoint,
  distance,
  closestPointOnSegment,
  lerp,
  clamp,
  smoothstep,
} from "@/lib/avatar-engine/geometry/math";

describe("mat4", () => {
  it("identity is the multiplicative identity", () => {
    const m = translationMat4(1, 2, 3);
    expect(Array.from(multiplyMat4(identityMat4(), m))).toEqual(Array.from(m));
    expect(Array.from(multiplyMat4(m, identityMat4()))).toEqual(Array.from(m));
  });

  it("stores translation in the column-major translation slots", () => {
    const m = translationMat4(4, 5, 6);
    expect(m[12]).toBe(4);
    expect(m[13]).toBe(5);
    expect(m[14]).toBe(6);
    expect(m[15]).toBe(1);
  });

  it("composes translations by multiplication", () => {
    const a = translationMat4(1, 0, 0);
    const b = translationMat4(0, 2, 0);
    const ab = multiplyMat4(a, b);

    expect(transformPoint(ab, [0, 0, 0])).toEqual([1, 2, 0]);
  });

  it("inverts a translation matrix", () => {
    const m = translationMat4(3, -4, 5);
    const inv = invertMat4(m);

    expect(transformPoint(inv, [3, -4, 5])).toEqual([0, 0, 0]);
  });

  it("round-trips an arbitrary invertible matrix", () => {
    // A translation combined with a non-uniform scale.
    const m = new Float32Array([
      2, 0, 0, 0,
      0, 3, 0, 0,
      0, 0, 4, 0,
      5, 6, 7, 1,
    ]);
    const product = multiplyMat4(m, invertMat4(m));

    for (let i = 0; i < 16; i++) {
      expect(product[i]).toBeCloseTo(identityMat4()[i], 5);
    }
  });

  it("throws on a singular matrix rather than returning garbage", () => {
    const singular = new Float32Array(16); // all zeros
    expect(() => invertMat4(singular)).toThrow(/singular/i);
  });
});

describe("closestPointOnSegment", () => {
  it("returns the perpendicular foot when it falls inside the segment", () => {
    const r = closestPointOnSegment([0, 1, 0], [-1, 0, 0], [1, 0, 0]);
    expect(r.point).toEqual([0, 0, 0]);
    expect(r.t).toBeCloseTo(0.5);
    expect(r.distance).toBeCloseTo(1);
  });

  it("clamps to the start of the segment", () => {
    const r = closestPointOnSegment([-5, 0, 0], [-1, 0, 0], [1, 0, 0]);
    expect(r.t).toBe(0);
    expect(r.point).toEqual([-1, 0, 0]);
    expect(r.distance).toBeCloseTo(4);
  });

  it("clamps to the end of the segment", () => {
    const r = closestPointOnSegment([5, 0, 0], [-1, 0, 0], [1, 0, 0]);
    expect(r.t).toBe(1);
    expect(r.point).toEqual([1, 0, 0]);
  });

  it("handles a degenerate zero-length segment without dividing by zero", () => {
    const r = closestPointOnSegment([0, 3, 0], [1, 1, 1], [1, 1, 1]);
    expect(r.t).toBe(0);
    expect(Number.isFinite(r.distance)).toBe(true);
    expect(r.distance).toBeCloseTo(distance([0, 3, 0], [1, 1, 1]));
  });
});

describe("scalar helpers", () => {
  it("lerp interpolates and extrapolates linearly", () => {
    expect(lerp(0, 10, 0)).toBe(0);
    expect(lerp(0, 10, 1)).toBe(10);
    expect(lerp(0, 10, 0.25)).toBe(2.5);
  });

  it("clamp bounds a value to the range", () => {
    expect(clamp(5, 0, 1)).toBe(1);
    expect(clamp(-5, 0, 1)).toBe(0);
    expect(clamp(0.5, 0, 1)).toBe(0.5);
  });

  it("smoothstep is flat at both ends and centred at the midpoint", () => {
    expect(smoothstep(0)).toBe(0);
    expect(smoothstep(1)).toBe(1);
    expect(smoothstep(0.5)).toBeCloseTo(0.5);
    expect(smoothstep(-1)).toBe(0);
    expect(smoothstep(2)).toBe(1);
  });
});
