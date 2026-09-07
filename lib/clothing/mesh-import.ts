/**
 * Option C from idea.md section 6: let a user upload their own 3D garment.
 *
 * Supported formats are OBJ and glTF/GLB. FBX is detected and refused with a
 * specific instruction rather than a generic failure: parsing binary FBX is a
 * substantial job on its own, and every tool that exports FBX also exports GLB
 * or OBJ, so the honest answer is to say so.
 *
 * Nothing here trusts the file. An uploaded mesh is arbitrary user input that
 * gets read into memory and then bound to a skeleton, so vertex and triangle
 * counts are capped, indices are range-checked, and non-finite coordinates are
 * rejected before anything downstream sees them.
 */

import { unpackGlb } from "../avatar-engine/gltf/glb";
import {
  BYTES_PER_COMPONENT,
  COMPONENTS_PER_TYPE,
  ComponentType,
  type AccessorType,
  type Gltf,
} from "../avatar-engine/gltf/types";

/** Above this a garment is not a garment, it is a scanned room. */
export const MAX_VERTICES = 200_000;
export const MAX_TRIANGLES = 300_000;
export const MAX_FILE_BYTES = 24 * 1024 * 1024;

export type GarmentMeshFormat = "obj" | "glb" | "gltf";

export interface ImportedGarmentMesh {
  format: GarmentMeshFormat;
  positions: Float32Array;
  normals: Float32Array;
  uvs: Float32Array;
  indices: Uint32Array;
  vertexCount: number;
  triangleCount: number;
  bounds: { min: [number, number, number]; max: [number, number, number] };
  warnings: string[];
}

export class GarmentMeshError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GarmentMeshError";
  }
}

/** Recognises the format from the bytes, falling back to the file extension. */
export function detectMeshFormat(data: Uint8Array, filename: string): GarmentMeshFormat {
  if (data.byteLength >= 4) {
    const view = new DataView(data.buffer, data.byteOffset, Math.min(4, data.byteLength));
    // "glTF"
    if (view.getUint32(0, true) === 0x46546c67) return "glb";
  }

  // Binary FBX files begin with this exact signature.
  const head = new TextDecoder("latin1").decode(data.subarray(0, 20));
  if (head.startsWith("Kaydara FBX Binary")) {
    throw new GarmentMeshError(
      "FBX files are not supported yet. Export the garment as GLB or OBJ instead: every tool that writes FBX can write one of those.",
    );
  }
  if (head.includes("FBX")) {
    throw new GarmentMeshError(
      "That looks like an FBX file, which is not supported yet. Export the garment as GLB or OBJ instead.",
    );
  }

  const extension = filename.toLowerCase().split(".").pop() ?? "";
  if (extension === "obj") return "obj";
  if (extension === "gltf") return "gltf";
  if (extension === "glb") return "glb";
  if (extension === "fbx") {
    throw new GarmentMeshError(
      "FBX files are not supported yet. Export the garment as GLB or OBJ instead.",
    );
  }

  throw new GarmentMeshError(
    `Unsupported file type "${extension || filename}". Upload an OBJ, GLB or glTF file.`,
  );
}

export function importGarmentMesh(data: Uint8Array, filename: string): ImportedGarmentMesh {
  if (data.byteLength === 0) {
    throw new GarmentMeshError("That file is empty.");
  }
  if (data.byteLength > MAX_FILE_BYTES) {
    throw new GarmentMeshError(
      `That file is ${(data.byteLength / 1024 / 1024).toFixed(1)} MB. The limit is ${MAX_FILE_BYTES / 1024 / 1024} MB.`,
    );
  }

  const format = detectMeshFormat(data, filename);
  const mesh = format === "obj" ? parseObj(data) : parseGltf(data, format);

  return finalise(mesh, format);
}

interface RawMesh {
  positions: number[];
  normals: number[];
  uvs: number[];
  indices: number[];
  warnings: string[];
}

// ---------------------------------------------------------------------------
// OBJ
// ---------------------------------------------------------------------------

