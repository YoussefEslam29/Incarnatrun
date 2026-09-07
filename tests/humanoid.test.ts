import { describe, it, expect } from "vitest";
import { buildHumanoid } from "@/lib/avatar-engine/geometry/humanoid";
import { buildSkeleton, MIXAMO_BONES } from "@/lib/avatar-engine/geometry/skeleton";
import { bodyParamsSchema, defaultBodyParams, defaultFaceParams } from "@/lib/avatar-engine/params";

function build(overrides: Record<string, unknown> = {}) {
  const body = bodyParamsSchema.parse(overrides);
  return buildHumanoid(body, defaultFaceParams(), buildSkeleton(body));
}

function bounds(positions: Float32Array) {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < positions.length; i += 3) {
    for (let c = 0; c < 3; c++) {
      const v = positions[i + c];
      if (v < min[c]) min[c] = v;
      if (v > max[c]) max[c] = v;
    }
  }
  return { min, max };
}

describe("buildHumanoid", () => {
  const mesh = build();

  it("produces matching counts across every vertex attribute", () => {
    const vertexCount = mesh.positions.length / 3;

    expect(vertexCount).toBeGreaterThan(200);
    expect(mesh.normals.length).toBe(vertexCount * 3);
    expect(mesh.uvs.length).toBe(vertexCount * 2);
    expect(mesh.joints.length).toBe(vertexCount * 4);
    expect(mesh.weights.length).toBe(vertexCount * 4);
  });

  it("emits whole triangles with in-range indices", () => {
    const vertexCount = mesh.positions.length / 3;

    expect(mesh.indices.length % 3).toBe(0);
    expect(mesh.indices.length).toBeGreaterThan(300);
    for (const index of mesh.indices) {
      expect(index).toBeGreaterThanOrEqual(0);
      expect(index).toBeLessThan(vertexCount);
    }
  });

  it("contains no NaN or infinite values", () => {
    for (const array of [mesh.positions, mesh.normals, mesh.uvs, mesh.weights]) {
      for (const value of array) {
        expect(Number.isFinite(value)).toBe(true);
      }
    }
  });

  it("has unit-length normals", () => {
    for (let i = 0; i < mesh.normals.length; i += 3) {
      const len = Math.hypot(mesh.normals[i], mesh.normals[i + 1], mesh.normals[i + 2]);
      expect(len).toBeCloseTo(1, 4);
    }
  });

  it("keeps every UV inside the 0..1 atlas", () => {
    for (const uv of mesh.uvs) {
      expect(uv).toBeGreaterThanOrEqual(0);
      expect(uv).toBeLessThanOrEqual(1);
    }
  });

  it("stands on the ground and reaches the requested height", () => {
    for (const heightCm of [150, 175, 200]) {
      const m = build({ heightCm });
      const { min, max } = bounds(m.positions);

      expect(min[1]).toBeGreaterThan(-0.02);
      expect(min[1]).toBeLessThan(0.02);
      // The crown of the head is the top of the mesh.
      expect(max[1]).toBeGreaterThan(heightCm / 100 - 0.06);
      expect(max[1]).toBeLessThan(heightCm / 100 + 0.06);
    }
  });

  it("is left-right symmetric about the YZ plane", () => {
    const { min, max } = bounds(mesh.positions);
    expect(min[0]).toBeCloseTo(-max[0], 3);
  });

  it("normalises skin weights to sum to one for every vertex", () => {
    for (let i = 0; i < mesh.weights.length; i += 4) {
      const sum =
        mesh.weights[i] + mesh.weights[i + 1] + mesh.weights[i + 2] + mesh.weights[i + 3];
      expect(sum).toBeCloseTo(1, 5);
    }
  });

  it("never emits a negative weight", () => {
    for (const w of mesh.weights) {
      expect(w).toBeGreaterThanOrEqual(0);
    }
  });

  it("references only bones that exist", () => {
    for (const joint of mesh.joints) {
      expect(joint).toBeLessThan(MIXAMO_BONES.length);
    }
  });

  it("pairs every zero weight with joint index zero, so unused slots are inert", () => {
    for (let i = 0; i < mesh.weights.length; i += 4) {
      for (let k = 0; k < 4; k++) {
        if (mesh.weights[i + k] === 0) {
          expect(mesh.joints[i + k]).toBe(0);
        }
      }
    }
  });

  it("binds head vertices to the head bone", () => {
    const headBone = MIXAMO_BONES.findIndex((b) => b.name === "mixamorig:Head");
    const skeleton = buildSkeleton(defaultBodyParams());
    const headY = skeleton.bones[headBone].worldPosition[1];

    let checked = 0;
    for (let v = 0; v < mesh.positions.length / 3; v++) {
      // A vertex well above the head joint can only belong to the head.
      if (mesh.positions[v * 3 + 1] > headY + 0.08) {
        const joints = [
          mesh.joints[v * 4],
          mesh.joints[v * 4 + 1],
          mesh.joints[v * 4 + 2],
          mesh.joints[v * 4 + 3],
        ];
        expect(joints).toContain(headBone);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(0);
  });

  it("binds hand vertices to an arm bone and never to a leg bone", () => {
    const legBones = MIXAMO_BONES.map((b, i) => (b.chain === "leg" ? i : -1)).filter((i) => i >= 0);
    const skeleton = buildSkeleton(defaultBodyParams());
    const handX = skeleton.bones[MIXAMO_BONES.findIndex((b) => b.name === "mixamorig:LeftHand")]
      .worldPosition[0];

    let checked = 0;
    for (let v = 0; v < mesh.positions.length / 3; v++) {
      if (mesh.positions[v * 3] > handX - 0.02) {
        for (let k = 0; k < 4; k++) {
          if (mesh.weights[v * 4 + k] > 0) {
            expect(legBones).not.toContain(mesh.joints[v * 4 + k]);
          }
        }
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(0);
  });

  it("gets wider as build increases, without getting taller", () => {
    const slim = bounds(build({ build: 0, chest: 0, waist: 0, hips: 0 }).positions);
    const heavy = bounds(build({ build: 1, chest: 1, waist: 1, hips: 1 }).positions);

    expect(heavy.max[2] - heavy.min[2]).toBeGreaterThan(slim.max[2] - slim.min[2]);
    expect(heavy.max[1]).toBeCloseTo(slim.max[1], 2);
  });

  it("widens the arm span as shoulder width increases", () => {
    const narrow = bounds(build({ shoulderWidth: 0 }).positions);
    const wide = bounds(build({ shoulderWidth: 1 }).positions);

    expect(wide.max[0]).toBeGreaterThan(narrow.max[0]);
  });

  it("scales the skull with the head-size slider without changing total height", () => {
    const small = build({ headSize: 0 });
    const large = build({ headSize: 1 });

    // Every radius grows.
    expect(large.head.radii[0]).toBeGreaterThan(small.head.radii[0]);
    expect(large.head.radii[1]).toBeGreaterThan(small.head.radii[1]);
    expect(large.head.radii[2]).toBeGreaterThan(small.head.radii[2]);

    // The crown stays pinned to the skeleton, so the avatar is still exactly as
    // tall as the user asked for. A head slider that changed height would make
    // the height slider a lie.
    expect(bounds(large.positions).max[1]).toBeCloseTo(bounds(small.positions).max[1], 5);
  });

  it("makes a bigger head visibly wider in the mesh", () => {
    const widthOf = (headSize: number) => {
      const m = build({ headSize });
      const headBottom = m.head.center[1];
      let maxX = 0;
      for (let v = 0; v < m.positions.length / 3; v++) {
        if (m.positions[v * 3 + 1] > headBottom) {
          maxX = Math.max(maxX, Math.abs(m.positions[v * 3]));
        }
      }
      return maxX;
    };

    expect(widthOf(1)).toBeGreaterThan(widthOf(0));
  });

  it("faces +Z: the toes point forward", () => {
    const { max, min } = bounds(mesh.positions);
    expect(Math.abs(max[2])).toBeGreaterThan(Math.abs(min[2]));
  });

  it("is deterministic for identical parameters", () => {
    const a = build();
    const b = build();
    expect(Array.from(a.positions)).toEqual(Array.from(b.positions));
    expect(Array.from(a.indices)).toEqual(Array.from(b.indices));
  });

  it("maps forward-facing head vertices to the centre of the head atlas", () => {
    const headPart = mesh.parts.find((p) => p.name === "head")!;
    expect(headPart).toBeDefined();

    let frontFaceVerts = 0;
    for (let v = headPart.startVertex; v < headPart.startVertex + headPart.vertexCount; v++) {
      // Forward of the head centre, so genuinely part of the face.
      if (mesh.positions[v * 3 + 2] > mesh.head.center[2] + mesh.head.radii[2] * 0.5) {
        // The head atlas spans the full U range with the face at its centre,
        // so a forward-facing vertex sits near u = 0.5.
        expect(Math.abs(mesh.uvs[v * 2] - 0.5)).toBeLessThan(0.2);
        frontFaceVerts++;
      }
    }
    expect(frontFaceVerts).toBeGreaterThan(10);
  });

  it("keeps the head and body in separate atlas regions", () => {
    const headPart = mesh.parts.find((p) => p.name === "head")!;
    const torsoPart = mesh.parts.find((p) => p.name === "torso")!;

    for (let v = headPart.startVertex; v < headPart.startVertex + headPart.vertexCount; v++) {
      expect(mesh.uvs[v * 2 + 1]).toBeLessThanOrEqual(0.875 + 1e-6);
    }
    for (let v = torsoPart.startVertex; v < torsoPart.startVertex + torsoPart.vertexCount; v++) {
      expect(mesh.uvs[v * 2 + 1]).toBeGreaterThanOrEqual(0.875 - 1e-6);
    }
  });
});
