/**
 * GLB container: the binary wrapper around a glTF 2.0 JSON document.
 *
 * Layout, all integers little-endian:
 *
 *   header  magic:u32 | version:u32 | totalLength:u32
 *   chunk   chunkLength:u32 | chunkType:u32 | data[chunkLength]
 *
 * There is one JSON chunk and, if there is any binary payload, one BIN chunk.
 * Both chunk payloads must be padded to a 4-byte boundary: JSON with spaces so
 * the document stays parseable, BIN with zeros.
 *
 * Spec: https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html#glb-file-format-specification
 */

/** ASCII "glTF" read as a little-endian u32. */
export const GLB_MAGIC = 0x46546c67;
/** ASCII "JSON". */
export const CHUNK_JSON = 0x4e4f534a;
/** ASCII "BIN\0". */
export const CHUNK_BIN = 0x004e4942;

const HEADER_BYTES = 12;
const CHUNK_HEADER_BYTES = 8;

/** Rounds up to the next multiple of 4. */
function align4(n: number): number {
  return (n + 3) & ~3;
}

/**
 * Packs a glTF JSON document and its binary buffer into GLB bytes.
 *
 * `bin` may be empty, in which case no BIN chunk is emitted at all — a GLB with
 * a zero-length BIN chunk is legal but some importers dislike it.
 */
export function packGlb(json: unknown, bin: Uint8Array): Uint8Array {
  const jsonBytes = new TextEncoder().encode(JSON.stringify(json));
  const jsonPadded = align4(jsonBytes.byteLength);
  const hasBin = bin.byteLength > 0;
  const binPadded = hasBin ? align4(bin.byteLength) : 0;

  const total =
    HEADER_BYTES +
    CHUNK_HEADER_BYTES +
    jsonPadded +
    (hasBin ? CHUNK_HEADER_BYTES + binPadded : 0);

  const out = new Uint8Array(total);
  const view = new DataView(out.buffer);
  let offset = 0;

  view.setUint32(offset, GLB_MAGIC, true);
  view.setUint32(offset + 4, 2, true);
  view.setUint32(offset + 8, total, true);
  offset += HEADER_BYTES;

  view.setUint32(offset, jsonPadded, true);
  view.setUint32(offset + 4, CHUNK_JSON, true);
  offset += CHUNK_HEADER_BYTES;
  out.set(jsonBytes, offset);
  // Pad with spaces, not zeros, so the chunk remains valid JSON text.
  out.fill(0x20, offset + jsonBytes.byteLength, offset + jsonPadded);
  offset += jsonPadded;

  if (hasBin) {
    view.setUint32(offset, binPadded, true);
    view.setUint32(offset + 4, CHUNK_BIN, true);
    offset += CHUNK_HEADER_BYTES;
    out.set(bin, offset);
    // Remaining bytes are already zero from the Uint8Array allocation.
  }

  return out;
}

export interface UnpackedGlb {
  json: Record<string, unknown>;
  bin: Uint8Array;
}

/** Reads GLB bytes back into the JSON document and binary buffer. */
export function unpackGlb(bytes: Uint8Array): UnpackedGlb {
  if (bytes.byteLength < HEADER_BYTES) {
    throw new Error("Invalid GLB: file is too short to contain a header.");
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  // Check the magic before anything else, so a file that is simply not a GLB is
  // reported as such rather than as a structural error further in.
  if (view.getUint32(0, true) !== GLB_MAGIC) {
    throw new Error("Invalid GLB: not a GLB file (bad magic number).");
  }

  const version = view.getUint32(4, true);
  if (version !== 2) {
    throw new Error(`Unsupported GLB version ${version}: only glTF 2.0 is supported.`);
  }

  let offset = HEADER_BYTES;
  let json: Record<string, unknown> | null = null;
  // Annotated rather than inferred: `subarray` on the input yields
  // Uint8Array<ArrayBufferLike>, which will not assign to the narrower
  // Uint8Array<ArrayBuffer> that the initialiser would otherwise infer.
  let bin: Uint8Array = new Uint8Array(0);

  while (offset + CHUNK_HEADER_BYTES <= bytes.byteLength) {
    const chunkLength = view.getUint32(offset, true);
    const chunkType = view.getUint32(offset + 4, true);
    const dataStart = offset + CHUNK_HEADER_BYTES;

    if (dataStart + chunkLength > bytes.byteLength) {
      throw new Error("Invalid GLB: chunk extends past the end of the file.");
    }

    if (chunkType === CHUNK_JSON) {
      const text = new TextDecoder().decode(bytes.subarray(dataStart, dataStart + chunkLength));
      json = JSON.parse(text) as Record<string, unknown>;
    } else if (chunkType === CHUNK_BIN) {
      bin = bytes.subarray(dataStart, dataStart + chunkLength);
    }
    // Unknown chunk types are skipped, as the spec requires.

    offset = dataStart + chunkLength;
  }

  if (!json) {
    throw new Error("Invalid GLB: no JSON chunk found.");
  }

  return { json, bin };
}
