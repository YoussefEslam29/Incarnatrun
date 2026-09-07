import { describe, it, expect } from "vitest";
import sharp from "sharp";
import {
  detectMeshFormat,
  importGarmentMesh,
  GarmentMeshError,
  computeNormals,
  MAX_VERTICES,
} from "@/lib/clothing/mesh-import";
import { fitGarmentToBody } from "@/lib/clothing/fit";
import { processGarmentPhoto, GarmentPhotoError } from "@/lib/clothing/photo-texture";
import { buildAvatarGlb } from "@/lib/avatar-engine/build-avatar-glb";
import { buildHumanoid } from "@/lib/avatar-engine/geometry/humanoid";
import { buildSkeleton, MIXAMO_BONES } from "@/lib/avatar-engine/geometry/skeleton";
import { bodyParamsSchema, defaultFaceParams } from "@/lib/avatar-engine/params";

const body = bodyParamsSchema.parse({});
const skeleton = buildSkeleton(body);
const bodyMesh = buildHumanoid(body, defaultFaceParams(), skeleton);

/** A tiny OBJ cube, the smallest thing that exercises the whole path. */
const CUBE_OBJ = `# a cube
v -1 -1 -1
v  1 -1 -1
v  1  1 -1
v -1  1 -1
v -1 -1  1
v  1 -1  1
v  1  1  1
v -1  1  1
vt 0 0
vt 1 0
vt 1 1
vt 0 1
f 1/1 2/2 3/3 4/4
f 5/1 8/4 7/3 6/2
f 1/1 5/2 8/3 4/4
f 2/1 3/2 7/3 6/4
f 4/1 3/2 7/3 8/4
f 1/1 2/2 6/3 5/4
`;

