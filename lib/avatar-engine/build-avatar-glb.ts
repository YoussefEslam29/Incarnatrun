/**
 * Packs a generated humanoid, and anything it is wearing, into a rigged GLB.
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
 *
 * The body and each garment become separate primitives on that one mesh, all
 * sharing the same skin. A Mixamo animation therefore moves the avatar and its
 * clothes together with no separate cloth rig.
 */

import { GltfBuilder } from "./gltf/builder";
import type { GltfMaterial, GltfPrimitive } from "./gltf/types";
import type { SkinnedMesh } from "./geometry/mesh";
import type { HumanoidMesh } from "./geometry/humanoid";
import { MIXAMO_BONES, type Skeleton } from "./geometry/skeleton";

export interface GarmentLayer {
  name: string;
  mesh: SkinnedMesh;
  /** PNG bytes. When absent the garment is a flat tint. */
  texture?: Uint8Array;
  /** Hex tint, used as the base colour factor. */
  colorHex: string;
}

export interface BuildAvatarGlbOptions {
  mesh: HumanoidMesh;
  skeleton: Skeleton;
  /** PNG bytes for the skin and face atlas. Optional. */
  texture?: Uint8Array;
  garments?: GarmentLayer[];
  name?: string;
  /** Copied into the glTF `extras` block for traceability. */
  extras?: Record<string, unknown>;
}

export const GENERATOR = "Incarnatrun builtin avatar engine";

/** #rrggbb to a linear-ish 0..1 RGBA factor. */
function hexToFactor(hex: string): [number, number, number, number] {
  const value = hex.replace("#", "");
  const channel = (i: number) => parseInt(value.slice(i, i + 2), 16) / 255;
  // glTF base colour factors are linear; sRGB hex needs converting or every
  // garment reads noticeably brighter in the viewer than the swatch that
  // produced it.
  const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  return [toLinear(channel(0)), toLinear(channel(2)), toLinear(channel(4)), 1];
}

export function buildAvatarGlb(options: BuildAvatarGlbOptions): Uint8Array {
  const { mesh, skeleton, texture, garments = [], name = "Avatar" } = options;

  const builder = new GltfBuilder({ generator: GENERATOR });

  /** Adds one skinned mesh's attributes and returns a primitive for it. */
  function addPrimitive(source: SkinnedMesh, material: number, label: string): GltfPrimitive {
    const vertexCount = source.positions.length / 3;

    return {
      attributes: {
        POSITION: builder.addVec3Accessor(source.positions, {
          computeBounds: true,
          name: `${label}_POSITION`,
        }),
        NORMAL: builder.addVec3Accessor(source.normals, { name: `${label}_NORMAL` }),
        TEXCOORD_0: builder.addVec2Accessor(source.uvs, { name: `${label}_TEXCOORD_0` }),
        JOINTS_0: builder.addJointsAccessor(source.joints, { name: `${label}_JOINTS_0` }),
        WEIGHTS_0: builder.addVec4Accessor(source.weights, { name: `${label}_WEIGHTS_0` }),
      },
      // Uint16 covers the current budget, but the geometry constants can grow,
      // so pick the index width from the actual vertex count.
      indices: builder.addIndicesAccessor(
        vertexCount > 65535 ? source.indices : Uint16Array.from(source.indices),
        { name: `${label}_indices` },
      ),
      material,
    };
  }

  // --- Body ----------------------------------------------------------------
  const skinMaterial: GltfMaterial = {
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
  };

  const primitives: GltfPrimitive[] = [
    addPrimitive(mesh, builder.addMaterial(skinMaterial), "body"),
  ];

  // --- Garments ------------------------------------------------------------
  for (const [index, garment] of garments.entries()) {
    const material = builder.addMaterial({
      name: garment.name,
      pbrMetallicRoughness: {
        // With a texture present the factor must stay white, or the tint
        // multiplies into the user's photo and muddies it.
        baseColorFactor: garment.texture ? [1, 1, 1, 1] : hexToFactor(garment.colorHex),
        metallicFactor: 0,
        roughnessFactor: 0.82,
        ...(garment.texture
          ? {
              baseColorTexture: {
                index: builder.addTexture(garment.texture, "image/png", `${garment.name}Texture`),
              },
            }
          : {}),
      },
      // Cloth is thin; showing its inside face avoids holes when the camera
      // passes through a sleeve.
      doubleSided: true,
      alphaMode: "OPAQUE",
    });

    primitives.push(addPrimitive(garment.mesh, material, `garment${index}`));
  }

  const meshIndex = builder.addMesh(primitives, "AvatarBody");

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
