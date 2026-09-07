import { describe, it, expect } from "vitest";
import { validateBytes } from "gltf-validator";
import {
  availableFormats,
  exportAs,
  exportFormat,
  EXPORT_FORMATS,
  ExportNotAvailableError,
  UnknownExportFormatError,
  type ExportSource,
} from "@/lib/export";
import { safeFilename } from "@/lib/export/filename";
import { createZip, crc32 } from "@/lib/export/zip";
import { buildAvatarGlb } from "@/lib/avatar-engine/build-avatar-glb";
import { buildHumanoid } from "@/lib/avatar-engine/geometry/humanoid";
import { buildSkeleton, MIXAMO_BONES } from "@/lib/avatar-engine/geometry/skeleton";
import { unpackGlb } from "@/lib/avatar-engine/gltf/glb";
import { bodyParamsSchema, defaultFaceParams } from "@/lib/avatar-engine/params";
import { garmentTemplate } from "@/lib/clothing/templates";
import type { Gltf } from "@/lib/avatar-engine/gltf/types";

const body = bodyParamsSchema.parse({});
const skeleton = buildSkeleton(body);
const mesh = buildHumanoid(body, defaultFaceParams(), skeleton);
const texture = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 13, 10, 26, 10, 1, 2, 3]);
const glb = buildAvatarGlb({ mesh, skeleton, texture, name: "Test Avatar" });

const source: ExportSource = {
  glb,
  mesh,
  skeleton,
  texture,
  garments: [
    {
      name: "crew-tee",
      mesh: garmentTemplate("crew-tee")!.build({ body, skeleton }),
      colorHex: "#e5e7eb",
    },
  ],
  avatarName: "Test Avatar",
};

describe("crc32", () => {
  it("matches the standard check value", () => {
    // The canonical CRC-32 check value for "123456789".
    expect(crc32(new TextEncoder().encode("123456789"))).toBe(0xcbf43926);
  });

  it("is zero for empty input", () => {
    expect(crc32(new Uint8Array(0))).toBe(0);
  });
});

describe("createZip", () => {
  const zip = createZip([
    { name: "hello.txt", data: new TextEncoder().encode("hello world") },
    { name: "nested/data.bin", data: new Uint8Array([1, 2, 3, 4]) },
  ]);

  const view = () => new DataView(zip.buffer, zip.byteOffset, zip.byteLength);

  it("starts with a local file header", () => {
    expect(view().getUint32(0, true)).toBe(0x04034b50);
  });

  it("ends with an end-of-central-directory record naming both entries", () => {
    const end = zip.byteLength - 22;
    expect(view().getUint32(end, true)).toBe(0x06054b50);
    expect(view().getUint16(end + 8, true)).toBe(2);
    expect(view().getUint16(end + 10, true)).toBe(2);
  });

  it("points the end record at a real central directory", () => {
    const end = zip.byteLength - 22;
    const centralOffset = view().getUint32(end + 16, true);
    expect(view().getUint32(centralOffset, true)).toBe(0x02014b50);
  });

  it("stores entries uncompressed with matching sizes", () => {
    // Local header: method at 8, sizes at 18 and 22.
    expect(view().getUint16(8, true)).toBe(0);
    expect(view().getUint32(18, true)).toBe(11);
    expect(view().getUint32(22, true)).toBe(11);
  });

  it("records the correct checksum for each entry", () => {
    expect(view().getUint32(14, true)).toBe(crc32(new TextEncoder().encode("hello world")));
  });

  it("handles an empty archive", () => {
    const empty = createZip([]);
    expect(empty.byteLength).toBe(22);
    expect(new DataView(empty.buffer).getUint32(0, true)).toBe(0x06054b50);
  });
});

describe("safeFilename", () => {
  it("slugs a display name", () => {
    expect(safeFilename("My Cool Avatar")).toBe("my-cool-avatar");
  });

  it("strips characters that would break a header or a path", () => {
    expect(safeFilename('../../etc/passwd "x"')).toBe("etcpasswd-x");
    expect(safeFilename("a/b\\c")).toBe("abc");
  });

  it("falls back rather than returning an empty name", () => {
    expect(safeFilename("!!!")).toBe("avatar");
    expect(safeFilename("")).toBe("avatar");
  });

  it("caps the length", () => {
    expect(safeFilename("x".repeat(200)).length).toBeLessThanOrEqual(60);
  });
});