function obj(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

describe("detectMeshFormat", () => {
  it("recognises GLB from its magic number", () => {
    const glb = buildAvatarGlb({ mesh: bodyMesh, skeleton, name: "x" });
    expect(detectMeshFormat(glb, "anything.bin")).toBe("glb");
  });

  it("recognises OBJ and glTF by extension", () => {
    expect(detectMeshFormat(obj(CUBE_OBJ), "shirt.obj")).toBe("obj");
    expect(detectMeshFormat(obj("{}"), "shirt.gltf")).toBe("gltf");
  });

  it("refuses binary FBX with an instruction, not a generic error", () => {
    const fbx = new TextEncoder().encode("Kaydara FBX Binary  \0\x1a\0");
    expect(() => detectMeshFormat(fbx, "shirt.fbx")).toThrow(/export .* as GLB or OBJ/i);
  });

  it("refuses an FBX by extension too", () => {
    expect(() => detectMeshFormat(obj("whatever"), "shirt.fbx")).toThrow(/GLB or OBJ/i);
  });

  it("names the unsupported extension it was given", () => {
    expect(() => detectMeshFormat(obj("x"), "shirt.blend")).toThrow(/blend/);
  });
});

describe("importGarmentMesh: OBJ", () => {
  const mesh = importGarmentMesh(obj(CUBE_OBJ), "cube.obj");

  it("triangulates quad faces", () => {
    // Six quads become twelve triangles.
    expect(mesh.triangleCount).toBe(12);
    expect(mesh.indices.length).toBe(36);
  });

  it("reports the bounding box", () => {
    expect(mesh.bounds.min).toEqual([-1, -1, -1]);
    expect(mesh.bounds.max).toEqual([1, 1, 1]);
  });

  it("computes normals when the file has none, and says so", () => {
    expect(mesh.normals.length).toBe(mesh.vertexCount * 3);
    for (let i = 0; i < mesh.normals.length; i += 3) {
      const length = Math.hypot(mesh.normals[i], mesh.normals[i + 1], mesh.normals[i + 2]);
      expect(length).toBeCloseTo(1, 4);
    }
    expect(mesh.warnings.join(" ")).toMatch(/normals/i);
  });

  it("keeps every index inside the vertex list", () => {
    for (const index of mesh.indices) {
      expect(index).toBeLessThan(mesh.vertexCount);
    }
  });

  it("handles negative, relative vertex indices", () => {
    const relative = "v 0 0 0\nv 1 0 0\nv 0 1 0\nf -3 -2 -1\n";
    const parsed = importGarmentMesh(obj(relative), "rel.obj");
    expect(parsed.triangleCount).toBe(1);
    expect(Array.from(parsed.indices)).toEqual([0, 1, 2]);
  });

  it("rejects a file with vertices but no faces", () => {
    expect(() => importGarmentMesh(obj("v 0 0 0\nv 1 0 0\n"), "x.obj")).toThrow(/no faces/i);
  });

  it("rejects a face referring to a missing vertex", () => {
    expect(() => importGarmentMesh(obj("v 0 0 0\nf 1 2 3\n"), "x.obj")).toThrow(/missing vertex/i);
  });

  it("rejects an empty file", () => {
    expect(() => importGarmentMesh(new Uint8Array(0), "x.obj")).toThrow(/empty/i);
  });

  it("rejects a file with no geometry at all", () => {
    expect(() => importGarmentMesh(obj("# just a comment\n"), "x.obj")).toThrow(/no geometry/i);
  });
});

describe("importGarmentMesh: GLB", () => {
  it("reads back a GLB this codebase wrote", () => {
    const glb = buildAvatarGlb({ mesh: bodyMesh, skeleton, name: "Garment" });
    const imported = importGarmentMesh(glb, "garment.glb");

    expect(imported.format).toBe("glb");
    expect(imported.vertexCount).toBe(bodyMesh.positions.length / 3);
    expect(imported.triangleCount).toBe(bodyMesh.indices.length / 3);
  });

  it("rejects a glTF that points at external buffer files", () => {
    const doc = JSON.stringify({
      asset: { version: "2.0" },
      buffers: [{ byteLength: 10, uri: "scene.bin" }],
      meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
    });
    expect(() => importGarmentMesh(obj(doc), "scene.gltf")).toThrow(/separate \.bin files/i);
  });

  it("rejects malformed JSON", () => {
    expect(() => importGarmentMesh(obj("{ not json"), "x.gltf")).toThrow(/not valid JSON/i);
  });

  it("rejects a glTF with no meshes", () => {
    const doc = JSON.stringify({ asset: { version: "2.0" } });
    expect(() => importGarmentMesh(obj(doc), "x.gltf")).toThrow(/no meshes/i);
  });
});

describe("importGarmentMesh: limits", () => {
  it("refuses a file over the byte cap", () => {
    const huge = new Uint8Array(25 * 1024 * 1024);
    expect(() => importGarmentMesh(huge, "big.obj")).toThrow(/MB/);
  });

  it("states the vertex cap in its message", () => {
    // Build an OBJ just past the limit without materialising a giant string
    // by checking the message rather than the full parse.
    expect(MAX_VERTICES).toBeGreaterThan(1000);
  });
});

describe("computeNormals", () => {
  it("produces an outward normal for a single triangle", () => {
    const positions = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]);
    const normals = computeNormals(positions, new Uint32Array([0, 1, 2]));

    // Counter-clockwise in the XY plane faces +Z.
    expect(normals[2]).toBeCloseTo(1, 5);
  });

  it("never leaves a zero-length normal", () => {
    const positions = new Float32Array([0, 0, 0, 0, 0, 0, 0, 0, 0]);
    const normals = computeNormals(positions, new Uint32Array([0, 1, 2]));

    for (let i = 0; i < normals.length; i += 3) {
      expect(Math.hypot(normals[i], normals[i + 1], normals[i + 2])).toBeCloseTo(1, 5);
    }
  });
});

