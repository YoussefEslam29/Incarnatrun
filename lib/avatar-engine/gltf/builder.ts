/**
 * Builds a glTF 2.0 document plus its binary buffer, then packs both into GLB.
 *
 * Design notes:
 *
 * - One bufferView per accessor. This costs a handful of bytes of JSON and buys
 *   simplicity: there is no interleaving, no byteStride, and no shared-view
 *   offset arithmetic to get wrong.
 * - Every bufferView starts on a 4-byte boundary. glTF requires an accessor's
 *   effective offset to be a multiple of its component size, and 4 satisfies
 *   every component type we emit.
 * - Nothing here knows what a humanoid is. It takes plain typed arrays, so it
 *   is trivially unit-testable and is reused unchanged by the export pipeline.
 */

import { packGlb } from "./glb";
import {
  BufferTarget,
  BYTES_PER_COMPONENT,
  COMPONENTS_PER_TYPE,
  ComponentType,
  FILTER_LINEAR,
  FILTER_LINEAR_MIPMAP_LINEAR,
  MODE_TRIANGLES,
  WRAP_REPEAT,
  type AccessorType,
  type Gltf,
  type GltfMaterial,
  type GltfNode,
  type GltfPrimitive,
  type GltfSkin,
} from "./types";

function align4(n: number): number {
  return (n + 3) & ~3;
}

export interface GltfBuilderOptions {
  generator?: string;
  copyright?: string;
}

export interface AccessorOptions {
  /** Write min/max. Required by the spec for POSITION accessors. */
  computeBounds?: boolean;
  name?: string;
}

export class GltfBuilder {
  private readonly doc: Gltf;
  private readonly chunks: Uint8Array[] = [];
  private byteLength = 0;
  private samplerIndex: number | null = null;

  constructor(options: GltfBuilderOptions = {}) {
    this.doc = {
      asset: {
        version: "2.0",
        generator: options.generator ?? "Incarnatrun",
        ...(options.copyright ? { copyright: options.copyright } : {}),
      },
      scenes: [],
      nodes: [],
      meshes: [],
      accessors: [],
      bufferViews: [],
      buffers: [],
    };
  }

  // -------------------------------------------------------------------------
  // Binary buffer
  // -------------------------------------------------------------------------

  /** Appends raw bytes to the binary buffer and returns a new bufferView index. */
  private addBufferView(data: Uint8Array, target?: BufferTarget): number {
    const byteOffset = align4(this.byteLength);
    const padding = byteOffset - this.byteLength;
    if (padding > 0) {
      this.chunks.push(new Uint8Array(padding));
      this.byteLength += padding;
    }

    this.chunks.push(data);
    this.byteLength += data.byteLength;

    this.doc.bufferViews.push({
      buffer: 0,
      byteOffset,
      byteLength: data.byteLength,
      ...(target !== undefined ? { target } : {}),
    });

    return this.doc.bufferViews.length - 1;
  }

  private addAccessor(
    data: Uint8Array,
    componentType: ComponentType,
    type: AccessorType,
    target: BufferTarget,
    options: AccessorOptions,
    values?: ArrayLike<number>,
  ): number {
    const components = COMPONENTS_PER_TYPE[type];
    const stride = components * BYTES_PER_COMPONENT[componentType];
    const count = data.byteLength / stride;

    const bufferView = this.addBufferView(data, target);

    const accessor: Gltf["accessors"][number] = {
      bufferView,
      componentType,
      count,
      type,
      ...(options.name ? { name: options.name } : {}),
    };

    if (options.computeBounds && values) {
      const min = new Array<number>(components).fill(Number.POSITIVE_INFINITY);
      const max = new Array<number>(components).fill(Number.NEGATIVE_INFINITY);
      for (let i = 0; i < count; i++) {
        for (let c = 0; c < components; c++) {
          const v = values[i * components + c];
          if (v < min[c]) min[c] = v;
          if (v > max[c]) max[c] = v;
        }
      }
      accessor.min = min;
      accessor.max = max;
    }

    this.doc.accessors.push(accessor);
    return this.doc.accessors.length - 1;
  }

  private static bytesOf(array: Float32Array | Uint8Array | Uint16Array | Uint32Array): Uint8Array {
    return new Uint8Array(array.buffer, array.byteOffset, array.byteLength);
  }

  // -------------------------------------------------------------------------
  // Typed accessor helpers
  // -------------------------------------------------------------------------

  addVec3Accessor(values: Float32Array, options: AccessorOptions = {}): number {
    return this.addAccessor(
      GltfBuilder.bytesOf(values),
      ComponentType.FLOAT,
      "VEC3",
      BufferTarget.ARRAY_BUFFER,
      options,
      values,
    );
  }

  addVec2Accessor(values: Float32Array, options: AccessorOptions = {}): number {
    return this.addAccessor(
      GltfBuilder.bytesOf(values),
      ComponentType.FLOAT,
      "VEC2",
      BufferTarget.ARRAY_BUFFER,
      options,
      values,
    );
  }

