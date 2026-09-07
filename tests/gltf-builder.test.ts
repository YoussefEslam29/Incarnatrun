import { describe, it, expect } from "vitest";
import { GltfBuilder } from "@/lib/avatar-engine/gltf/builder";
import { unpackGlb } from "@/lib/avatar-engine/gltf/glb";
import { ComponentType, BufferTarget } from "@/lib/avatar-engine/gltf/types";
import type { Gltf } from "@/lib/avatar-engine/gltf/types";

function buildAndParse(b: GltfBuilder): { doc: Gltf; bin: Uint8Array } {
  const parsed = unpackGlb(b.build());
  return { doc: parsed.json as unknown as Gltf, bin: parsed.bin };
}

describe("GltfBuilder", () => {
  it("emits a glTF 2.0 asset header", () => {
    const b = new GltfBuilder({ generator: "incarnatrun-test" });
    const { doc } = buildAndParse(b);

    expect(doc.asset.version).toBe("2.0");
    expect(doc.asset.generator).toBe("incarnatrun-test");
  });

  it("computes min and max for position accessors, which the spec requires", () => {
    const b = new GltfBuilder();
    const positions = new Float32Array([
      -1, 0, 2,
      3, -4, 0,
      0, 5, -6,
    ]);
    const idx = b.addVec3Accessor(positions, { computeBounds: true });
    const { doc } = buildAndParse(b);

    expect(doc.accessors[idx].min).toEqual([-1, -4, -6]);
    expect(doc.accessors[idx].max).toEqual([3, 5, 2]);
    expect(doc.accessors[idx].count).toBe(3);
    expect(doc.accessors[idx].type).toBe("VEC3");
    expect(doc.accessors[idx].componentType).toBe(ComponentType.FLOAT);
  });

  it("omits min and max when bounds are not requested", () => {
    const b = new GltfBuilder();
    const idx = b.addVec3Accessor(new Float32Array([1, 2, 3]));
    const { doc } = buildAndParse(b);

    expect(doc.accessors[idx].min).toBeUndefined();
    expect(doc.accessors[idx].max).toBeUndefined();
  });

  it("aligns every bufferView to a 4-byte boundary", () => {
    const b = new GltfBuilder();
    // A 3-element uint16 index buffer is 6 bytes, so the next view must be
    // pushed to offset 8 rather than starting at 6.
    b.addIndicesAccessor(new Uint16Array([0, 1, 2]));
    b.addVec3Accessor(new Float32Array([1, 2, 3]));
    const { doc } = buildAndParse(b);

    for (const view of doc.bufferViews) {
      expect((view.byteOffset ?? 0) % 4).toBe(0);
    }
  });

  it("tags index accessors with the element array buffer target", () => {
    const b = new GltfBuilder();
    const idx = b.addIndicesAccessor(new Uint16Array([0, 1, 2]));
    const { doc } = buildAndParse(b);

    const view = doc.bufferViews[doc.accessors[idx].bufferView!];
    expect(view.target).toBe(BufferTarget.ELEMENT_ARRAY_BUFFER);
    expect(doc.accessors[idx].componentType).toBe(ComponentType.UNSIGNED_SHORT);
  });

  it("tags vertex attribute accessors with the array buffer target", () => {
    const b = new GltfBuilder();
    const idx = b.addVec3Accessor(new Float32Array([1, 2, 3]));
    const { doc } = buildAndParse(b);

    const view = doc.bufferViews[doc.accessors[idx].bufferView!];
    expect(view.target).toBe(BufferTarget.ARRAY_BUFFER);
  });

  it("widens indices to uint32 when the vertex count needs it", () => {
    const b = new GltfBuilder();
    const idx = b.addIndicesAccessor(new Uint32Array([0, 1, 70000]));
    const { doc } = buildAndParse(b);

    expect(doc.accessors[idx].componentType).toBe(ComponentType.UNSIGNED_INT);
  });

  it("stores joints as unsigned bytes and weights as floats", () => {
    const b = new GltfBuilder();
    const joints = b.addJointsAccessor(new Uint8Array([0, 1, 2, 3]));
    const weights = b.addVec4Accessor(new Float32Array([0.5, 0.5, 0, 0]));
    const { doc } = buildAndParse(b);

    expect(doc.accessors[joints].componentType).toBe(ComponentType.UNSIGNED_BYTE);
    expect(doc.accessors[joints].type).toBe("VEC4");
    expect(doc.accessors[weights].componentType).toBe(ComponentType.FLOAT);
    expect(doc.accessors[weights].type).toBe("VEC4");
  });

  it("declares a single buffer whose length matches the binary chunk", () => {
    const b = new GltfBuilder();
    b.addVec3Accessor(new Float32Array([1, 2, 3, 4, 5, 6]));
    b.addIndicesAccessor(new Uint16Array([0, 1, 2]));
    const { doc, bin } = buildAndParse(b);

    expect(doc.buffers).toHaveLength(1);
    // The chunk is padded to 4 bytes, so it is never shorter than the buffer.
    expect(doc.buffers[0].byteLength).toBeLessThanOrEqual(bin.byteLength);
    expect(bin.byteLength - doc.buffers[0].byteLength).toBeLessThan(4);
  });

  it("embeds an image as a bufferView with its mime type", () => {
    const b = new GltfBuilder();
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]);
    const tex = b.addTexture(png, "image/png");
    const { doc } = buildAndParse(b);

    expect(doc.images![0].mimeType).toBe("image/png");
    expect(doc.images![0].bufferView).toBeDefined();
    expect(doc.textures![tex].source).toBe(0);
    expect(doc.samplers).toHaveLength(1);
  });

  it("reuses one sampler across multiple textures", () => {
    const b = new GltfBuilder();
    b.addTexture(new Uint8Array([1]), "image/png");
    b.addTexture(new Uint8Array([2]), "image/png");
    const { doc } = buildAndParse(b);

    expect(doc.textures).toHaveLength(2);
    expect(doc.samplers).toHaveLength(1);
    expect(doc.textures![0].sampler).toBe(doc.textures![1].sampler);
  });

  it("wires a scene to its root nodes", () => {
    const b = new GltfBuilder();
    const node = b.addNode({ name: "Root" });
    b.setScene([node]);
    const { doc } = buildAndParse(b);

    expect(doc.scene).toBe(0);
    expect(doc.scenes[0].nodes).toEqual([node]);
    expect(doc.nodes[node].name).toBe("Root");
  });

  it("keeps accessor byte offsets within their bufferView", () => {
    const b = new GltfBuilder();
    b.addVec3Accessor(new Float32Array([1, 2, 3, 4, 5, 6]), { computeBounds: true });
    b.addVec2Accessor(new Float32Array([0, 0, 1, 1]));
    const { doc, bin } = buildAndParse(b);

    for (const accessor of doc.accessors) {
      const view = doc.bufferViews[accessor.bufferView!];
      expect((view.byteOffset ?? 0) + view.byteLength).toBeLessThanOrEqual(bin.byteLength);
    }
  });
});
