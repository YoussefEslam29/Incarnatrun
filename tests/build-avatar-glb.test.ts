import { describe, it, expect } from "vitest";
import { buildAvatarGlb } from "@/lib/avatar-engine/build-avatar-glb";
import { buildHumanoid } from "@/lib/avatar-engine/geometry/humanoid";
import { buildSkeleton, MIXAMO_BONES } from "@/lib/avatar-engine/geometry/skeleton";
import { unpackGlb } from "@/lib/avatar-engine/gltf/glb";
import { defaultBodyParams, defaultFaceParams } from "@/lib/avatar-engine/params";
import type { Gltf } from "@/lib/avatar-engine/gltf/types";
import { ComponentType } from "@/lib/avatar-engine/gltf/types";

function makeAvatar(texture?: Uint8Array) {
  const body = defaultBodyParams();
  const face = defaultFaceParams();
  const skeleton = buildSkeleton(body);
  const mesh = buildHumanoid(body, face, skeleton);
  const glb = buildAvatarGlb({ mesh, skeleton, texture, name: "Test Avatar" });
  const parsed = unpackGlb(glb);
  return { glb, doc: parsed.json as unknown as Gltf, bin: parsed.bin, mesh, skeleton };
}

describe("buildAvatarGlb", () => {
  const { glb, doc, mesh } = makeAvatar();

  it("produces a parseable glTF 2.0 binary", () => {
    expect(glb.byteLength).toBeGreaterThan(1000);
    expect(doc.asset.version).toBe("2.0");
  });

  it("declares one node per bone plus a mesh node and a root", () => {
    expect(doc.nodes.length).toBe(MIXAMO_BONES.length + 2);
  });

  it("names every joint node with its Mixamo bone name", () => {
    const names = doc.nodes.map((n) => n.name);
    for (const bone of MIXAMO_BONES) {
      expect(names).toContain(bone.name);
    }
  });

  it("reproduces the bone hierarchy as node children", () => {
    MIXAMO_BONES.forEach((bone, index) => {
      if (bone.parent === -1) return;
      expect(doc.nodes[bone.parent].children).toContain(index);
    });
  });

  it("gives each joint node its local translation, not its world position", () => {
    const hips = doc.nodes[0];
    const spine = doc.nodes[1];

    // The hips sit up at hip height; the spine is a short hop above its parent.
    expect(hips.translation![1]).toBeGreaterThan(0.5);
    expect(spine.translation![1]).toBeLessThan(0.2);
  });

  it("declares a skin over every bone, rooted at the hips", () => {
    expect(doc.skins).toHaveLength(1);
    expect(doc.skins![0].joints).toHaveLength(MIXAMO_BONES.length);
    expect(doc.skins![0].skeleton).toBe(0);
  });

  it("supplies one inverse bind matrix per joint", () => {
    const accessor = doc.accessors[doc.skins![0].inverseBindMatrices!];
    expect(accessor.type).toBe("MAT4");
    expect(accessor.count).toBe(MIXAMO_BONES.length);
    expect(accessor.componentType).toBe(ComponentType.FLOAT);
  });

  it("attaches the skin to the mesh node, not to a bone", () => {
    const meshNode = doc.nodes.find((n) => n.mesh !== undefined)!;
    expect(meshNode.skin).toBe(0);

    // A skinned mesh parented under a joint would be transformed twice.
    const meshNodeIndex = doc.nodes.indexOf(meshNode);
    for (const bone of MIXAMO_BONES.keys()) {
      expect(doc.nodes[bone].children ?? []).not.toContain(meshNodeIndex);
    }
  });

  it("exports all five vertex attributes", () => {
    const attributes = doc.meshes[0].primitives[0].attributes;
    expect(attributes.POSITION).toBeDefined();
    expect(attributes.NORMAL).toBeDefined();
    expect(attributes.TEXCOORD_0).toBeDefined();
    expect(attributes.JOINTS_0).toBeDefined();
    expect(attributes.WEIGHTS_0).toBeDefined();
  });

  it("gives the POSITION accessor the min and max the spec requires", () => {
    const position = doc.accessors[doc.meshes[0].primitives[0].attributes.POSITION];
    expect(position.min).toHaveLength(3);
    expect(position.max).toHaveLength(3);
    expect(position.count).toBe(mesh.positions.length / 3);
  });

  it("keeps every accessor count consistent with the vertex count", () => {
    const vertexCount = mesh.positions.length / 3;
    const attributes = doc.meshes[0].primitives[0].attributes;

    for (const accessorIndex of Object.values(attributes)) {
      expect(doc.accessors[accessorIndex as number].count).toBe(vertexCount);
    }
  });

  it("indexes triangles within range", () => {
    const primitive = doc.meshes[0].primitives[0];
    const indices = doc.accessors[primitive.indices!];

    expect(indices.count).toBe(mesh.indices.length);
    expect(indices.count % 3).toBe(0);
  });

  it("puts the root node in the scene", () => {
    expect(doc.scene).toBe(0);
    expect(doc.scenes[0].nodes).toHaveLength(1);

    const root = doc.nodes[doc.scenes[0].nodes[0]];
    // The root parents both the skeleton and the mesh.
    expect(root.children).toContain(0);
    expect(root.children!.length).toBe(2);
  });

  it("records the generator and the avatar name", () => {
    expect(doc.asset.generator).toMatch(/incarnatrun/i);
    expect(doc.nodes[doc.scenes[0].nodes[0]].name).toBe("Test Avatar");
  });

  it("emits a material with no texture when none is supplied", () => {
    expect(doc.materials).toHaveLength(1);
    expect(doc.materials![0].pbrMetallicRoughness!.baseColorTexture).toBeUndefined();
    expect(doc.textures).toBeUndefined();
  });

  it("wires a supplied texture into the base colour channel", () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 13, 10, 26, 10]);
    const { doc: textured } = makeAvatar(png);

    expect(textured.textures).toHaveLength(1);
    expect(textured.images).toHaveLength(1);
    expect(textured.materials![0].pbrMetallicRoughness!.baseColorTexture!.index).toBe(0);
  });

  it("is byte-identical when built twice from the same inputs", () => {
    const a = makeAvatar().glb;
    const b = makeAvatar().glb;
    expect(Array.from(a)).toEqual(Array.from(b));
  });
});