/**
 * Parses Wavefront OBJ.
 *
 * OBJ indexes position, normal and UV separately, but GPUs need one index per
 * vertex, so each unique v/vt/vn triple becomes one vertex. Faces with more
 * than three corners are fan-triangulated, which is correct for the convex
 * quads that clothing meshes are almost entirely made of.
 */
function parseObj(data: Uint8Array): RawMesh {
  const text = new TextDecoder().decode(data);

  const vs: number[] = [];
  const vts: number[] = [];
  const vns: number[] = [];

  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const warnings: string[] = [];

  const seen = new Map<string, number>();
  let missingNormals = false;
  let missingUvs = false;

  const resolve = (spec: string): number => {
    const existing = seen.get(spec);
    if (existing !== undefined) return existing;

    const [vRaw, vtRaw, vnRaw] = spec.split("/");

    // OBJ indices are 1-based, and negative values count back from the end.
    const pick = (raw: string | undefined, list: number[], stride: number): number => {
      if (!raw) return -1;
      const parsed = parseInt(raw, 10);
      if (Number.isNaN(parsed)) return -1;
      const index = parsed > 0 ? parsed - 1 : list.length / stride + parsed;
      return index >= 0 && index < list.length / stride ? index : -1;
    };

    const vi = pick(vRaw, vs, 3);
    if (vi < 0) throw new GarmentMeshError("That OBJ file has a face referring to a missing vertex.");

    positions.push(vs[vi * 3], vs[vi * 3 + 1], vs[vi * 3 + 2]);

    const ti = pick(vtRaw, vts, 2);
    if (ti >= 0) {
      uvs.push(vts[ti * 2], vts[ti * 2 + 1]);
    } else {
      uvs.push(0, 0);
      missingUvs = true;
    }

    const ni = pick(vnRaw, vns, 3);
    if (ni >= 0) {
      normals.push(vns[ni * 3], vns[ni * 3 + 1], vns[ni * 3 + 2]);
    } else {
      normals.push(0, 0, 0);
      missingNormals = true;
    }

    const index = positions.length / 3 - 1;
    seen.set(spec, index);
    return index;
  };

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const parts = line.split(/\s+/);
    const keyword = parts[0];

    if (keyword === "v") {
      vs.push(Number(parts[1]), Number(parts[2]), Number(parts[3]));
    } else if (keyword === "vt") {
      vts.push(Number(parts[1]), Number(parts[2]));
    } else if (keyword === "vn") {
      vns.push(Number(parts[1]), Number(parts[2]), Number(parts[3]));
    } else if (keyword === "f") {
      const corners = parts.slice(1).filter(Boolean).map(resolve);
      for (let i = 1; i + 1 < corners.length; i++) {
        indices.push(corners[0], corners[i], corners[i + 1]);
      }
    }
  }

  // Order matters: positions are only populated by resolving face corners, so
  // a file with `v` lines and no `f` lines has an empty position list. Check
  // the raw vertex list first, or every faceless file reports as empty.
  if (vs.length === 0) {
    throw new GarmentMeshError("That OBJ file contains no geometry.");
  }
  if (indices.length === 0) {
    throw new GarmentMeshError("That OBJ file contains vertices but no faces.");
  }

  if (missingUvs) warnings.push("The file had no texture coordinates, so a flat colour is used.");
  if (missingNormals) warnings.push("The file had no normals, so they were computed from the faces.");

  return { positions, normals, uvs, indices, warnings };
}

// ---------------------------------------------------------------------------
// glTF / GLB
// ---------------------------------------------------------------------------