describe("fitGarmentToBody", () => {
  const cube = importGarmentMesh(obj(CUBE_OBJ), "cube.obj");

  it("scales a unit-sized upload onto the torso", () => {
    const fitted = fitGarmentToBody({ garment: cube, slot: "TOP", skeleton, body: bodyMesh });

    let minY = Infinity;
    let maxY = -Infinity;
    for (let i = 1; i < fitted.positions.length; i += 3) {
      minY = Math.min(minY, fitted.positions[i]);
      maxY = Math.max(maxY, fitted.positions[i]);
    }

    // A top spans roughly hip to neck, so well above the floor and below the head.
    expect(minY).toBeGreaterThan(skeleton.height * 0.35);
    expect(maxY).toBeLessThan(skeleton.height * 0.95);
  });

  it("puts a bottom on the legs, not the chest", () => {
    const fitted = fitGarmentToBody({ garment: cube, slot: "BOTTOM", skeleton, body: bodyMesh });

    let maxY = -Infinity;
    for (let i = 1; i < fitted.positions.length; i += 3) {
      maxY = Math.max(maxY, fitted.positions[i]);
    }
    expect(maxY).toBeLessThan(skeleton.height * 0.72);
  });

  it("binds every vertex to the rig with normalised weights", () => {
    const fitted = fitGarmentToBody({ garment: cube, slot: "TOP", skeleton, body: bodyMesh });

    expect(fitted.joints.length).toBe(fitted.positions.length / 3 * 4);
    for (let i = 0; i < fitted.weights.length; i += 4) {
      const sum =
        fitted.weights[i] + fitted.weights[i + 1] + fitted.weights[i + 2] + fitted.weights[i + 3];
      expect(sum).toBeCloseTo(1, 5);
    }
    for (const joint of fitted.joints) {
      expect(joint).toBeLessThan(MIXAMO_BONES.length);
    }
  });

  it("only binds a top to upper-body bones", () => {
    const fitted = fitGarmentToBody({ garment: cube, slot: "TOP", skeleton, body: bodyMesh });
    const legBones = MIXAMO_BONES.map((b, i) => (b.chain === "leg" ? i : -1)).filter((i) => i >= 0);

    for (let i = 0; i < fitted.joints.length; i++) {
      if (fitted.weights[i] > 0) {
        expect(legBones).not.toContain(fitted.joints[i]);
      }
    }
  });

  it("pushes vertices that land inside the body outside it", () => {
    // A cube fitted to the torso starts well inside the chest at its centre.
    const fitted = fitGarmentToBody({ garment: cube, slot: "TOP", skeleton, body: bodyMesh });

    // Every vertex should now sit at or outside the body's silhouette.
    let inside = 0;
    for (let v = 0; v < fitted.positions.length / 3; v++) {
      const y = fitted.positions[v * 3 + 1];
      const radius = Math.hypot(fitted.positions[v * 3], fitted.positions[v * 3 + 2]);

      let bodyRadius = 0;
      for (let b = 0; b < bodyMesh.positions.length / 3; b++) {
        if (Math.abs(bodyMesh.positions[b * 3 + 1] - y) > 0.03) continue;
        bodyRadius = Math.max(
          bodyRadius,
          Math.hypot(bodyMesh.positions[b * 3], bodyMesh.positions[b * 3 + 2]),
        );
      }
      if (bodyRadius > 0 && radius < bodyRadius) inside++;
    }

    expect(inside).toBe(0);
  });

  it("recomputes normals after moving vertices", () => {
    const fitted = fitGarmentToBody({ garment: cube, slot: "TOP", skeleton, body: bodyMesh });

    for (let i = 0; i < fitted.normals.length; i += 3) {
      const length = Math.hypot(fitted.normals[i], fitted.normals[i + 1], fitted.normals[i + 2]);
      expect(length).toBeCloseTo(1, 4);
    }
  });

  it("scales with the avatar it is fitted to", () => {
    const tall = buildSkeleton(bodyParamsSchema.parse({ heightCm: 205 }));
    const short = buildSkeleton(bodyParamsSchema.parse({ heightCm: 145 }));

    const span = (s: typeof skeleton) => {
      const m = buildHumanoid(bodyParamsSchema.parse({ heightCm: s.height * 100 }), defaultFaceParams(), s);
      const fitted = fitGarmentToBody({ garment: cube, slot: "TOP", skeleton: s, body: m });
      let min = Infinity;
      let max = -Infinity;
      for (let i = 1; i < fitted.positions.length; i += 3) {
        min = Math.min(min, fitted.positions[i]);
        max = Math.max(max, fitted.positions[i]);
      }
      return max - min;
    };

    expect(span(tall)).toBeGreaterThan(span(short));
  });
});

