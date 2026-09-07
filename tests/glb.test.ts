import { describe, it, expect } from "vitest";
import { packGlb, unpackGlb, GLB_MAGIC, CHUNK_JSON, CHUNK_BIN } from "@/lib/avatar-engine/gltf/glb";

function u32(bytes: Uint8Array, offset: number): number {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(offset, true);
}

describe("packGlb", () => {
  it("writes the glTF magic, version 2 and the true total length", () => {
    const glb = packGlb({ asset: { version: "2.0" } }, new Uint8Array(0));

    expect(u32(glb, 0)).toBe(GLB_MAGIC);
    expect(u32(glb, 4)).toBe(2);
    expect(u32(glb, 8)).toBe(glb.byteLength);
  });

  it("pads the JSON chunk to a 4-byte boundary with spaces", () => {
    // {"asset":{"version":"2.0"}} is 27 bytes, so it needs 1 byte of padding.
    const glb = packGlb({ asset: { version: "2.0" } }, new Uint8Array(0));

    const jsonLength = u32(glb, 12);
    expect(jsonLength % 4).toBe(0);
    expect(u32(glb, 16)).toBe(CHUNK_JSON);

    // Last byte of the JSON chunk must be the ASCII space used as filler.
    const jsonBytes = glb.subarray(20, 20 + jsonLength);
    expect(jsonBytes[jsonLength - 1]).toBe(0x20);
  });

  it("pads the binary chunk to a 4-byte boundary with zeros", () => {
    const bin = new Uint8Array([1, 2, 3, 4, 5]); // 5 bytes -> 3 bytes of padding
    const glb = packGlb({ asset: { version: "2.0" } }, bin);

    const jsonLength = u32(glb, 12);
    const binHeaderAt = 20 + jsonLength;
    const binLength = u32(glb, binHeaderAt);

    expect(binLength).toBe(8);
    expect(u32(glb, binHeaderAt + 4)).toBe(CHUNK_BIN);

    const binBytes = glb.subarray(binHeaderAt + 8, binHeaderAt + 8 + binLength);
    expect(Array.from(binBytes)).toEqual([1, 2, 3, 4, 5, 0, 0, 0]);
  });

  it("omits the binary chunk entirely when there is no binary data", () => {
    const glb = packGlb({ asset: { version: "2.0" } }, new Uint8Array(0));
    const jsonLength = u32(glb, 12);

    expect(glb.byteLength).toBe(12 + 8 + jsonLength);
  });

  it("produces a total length that is always 4-byte aligned", () => {
    for (const size of [0, 1, 2, 3, 4, 5, 17, 100]) {
      const glb = packGlb({ asset: { version: "2.0" }, extras: { size } }, new Uint8Array(size));
      expect(glb.byteLength % 4).toBe(0);
    }
  });
});

describe("unpackGlb", () => {
  it("round-trips the JSON document and the binary payload", () => {
    const doc = { asset: { version: "2.0", generator: "incarnatrun" }, scene: 0 };
    const bin = new Uint8Array([9, 8, 7]);

    const parsed = unpackGlb(packGlb(doc, bin));

    expect(parsed.json).toEqual(doc);
    // The padding is part of the chunk, so compare only the meaningful prefix.
    expect(Array.from(parsed.bin.subarray(0, 3))).toEqual([9, 8, 7]);
  });

  it("rejects data that is not a GLB", () => {
    expect(() => unpackGlb(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]))).toThrow(
      /not a GLB/i,
    );
  });

  it("rejects a truncated file", () => {
    expect(() => unpackGlb(new Uint8Array(4))).toThrow(/too short/i);
  });
});