function parseGltf(data: Uint8Array, format: GarmentMeshFormat): RawMesh {
  let doc: Gltf;
  let bin: Uint8Array;

  if (format === "glb") {
    const unpacked = unpackGlb(data);
    doc = unpacked.json as unknown as Gltf;
    bin = unpacked.bin;
  } else {
    try {
      doc = JSON.parse(new TextDecoder().decode(data)) as Gltf;
    } catch {
      throw new GarmentMeshError("That glTF file is not valid JSON.");
    }
    // A .gltf that keeps its buffers in separate files cannot be resolved from
    // a single upload. Say so rather than producing an empty mesh.
    bin = new Uint8Array(0);
    if (doc.buffers?.some((b) => b.uri && !b.uri.startsWith("data:"))) {
      throw new GarmentMeshError(
        "That glTF file refers to separate .bin files, which cannot be uploaded on their own. Export it as a single .glb instead.",
      );
    }
    if (doc.buffers?.[0]?.uri?.startsWith("data:")) {
      const base64 = doc.buffers[0].uri.split(",")[1] ?? "";
      bin = new Uint8Array(Buffer.from(base64, "base64"));
    }
  }

  if (!doc.meshes?.length) {
    throw new GarmentMeshError("That file contains no meshes.");
  }

  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const warnings: string[] = [];

  const readAccessor = (index: number): Float32Array | Uint32Array => {
    const accessor = doc.accessors?.[index];
    if (!accessor) throw new GarmentMeshError("That file has a mesh pointing at a missing accessor.");

    const view = doc.bufferViews?.[accessor.bufferView ?? -1];
    if (!view) throw new GarmentMeshError("That file has an accessor pointing at a missing buffer view.");

    const components = COMPONENTS_PER_TYPE[accessor.type as AccessorType];
    const bytesPer = BYTES_PER_COMPONENT[accessor.componentType];
    const start = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
    const count = accessor.count * components;

    if (start + count * bytesPer > bin.byteLength) {
      throw new GarmentMeshError("That file is truncated: an accessor runs past the end of its buffer.");
    }

    const source = new DataView(bin.buffer, bin.byteOffset + start);
    const out =
      accessor.componentType === ComponentType.FLOAT
        ? new Float32Array(count)
        : new Uint32Array(count);

    for (let i = 0; i < count; i++) {
      const at = i * bytesPer;
      switch (accessor.componentType) {
        case ComponentType.FLOAT:
          out[i] = source.getFloat32(at, true);
          break;
        case ComponentType.UNSIGNED_INT:
          out[i] = source.getUint32(at, true);
          break;
        case ComponentType.UNSIGNED_SHORT:
          out[i] = source.getUint16(at, true);
          break;
        case ComponentType.UNSIGNED_BYTE:
          out[i] = source.getUint8(at);
          break;
        default:
          throw new GarmentMeshError(
            `That file uses an unsupported component type (${accessor.componentType}).`,
          );
      }
    }

    return out;
  };

  // Merge every primitive of every mesh. An uploaded garment is often split
  // into shell, trim and buttons, and the user means all of it.
  for (const mesh of doc.meshes) {
    for (const primitive of mesh.primitives) {
      if (primitive.mode !== undefined && primitive.mode !== 4) {
        warnings.push("Skipped a part of the file that was not made of triangles.");
        continue;
      }

      const vertexOffset = positions.length / 3;
      const position = readAccessor(primitive.attributes.POSITION) as Float32Array;
      for (const value of position) positions.push(value);

      if (primitive.attributes.NORMAL !== undefined) {
        for (const value of readAccessor(primitive.attributes.NORMAL)) normals.push(value);
      } else {
        for (let i = 0; i < position.length; i++) normals.push(0);
      }

      if (primitive.attributes.TEXCOORD_0 !== undefined) {
        for (const value of readAccessor(primitive.attributes.TEXCOORD_0)) uvs.push(value);
      } else {
        for (let i = 0; i < (position.length / 3) * 2; i++) uvs.push(0);
      }

      if (primitive.indices !== undefined) {
        for (const value of readAccessor(primitive.indices)) indices.push(value + vertexOffset);
      } else {
        // A primitive with no index buffer is an implicit sequential list.
        for (let i = 0; i < position.length / 3; i++) indices.push(vertexOffset + i);
      }
    }
  }

  if (positions.length === 0) {
    throw new GarmentMeshError("That file contains no triangle geometry.");
  }

  return { positions, normals, uvs, indices, warnings };
}

// ---------------------------------------------------------------------------
// Validation and normalisation
// ---------------------------------------------------------------------------