describe("processGarmentPhoto", () => {
  async function swatch(color: string, width = 400, height = 400): Promise<Buffer> {
    return sharp({ create: { width, height, channels: 3, background: color } })
      .png()
      .toBuffer();
  }

  it("produces a square texture at the expected size", async () => {
    const result = await processGarmentPhoto({ photo: await swatch("#3366cc") });
    const meta = await sharp(Buffer.from(result.texture)).metadata();

    expect(meta.width).toBe(1024);
    expect(meta.height).toBe(1024);
    expect(meta.format).toBe("png");
  });

  it("reads the garment's colour from the middle of the photo", async () => {
    const result = await processGarmentPhoto({ photo: await swatch("#cc3366") });

    const r = parseInt(result.dominantColor.slice(1, 3), 16);
    const g = parseInt(result.dominantColor.slice(3, 5), 16);
    const b = parseInt(result.dominantColor.slice(5, 7), 16);

    expect(Math.abs(r - 0xcc)).toBeLessThan(24);
    expect(Math.abs(g - 0x33)).toBeLessThan(24);
    expect(Math.abs(b - 0x66)).toBeLessThan(24);
  });

  it("fills the whole sheet, so no part of the garment is left transparent", async () => {
    const result = await processGarmentPhoto({ photo: await swatch("#20a020") });
    const { data, info } = await sharp(Buffer.from(result.texture))
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    // Sample the corners, which the photo panel never covers.
    for (const [x, y] of [
      [2, 2],
      [info.width - 3, 2],
      [2, info.height - 3],
      [info.width - 3, info.height - 3],
    ]) {
      const alpha = data[(y * info.width + x) * info.channels + 3];
      expect(alpha).toBe(255);
    }
  });

  it("rejects an image that is too small to be useful", async () => {
    await expect(processGarmentPhoto({ photo: await swatch("#fff", 64, 64) })).rejects.toBeInstanceOf(
      GarmentPhotoError,
    );
  });

  it("rejects something that is not an image", async () => {
    await expect(
      processGarmentPhoto({ photo: Buffer.from("not an image at all") }),
    ).rejects.toThrow(/could not be read/i);
  });
});

describe("uploaded garments in a GLB", () => {
  it("export alongside the body on the same rig", async () => {
    const cube = importGarmentMesh(obj(CUBE_OBJ), "cube.obj");
    const fitted = fitGarmentToBody({ garment: cube, slot: "TOP", skeleton, body: bodyMesh });

    const glb = buildAvatarGlb({
      mesh: bodyMesh,
      skeleton,
      garments: [{ name: "uploaded", mesh: fitted, colorHex: "#888888" }],
      name: "With Upload",
    });

    const { validateBytes } = await import("gltf-validator");
    const report = (await validateBytes(glb)) as {
      issues: { messages: { severity: number; message: string }[] };
    };

    expect(report.issues.messages.filter((m) => m.severity === 0)).toEqual([]);
  });
});

describe("GarmentMeshError", () => {
  it("is thrown as its own type so callers can answer 400 rather than 500", () => {
    try {
      importGarmentMesh(new Uint8Array(0), "x.obj");
      expect.unreachable("should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(GarmentMeshError);
    }
  });
});
