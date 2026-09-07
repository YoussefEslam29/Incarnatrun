import { describe, it, expect } from "vitest";
import { validateBytes } from "gltf-validator";
import {
  GARMENT_TEMPLATES,
  garmentTemplate,
  templatesForSlot,
} from "@/lib/clothing/templates";
import { buildAvatarGlb } from "@/lib/avatar-engine/build-avatar-glb";
import { buildHumanoid } from "@/lib/avatar-engine/geometry/humanoid";
import { buildSkeleton, MIXAMO_BONES } from "@/lib/avatar-engine/geometry/skeleton";
import { unpackGlb } from "@/lib/avatar-engine/gltf/glb";
import { bodyParamsSchema, defaultFaceParams, GARMENT_SLOTS } from "@/lib/avatar-engine/params";
import type { Gltf } from "@/lib/avatar-engine/gltf/types";

const body = bodyParamsSchema.parse({});
const skeleton = buildSkeleton(body);
const ctx = { body, skeleton };

describe("GARMENT_TEMPLATES", () => {
  it("has unique ids", () => {
    const ids = GARMENT_TEMPLATES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("only uses declared garment slots", () => {
    for (const template of GARMENT_TEMPLATES) {
      expect(GARMENT_SLOTS).toContain(template.slot);
    }
  });

  it("offers at least one option for tops, bottoms and shoes", () => {
    for (const slot of ["TOP", "BOTTOM", "SHOES"] as const) {
      expect(templatesForSlot(slot).length).toBeGreaterThan(0);
    }
  });

  it("gives every template a valid default colour", () => {
    for (const template of GARMENT_TEMPLATES) {
      expect(template.defaultColor).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it("resolves a template by id and returns undefined for an unknown one", () => {
    expect(garmentTemplate("crew-tee")?.slot).toBe("TOP");
    expect(garmentTemplate("cape-of-invisibility")).toBeUndefined();
  });
});

describe("garment meshes", () => {
  for (const template of GARMENT_TEMPLATES) {
    describe(template.id, () => {
      const mesh = template.build(ctx);

      it("produces consistent attribute counts", () => {
        const vertexCount = mesh.positions.length / 3;
        expect(vertexCount).toBeGreaterThan(50);
        expect(mesh.normals.length).toBe(vertexCount * 3);
        expect(mesh.uvs.length).toBe(vertexCount * 2);
        expect(mesh.joints.length).toBe(vertexCount * 4);
        expect(mesh.weights.length).toBe(vertexCount * 4);
      });

      it("has in-range indices and whole triangles", () => {
        const vertexCount = mesh.positions.length / 3;
        expect(mesh.indices.length % 3).toBe(0);
        for (const index of mesh.indices) {
          expect(index).toBeLessThan(vertexCount);
        }
      });

      it("normalises its skin weights", () => {
        for (let i = 0; i < mesh.weights.length; i += 4) {
          const sum =
            mesh.weights[i] + mesh.weights[i + 1] + mesh.weights[i + 2] + mesh.weights[i + 3];
          expect(sum).toBeCloseTo(1, 5);
        }
      });

      it("binds only to bones that exist", () => {
        for (const joint of mesh.joints) {
          expect(joint).toBeLessThan(MIXAMO_BONES.length);
        }
      });

      it("contains no NaN values", () => {
        for (const value of mesh.positions) {
          expect(Number.isFinite(value)).toBe(true);
        }
      });

      it("stays within the avatar's bounding volume", () => {
        // Clothes hug the body; anything far outside it means a ring was placed
        // from the wrong joint.
        for (let i = 0; i < mesh.positions.length; i += 3) {
          expect(Math.abs(mesh.positions[i])).toBeLessThan(skeleton.height);
          expect(mesh.positions[i + 1]).toBeGreaterThan(-0.05);
          expect(mesh.positions[i + 1]).toBeLessThan(skeleton.height * 1.05);
        }
      });
    });
  }
});

describe("garment fit", () => {
  const bodyMesh = buildHumanoid(body, defaultFaceParams(), skeleton);

  /** Largest radius of the body mesh within a horizontal slice. */
  function bodyRadiusAt(y: number, tolerance: number): number {
    let max = 0;
    for (let v = 0; v < bodyMesh.positions.length / 3; v++) {
      if (Math.abs(bodyMesh.positions[v * 3 + 1] - y) > tolerance) continue;
      const x = bodyMesh.positions[v * 3];
      const z = bodyMesh.positions[v * 3 + 2];
      max = Math.max(max, Math.hypot(x, z));
    }
    return max;
  }

  it("keeps a t-shirt outside the torso it covers", () => {
    const tee = garmentTemplate("crew-tee")!.build(ctx);
    const chestY = skeleton.bones[MIXAMO_BONES.findIndex((b) => b.name === "mixamorig:Spine1")]
      .worldPosition[1];

    const bodyR = bodyRadiusAt(chestY, 0.02);
    let garmentR = 0;
    for (let v = 0; v < tee.positions.length / 3; v++) {
      if (Math.abs(tee.positions[v * 3 + 1] - chestY) > 0.02) continue;
      garmentR = Math.max(garmentR, Math.hypot(tee.positions[v * 3], tee.positions[v * 3 + 2]));
    }

    expect(garmentR).toBeGreaterThan(bodyR);
  });

  it("scales with the body it is built for", () => {
    const slim = garmentTemplate("crew-tee")!.build({
      body: bodyParamsSchema.parse({ build: 0, chest: 0 }),
      skeleton: buildSkeleton(bodyParamsSchema.parse({ build: 0, chest: 0 })),
    });
    const heavy = garmentTemplate("crew-tee")!.build({
      body: bodyParamsSchema.parse({ build: 1, chest: 1 }),
      skeleton: buildSkeleton(bodyParamsSchema.parse({ build: 1, chest: 1 })),
    });

    // Measure the torso panel, not the whole garment: a tee's widest point is
    // the sleeve tip, whose position comes from the skeleton's arm length and
    // so does not move when only the build sliders change.
    const torsoWidth = (m: {
      positions: Float32Array;
      parts: { name: string; startVertex: number; vertexCount: number }[];
    }) => {
      const part = m.parts.find((p) => p.name === "topTorso")!;
      let max = 0;
      for (let v = part.startVertex; v < part.startVertex + part.vertexCount; v++) {
        max = Math.max(max, Math.abs(m.positions[v * 3]));
      }
      return max;
    };

    expect(torsoWidth(heavy)).toBeGreaterThan(torsoWidth(slim));
  });

  it("puts shorts above the knee and jeans below it", () => {
    const kneeY = skeleton.bones[MIXAMO_BONES.findIndex((b) => b.name === "mixamorig:LeftLeg")]
      .worldPosition[1];

    const lowest = (id: string) => {
      const m = garmentTemplate(id)!.build(ctx);
      let min = Infinity;
      for (let i = 1; i < m.positions.length; i += 3) min = Math.min(min, m.positions[i]);
      return min;
    };

    expect(lowest("shorts")).toBeGreaterThan(kneeY);
    expect(lowest("jeans")).toBeLessThan(kneeY);
  });
});

describe("dressed avatar GLB", () => {
  it("adds one primitive per garment and passes the Khronos validator", async () => {
    const mesh = buildHumanoid(body, defaultFaceParams(), skeleton);
    const garments = ["hoodie", "jeans", "sneakers"].map((id) => {
      const template = garmentTemplate(id)!;
      return { name: template.id, mesh: template.build(ctx), colorHex: template.defaultColor };
    });

    const glb = buildAvatarGlb({ mesh, skeleton, garments, name: "Dressed" });
    const doc = unpackGlb(glb).json as unknown as Gltf;

    expect(doc.meshes[0].primitives).toHaveLength(4);
    expect(doc.materials).toHaveLength(4);
    // Every primitive shares the one skin on the mesh node.
    expect(doc.skins).toHaveLength(1);

    const report = (await validateBytes(glb)) as {
      issues: { numErrors: number; messages: { severity: number; message: string }[] };
    };
    const errors = report.issues.messages.filter((m) => m.severity === 0).map((m) => m.message);
    expect(errors).toEqual([]);
  });

  it("marks cloth double-sided so a sleeve has no holes from inside", () => {
    const mesh = buildHumanoid(body, defaultFaceParams(), skeleton);
    const template = garmentTemplate("crew-tee")!;
    const glb = buildAvatarGlb({
      mesh,
      skeleton,
      garments: [{ name: "tee", mesh: template.build(ctx), colorHex: "#ffffff" }],
    });
    const doc = unpackGlb(glb).json as unknown as Gltf;

    expect(doc.materials![0].doubleSided).toBe(false); // skin
    expect(doc.materials![1].doubleSided).toBe(true); // cloth
  });

  it("keeps the base colour white when a garment has its own texture", () => {
    const mesh = buildHumanoid(body, defaultFaceParams(), skeleton);
    const template = garmentTemplate("crew-tee")!;
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 13, 10, 26, 10]);

    const glb = buildAvatarGlb({
      mesh,
      skeleton,
      garments: [
        { name: "tee", mesh: template.build(ctx), colorHex: "#ff0000", texture: png },
      ],
    });
    const doc = unpackGlb(glb).json as unknown as Gltf;

    // A red tint multiplied into the user's own photo would muddy it.
    expect(doc.materials![1].pbrMetallicRoughness!.baseColorFactor).toEqual([1, 1, 1, 1]);
  });
});
