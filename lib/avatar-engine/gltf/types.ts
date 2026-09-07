/**
 * The subset of the glTF 2.0 schema that Incarnatrun writes.
 *
 * These are deliberately hand-written rather than pulled from a package: we
 * only emit a narrow, well-understood slice of the format, and having the types
 * here makes the invariants that matter (which fields are required, which are
 * indices into which array) visible at the point of use.
 */

export enum ComponentType {
  BYTE = 5120,
  UNSIGNED_BYTE = 5121,
  SHORT = 5122,
  UNSIGNED_SHORT = 5123,
  UNSIGNED_INT = 5125,
  FLOAT = 5126,
}

export enum BufferTarget {
  ARRAY_BUFFER = 34962,
  ELEMENT_ARRAY_BUFFER = 34963,
}

export type AccessorType = "SCALAR" | "VEC2" | "VEC3" | "VEC4" | "MAT4";

/** Number of components per element, keyed by accessor type. */
export const COMPONENTS_PER_TYPE: Record<AccessorType, number> = {
  SCALAR: 1,
  VEC2: 2,
  VEC3: 3,
  VEC4: 4,
  MAT4: 16,
};

/** Size in bytes of one component, keyed by component type. */
export const BYTES_PER_COMPONENT: Record<ComponentType, number> = {
  [ComponentType.BYTE]: 1,
  [ComponentType.UNSIGNED_BYTE]: 1,
  [ComponentType.SHORT]: 2,
  [ComponentType.UNSIGNED_SHORT]: 2,
  [ComponentType.UNSIGNED_INT]: 4,
  [ComponentType.FLOAT]: 4,
};

export interface GltfAsset {
  version: "2.0";
  generator?: string;
  copyright?: string;
}

export interface GltfBuffer {
  byteLength: number;
  uri?: string;
}

export interface GltfBufferView {
  buffer: number;
  byteOffset?: number;
  byteLength: number;
  byteStride?: number;
  target?: BufferTarget;
}

export interface GltfAccessor {
  bufferView?: number;
  byteOffset?: number;
  componentType: ComponentType;
  normalized?: boolean;
  count: number;
  type: AccessorType;
  min?: number[];
  max?: number[];
  name?: string;
}

export interface GltfPrimitive {
  attributes: {
    POSITION: number;
    NORMAL?: number;
    TEXCOORD_0?: number;
    JOINTS_0?: number;
    WEIGHTS_0?: number;
    COLOR_0?: number;
  };
  indices?: number;
  material?: number;
  /** 4 = TRIANGLES, which is the only mode we emit. */
  mode?: number;
}

export interface GltfMesh {
  primitives: GltfPrimitive[];
  name?: string;
}

export interface GltfNode {
  name?: string;
  children?: number[];
  mesh?: number;
  skin?: number;
  translation?: [number, number, number];
  rotation?: [number, number, number, number];
  scale?: [number, number, number];
  matrix?: number[];
}

export interface GltfSkin {
  /** Accessor of MAT4 inverse bind matrices, one per joint. */
  inverseBindMatrices?: number;
  /** Node index of the common root of the joint hierarchy. */
  skeleton?: number;
  /** Node indices of the joints, in the order the JOINTS_0 attribute uses. */
  joints: number[];
  name?: string;
}

export interface GltfTextureRef {
  index: number;
  texCoord?: number;
}

export interface GltfPbrMetallicRoughness {
  baseColorFactor?: [number, number, number, number];
  baseColorTexture?: GltfTextureRef;
  metallicFactor?: number;
  roughnessFactor?: number;
}

export interface GltfMaterial {
  name?: string;
  pbrMetallicRoughness?: GltfPbrMetallicRoughness;
  doubleSided?: boolean;
  alphaMode?: "OPAQUE" | "MASK" | "BLEND";
  alphaCutoff?: number;
}

export interface GltfImage {
  bufferView?: number;
  mimeType?: string;
  uri?: string;
  name?: string;
}

export interface GltfSampler {
  magFilter?: number;
  minFilter?: number;
  wrapS?: number;
  wrapT?: number;
}

export interface GltfTexture {
  sampler?: number;
  source?: number;
  name?: string;
}

export interface GltfScene {
  nodes: number[];
  name?: string;
}

export interface Gltf {
  asset: GltfAsset;
  scene?: number;
  scenes: GltfScene[];
  nodes: GltfNode[];
  meshes: GltfMesh[];
  accessors: GltfAccessor[];
  bufferViews: GltfBufferView[];
  buffers: GltfBuffer[];
  materials?: GltfMaterial[];
  skins?: GltfSkin[];
  images?: GltfImage[];
  samplers?: GltfSampler[];
  textures?: GltfTexture[];
  extras?: Record<string, unknown>;
}

/** Triangle primitive mode. */
export const MODE_TRIANGLES = 4;

/** Sampler filter and wrap constants used by the avatar material. */
export const FILTER_LINEAR = 9729;
export const FILTER_LINEAR_MIPMAP_LINEAR = 9987;
export const WRAP_CLAMP_TO_EDGE = 33071;
export const WRAP_REPEAT = 10497;
