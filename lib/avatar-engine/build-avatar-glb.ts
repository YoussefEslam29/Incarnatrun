/**
 * Packs a generated humanoid into a rigged GLB.
 *
 * Node layout:
 *
 *   root ("Avatar name")
 *   ├── mixamorig:Hips ... (the joint hierarchy)
 *   └── mesh node (mesh + skin)
 *
 * The skinned mesh node is a sibling of the joint hierarchy rather than a child
 * of it. Parenting it under a joint applies that joint's transform twice: once
 * through the node graph and once through the skin, which makes the avatar
 * drift away from its skeleton the moment an animation plays.
 */

import { GltfBuilder } from "./gltf/builder";
import type { GltfPrimitive } from "./gltf/types";
import type { HumanoidMesh } from "./geometry/humanoid";
import { MIXAMO_BONES, type Skeleton } from "./geometry/skeleton";

export interface BuildAvatarGlbOptions {
  mesh: HumanoidMesh;
  skeleton: Skeleton;
  /** PNG bytes for the skin/face atlas. Optional. */
  texture?: Uint8Array;
  name?: string;
  /** Copied into the glTF `extras` block for traceability. */
  extras?: Record<string, unknown>;
}

export const GENERATOR = "Incarnatrun builtin avatar engine";

export function buildAvatarGlb(options: BuildAvatarGlbOptions): Uint8Array {
  const { mesh, skeleton, texture, name = "Avatar" } = options;

  const builder = new GltfBuilder({ generator: GENERATOR });

  // --- Vertex data ---------------------------------------------------------
  const position = builder.addVec3Accessor(mesh.positions, {
    computeBounds: true,
    name: "POSITION",
  });
  const normal = builder.addVec3Accessor(mesh.normals, { name: "NORMAL" });
  const texcoord = builder.addVec2Accessor(mesh.uvs, { name: "TEXCOORD_0" });
  const joints = builder.addJointsAccessor(mesh.joints, { name: "JOINTS_0" });
  const weights = builder.addVec4Accessor(mesh.weights, { name: "WEIGHTS_0" });

  // Uint16 would be enough for the current vertex budget, but the count grows
  // with the geometry constants, so pick the width from the actual data.
  const vertexCount = mesh.positions.length / 3;
  const indices = builder.addIndicesAccessor(
    vertexCount > 65535 ? mesh.indices : Uint16Array.from(mesh.indices),
    { name: "indices" },
  );

  // --- Material ------------------------------------------------------------
  const materialIndex = builder.addMaterial({
    name: "AvatarSkin",
    pbrMetallicRoughness: {
      baseColorFactor: [1, 1, 1, 1],
      metallicFactor: 0,
      roughnessFactor: 0.72,
      ...(texture
        ? { baseColorTexture: { index: builder.addTexture(texture, "image/png", "AvatarAtlas") } }
        : {}),
    },
    doubleSided: false,
    alphaMode: "OPAQUE",
  });

  const primitive: GltfPrimitive = {
    attributes: {
      POSITION: position,
      NORMAL: normal,
      TEXCOORD_0: texcoord,
      JOINTS_0: joints,
      WEIGHTS_0: weights,
    },
    indices,
    material: materialIndex,
  };

  const meshIndex = builder.addMesh([primitive], "AvatarBody");

  // --- Joint nodes ---------------------------------------------------------
  // glTF stores children on the parent; the bone table stores the parent on the
  // child. Invert the mapping once, up front, rather than accumulating it.
  const children = new Map<number, number[]>();
  MIXAMO_BONES.forEach((bone, index) => {
    if (bone.parent === -1) return;
    const siblings = children.get(bone.parent);
    if (siblings) siblings.push(index);
    else children.set(bone.parent, [index]);
  });

  // Added in bone order so a node index equals its bone index, which is what
  // the JOINTS_0 attribute assumes.
  MIXAMO_BONES.forEach((bone, index) => {
    const [x, y, z] = skeleton.bones[index].localTranslation;
    const kids = children.get(index);
    builder.addNode({
      name: bone.name,
      translation: [x, y, z],
      ...(kids ? { children: kids } : {}),
    });
  });

  const inverseBindMatrices = builder.addMat4Accessor(skeleton.inverseBindMatrices, {
    name: "inverseBindMatrices",
  });

  const skinIndex = builder.addSkin({
    name: "AvatarRig",
    joints: MIXAMO_BONES.map((_, i) => i),
    skeleton: 0,
    inverseBindMatrices,
  });

  const meshNode = builder.addNode({ name: "AvatarMesh", mesh: meshIndex, skin: skinIndex });
  const rootNode = builder.addNode({ name, children: [0, meshNode] });

  builder.setScene([rootNode], name);

  if (options.extras) {
    builder.setExtras(options.extras);
  }

  return builder.build();
}