function finalise(raw: RawMesh, format: GarmentMeshFormat): ImportedGarmentMesh {
  const vertexCount = raw.positions.length / 3;
  const triangleCount = raw.indices.length / 3;

  if (vertexCount > MAX_VERTICES) {
    throw new GarmentMeshError(
      `That mesh has ${vertexCount.toLocaleString()} vertices. The limit is ${MAX_VERTICES.toLocaleString()}. Decimate it before uploading.`,
    );
  }
  if (triangleCount > MAX_TRIANGLES) {
    throw new GarmentMeshError(
      `That mesh has ${triangleCount.toLocaleString()} triangles. The limit is ${MAX_TRIANGLES.toLocaleString()}.`,
    );
  }
  if (raw.indices.length % 3 !== 0) {
    throw new GarmentMeshError("That mesh has an incomplete triangle.");
  }

  for (const index of raw.indices) {
    if (!Number.isInteger(index) || index < 0 || index >= vertexCount) {
      throw new GarmentMeshError("That mesh has a face index pointing outside its vertex list.");
    }
  }

  const positions = new Float32Array(raw.positions);
  for (const value of positions) {
    if (!Number.isFinite(value)) {
      throw new GarmentMeshError("That mesh contains invalid coordinates.");
    }
  }

  const indices = new Uint32Array(raw.indices);
  let normals: Float32Array = new Float32Array(raw.normals);

  // Replace any zero-length normal by recomputing from the faces, so a file
  // without normals still shades instead of rendering flat black.
  const needsNormals =
    normals.length !== positions.length ||
    normals.every((value, i) => value === 0 || i % 3 !== 0 ? value === 0 : true);

  if (normals.length !== positions.length || hasZeroNormals(normals)) {
    normals = computeNormals(positions, indices);
    if (needsNormals && !raw.warnings.some((w) => w.includes("normals"))) {
      raw.warnings.push("Normals were computed from the geometry.");
    }
  }

  const uvs =
    raw.uvs.length === vertexCount * 2 ? new Float32Array(raw.uvs) : new Float32Array(vertexCount * 2);

  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < positions.length; i += 3) {
    for (let c = 0; c < 3; c++) {
      if (positions[i + c] < min[c]) min[c] = positions[i + c];
      if (positions[i + c] > max[c]) max[c] = positions[i + c];
    }
  }

  return {
    format,
    positions,
    normals,
    uvs,
    indices,
    vertexCount,
    triangleCount,
    bounds: { min, max },
    warnings: raw.warnings,
  };
}

function hasZeroNormals(normals: Float32Array): boolean {
  for (let i = 0; i < normals.length; i += 3) {
    if (normals[i] === 0 && normals[i + 1] === 0 && normals[i + 2] === 0) return true;
  }
  return false;
}

/** Area-weighted vertex normals from face normals. */
export function computeNormals(positions: Float32Array, indices: Uint32Array): Float32Array {
  const normals = new Float32Array(positions.length);

  for (let t = 0; t < indices.length; t += 3) {
    const [a, b, c] = [indices[t], indices[t + 1], indices[t + 2]];

    const ax = positions[a * 3], ay = positions[a * 3 + 1], az = positions[a * 3 + 2];
    const bx = positions[b * 3], by = positions[b * 3 + 1], bz = positions[b * 3 + 2];
    const cx = positions[c * 3], cy = positions[c * 3 + 1], cz = positions[c * 3 + 2];

    const e1x = bx - ax, e1y = by - ay, e1z = bz - az;
    const e2x = cx - ax, e2y = cy - ay, e2z = cz - az;

    // The cross product's magnitude is twice the triangle's area, so leaving it
    // unnormalised weights each face by its size, which is what you want.
    const nx = e1y * e2z - e1z * e2y;
    const ny = e1z * e2x - e1x * e2z;
    const nz = e1x * e2y - e1y * e2x;

    for (const index of [a, b, c]) {
      normals[index * 3] += nx;
      normals[index * 3 + 1] += ny;
      normals[index * 3 + 2] += nz;
    }
  }

  for (let i = 0; i < normals.length; i += 3) {
    const length = Math.hypot(normals[i], normals[i + 1], normals[i + 2]);
    if (length > 0) {
      normals[i] /= length;
      normals[i + 1] /= length;
      normals[i + 2] /= length;
    } else {
      normals[i + 1] = 1;
    }
  }

  return normals;
}