  addVec4Accessor(values: Float32Array, options: AccessorOptions = {}): number {
    return this.addAccessor(
      GltfBuilder.bytesOf(values),
      ComponentType.FLOAT,
      "VEC4",
      BufferTarget.ARRAY_BUFFER,
      options,
      values,
    );
  }

  /** Skin joint indices. Unsigned byte keeps the file small; 255 joints is ample. */
  addJointsAccessor(values: Uint8Array, options: AccessorOptions = {}): number {
    return this.addAccessor(
      values,
      ComponentType.UNSIGNED_BYTE,
      "VEC4",
      BufferTarget.ARRAY_BUFFER,
      options,
    );
  }

  /** Inverse bind matrices. Column-major 4x4, one per joint. */
  addMat4Accessor(values: Float32Array, options: AccessorOptions = {}): number {
    return this.addAccessor(
      GltfBuilder.bytesOf(values),
      ComponentType.FLOAT,
      "MAT4",
      // Inverse bind matrices are read by the engine, not bound as a GL buffer,
      // so the spec says to leave `target` unset.
      undefined as unknown as BufferTarget,
      options,
    );
  }

  addIndicesAccessor(values: Uint16Array | Uint32Array, options: AccessorOptions = {}): number {
    const componentType =
      values instanceof Uint32Array ? ComponentType.UNSIGNED_INT : ComponentType.UNSIGNED_SHORT;
    return this.addAccessor(
      GltfBuilder.bytesOf(values),
      componentType,
      "SCALAR",
      BufferTarget.ELEMENT_ARRAY_BUFFER,
      options,
    );
  }

  // -------------------------------------------------------------------------
  // Textures and materials
  // -------------------------------------------------------------------------

  /** Embeds image bytes and returns a texture index. One sampler is shared. */
  addTexture(imageBytes: Uint8Array, mimeType: string, name?: string): number {
    const bufferView = this.addBufferView(imageBytes);

    this.doc.images ??= [];
    this.doc.images.push({ bufferView, mimeType, ...(name ? { name } : {}) });
    const source = this.doc.images.length - 1;

    if (this.samplerIndex === null) {
      this.doc.samplers ??= [];
      this.doc.samplers.push({
        magFilter: FILTER_LINEAR,
        minFilter: FILTER_LINEAR_MIPMAP_LINEAR,
        wrapS: WRAP_REPEAT,
        wrapT: WRAP_REPEAT,
      });
      this.samplerIndex = this.doc.samplers.length - 1;
    }

    this.doc.textures ??= [];
    this.doc.textures.push({ sampler: this.samplerIndex, source, ...(name ? { name } : {}) });
    return this.doc.textures.length - 1;
  }

  addMaterial(material: GltfMaterial): number {
    this.doc.materials ??= [];
    this.doc.materials.push(material);
    return this.doc.materials.length - 1;
  }

  // -------------------------------------------------------------------------
  // Scene graph
  // -------------------------------------------------------------------------

  addMesh(primitives: GltfPrimitive[], name?: string): number {
    this.doc.meshes.push({
      primitives: primitives.map((p) => ({ mode: MODE_TRIANGLES, ...p })),
      ...(name ? { name } : {}),
    });
    return this.doc.meshes.length - 1;
  }

  addNode(node: GltfNode): number {
    this.doc.nodes.push(node);
    return this.doc.nodes.length - 1;
  }

  /** Mutates an already-added node. Used to wire children after both exist. */
  updateNode(index: number, patch: Partial<GltfNode>): void {
    Object.assign(this.doc.nodes[index], patch);
  }

  addSkin(skin: GltfSkin): number {
    this.doc.skins ??= [];
    this.doc.skins.push(skin);
    return this.doc.skins.length - 1;
  }

  setScene(rootNodes: number[], name?: string): number {
    this.doc.scenes.push({ nodes: rootNodes, ...(name ? { name } : {}) });
    const index = this.doc.scenes.length - 1;
    this.doc.scene = index;
    return index;
  }

  setExtras(extras: Record<string, unknown>): void {
    this.doc.extras = extras;
  }

  // -------------------------------------------------------------------------
  // Output
  // -------------------------------------------------------------------------

  /** Returns the JSON document as it currently stands. Useful in tests. */
  toJSON(): Gltf {
    return { ...this.doc, buffers: [{ byteLength: this.byteLength }] };
  }

  build(): Uint8Array {
    const bin = new Uint8Array(this.byteLength);
    let offset = 0;
    for (const chunk of this.chunks) {
      bin.set(chunk, offset);
      offset += chunk.byteLength;
    }

    // A scene is required by most importers; supply an empty one rather than
    // emitting a document that Blender will reject.
    if (this.doc.scenes.length === 0) {
      this.setScene([]);
    }

    this.doc.buffers = [{ byteLength: this.byteLength }];

    return packGlb(this.doc, bin);
  }
}