describe("the format registry", () => {
  it("offers GLB and FBX now, and lists STL as unavailable", () => {
    expect(availableFormats().map((f) => f.id)).toEqual(["glb", "fbx"]);
    expect(exportFormat("stl")!.enabled).toBe(false);
  });

  it("gives every format a description and a content type", () => {
    for (const format of EXPORT_FORMATS) {
      expect(format.description.length).toBeGreaterThan(10);
      expect(format.contentType).toMatch(/\//);
    }
  });

  it("rejects an unknown format by name", async () => {
    await expect(exportAs("collada", source)).rejects.toBeInstanceOf(UnknownExportFormatError);
  });

  it("explains why a registered but disabled format cannot be used", async () => {
    await expect(exportAs("stl", source)).rejects.toBeInstanceOf(ExportNotAvailableError);
    await expect(exportAs("stl", source)).rejects.toThrow(/Phase 2|manifold/i);
  });
});

describe("GLB export", () => {
  it("returns a valid GLB with an export stamp", async () => {
    const result = await exportAs("glb", source);
    const doc = unpackGlb(result.bytes).json as unknown as Gltf;

    expect(result.filename).toBe("test-avatar.glb");
    expect(result.contentType).toBe("model/gltf-binary");
    expect(doc.extras!.exportedBy).toBe("Incarnatrun");
    expect(doc.extras!.exportFormat).toBe("glb");
    expect(typeof doc.extras!.exportedAt).toBe("string");
  });

  it("keeps the geometry and the rig intact", async () => {
    const result = await exportAs("glb", source);
    const doc = unpackGlb(result.bytes).json as unknown as Gltf;

    expect(doc.skins![0].joints).toHaveLength(MIXAMO_BONES.length);
    expect(doc.meshes[0].primitives[0].attributes.JOINTS_0).toBeDefined();
  });

  it("still passes the Khronos validator after re-export", async () => {
    const result = await exportAs("glb", source);
    const report = (await validateBytes(result.bytes)) as {
      issues: { messages: { severity: number; message: string }[] };
    };

    expect(report.issues.messages.filter((m) => m.severity === 0)).toEqual([]);
  });

  it("honours an explicit filename", async () => {
    const result = await exportAs("glb", source, { filename: "Custom Name!" });
    expect(result.filename).toBe("custom-name.glb");
  });
});

describe("FBX export", () => {
  it("returns a zip named after the avatar", async () => {
    const result = await exportAs("fbx", source);

    expect(result.filename).toBe("test-avatar.zip");
    expect(result.contentType).toBe("application/zip");
    expect(new DataView(result.bytes.buffer).getUint32(0, true)).toBe(0x04034b50);
  });

  it("packs both the FBX and its texture", async () => {
    const result = await exportAs("fbx", source);
    const text = Buffer.from(result.bytes).toString("latin1");

    expect(text).toContain("test-avatar.fbx");
    expect(text).toContain("avatar_atlas.png");
  });

  it("writes a 7.4 ASCII header", async () => {
    const fbx = await extractFbx();

    expect(fbx).toContain("FBXVersion: 7400");
    expect(fbx).toContain("FBXHeaderVersion: 1003");
    expect(fbx).toContain('Creator: "Incarnatrun"');
  });

  it("declares Y-up with Z-front, matching glTF's handedness", async () => {
    const fbx = await extractFbx();

    expect(fbx).toContain('P: "UpAxis", "int", "Integer", "",1');
    expect(fbx).toContain('P: "FrontAxis", "int", "Integer", "",2');
  });

  it("names every bone exactly as Mixamo does", async () => {
    const fbx = await extractFbx();

    for (const bone of MIXAMO_BONES) {
      expect(fbx).toContain(`Model::${bone.name}`);
    }
    expect(fbx).toContain('"LimbNode"');
  });

  it("emits one skin cluster per bone", async () => {
    const fbx = await extractFbx();
    const clusters = fbx.match(/"SubDeformer::Cluster /g) ?? [];

    expect(clusters).toHaveLength(MIXAMO_BONES.length);
    expect(fbx).toContain('"Deformer::Skin", "Skin"');
  });

  it("closes every polygon by negating its last index", async () => {
    const fbx = await extractFbx();
    const match = fbx.match(/PolygonVertexIndex: \*(\d+) \{\s*a: ([^\n]*)/);
    expect(match).not.toBeNull();

    const first = match![2].split(",").slice(0, 3).map(Number);
    // Two plain indices, then a negated one to close the triangle.
    expect(first[0]).toBeGreaterThanOrEqual(0);
    expect(first[1]).toBeGreaterThanOrEqual(0);
    expect(first[2]).toBeLessThan(0);
  });

  it("converts metres to centimetres", async () => {
    const fbx = await extractFbx();
    const match = fbx.match(/Vertices: \*(\d+) \{\s*a: ([^\n]*)/)!;
    const values = match[2].split(",").map(Number);

    // A 1.75 m avatar is 175 FBX units, so coordinates run to the tens, not
    // fractions of one.
    const maxAbs = Math.max(...values.map(Math.abs));
    expect(maxAbs).toBeGreaterThan(5);
  });

  it("writes one material per mesh part and a bind pose", async () => {
    const fbx = await extractFbx();

    expect(fbx).toContain("Material::AvatarBody");
    expect(fbx).toContain("Material::crew-tee");
    expect(fbx).toContain('"Pose::BIND_POSES", "BindPose"');
  });

  it("connects the root bone to the scene and children to their parents", async () => {
    const fbx = await extractFbx();
    const connections = fbx.slice(fbx.indexOf("Connections:"));

    // mixamorig:Hips (bone 0) parents to the scene root, id 0.
    expect(connections).toContain(`C: "OO",7000000,0`);
    // mixamorig:Spine (bone 1) parents to the hips.
    expect(connections).toContain(`C: "OO",7000001,7000000`);
  });

  it("refuses to export without the mesh, rather than writing an empty file", async () => {
    await expect(
      exportAs("fbx", { glb, avatarName: "No Mesh" }),
    ).rejects.toThrow(/needs the avatar's mesh and skeleton/i);
  });
});

/** Pulls the .fbx entry out of the zip using the stored-entry layout. */
async function extractFbx(): Promise<string> {
  const result = await exportAs("fbx", source);
  const bytes = result.bytes;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  const nameLength = view.getUint16(26, true);
  const extraLength = view.getUint16(28, true);
  const size = view.getUint32(18, true);
  const start = 30 + nameLength + extraLength;

  return Buffer.from(bytes.subarray(start, start + size)).toString("utf8");
}
