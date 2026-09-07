/**
 * Prepares a loaded glTF scene for display: clones it, collects the materials
 * the reveal animates, and counts what the viewer's overlay reports.
 *
 * Lives outside the React component and touches no WebGL, so it can be tested
 * in Node. That matters: the first version of this recursed infinitely, and no
 * amount of checking server-rendered HTML would ever have found it.
 */

import * as THREE from "three";

export interface ViewerStats {
  vertices: number;
  triangles: number;
  bones: number;
}

export interface PreparedModel {
  scene: THREE.Group | null;
  /** Wireframe overlays, faded out as the skin fades in. */
  wireMaterials: THREE.MeshBasicMaterial[];
  /** The model's own materials, faded in. */
  skinMaterials: THREE.MeshStandardMaterial[];
  stats: ViewerStats;
  error: string | null;
}

const WIRE_COLOR = "#6a78ff";

/**
 * @param source the loaded scene. It is cloned, never mutated: useGLTF caches
 *   by URL, so changing the original would leak into every other mount of the
 *   same model.
 * @param reveal whether to build the wireframe overlay for the intro animation.
 */
export function prepareModel(source: THREE.Object3D, reveal: boolean): PreparedModel {
  const empty: ViewerStats = { vertices: 0, triangles: 0, bones: 0 };

  let scene: THREE.Group;
  try {
    scene = source.clone(true) as THREE.Group;
  } catch (error) {
    return {
      scene: null,
      wireMaterials: [],
      skinMaterials: [],
      stats: empty,
      error: error instanceof Error ? error.message : "That model could not be read.",
    };
  }

  const wireMaterials: THREE.MeshBasicMaterial[] = [];
  const skinMaterials: THREE.MeshStandardMaterial[] = [];
  let vertices = 0;
  let triangles = 0;
  let bones = 0;

  /*
    Collect first, mutate second.

    Object3D.traverse walks `children` as it goes, so adding a child from inside
    the callback hands traverse a new node to visit. Each overlay is itself a
    mesh, so it would be given its own overlay, and so on until the stack runs
    out. Gathering the meshes into an array and adding overlays afterwards is
    the whole fix.
  */
  const meshes: THREE.Mesh[] = [];

  scene.traverse((object) => {
    if ((object as THREE.Bone).isBone) bones++;
    if ((object as THREE.Mesh).isMesh) meshes.push(object as THREE.Mesh);
  });

  for (const object of meshes) {
    vertices += object.geometry.attributes.position?.count ?? 0;
    triangles += object.geometry.index
      ? object.geometry.index.count / 3
      : (object.geometry.attributes.position?.count ?? 0) / 3;

    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) {
      if ((material as THREE.MeshStandardMaterial).isMeshStandardMaterial) {
        const standard = material as THREE.MeshStandardMaterial;
        standard.transparent = reveal;
        standard.opacity = reveal ? 0 : 1;
        skinMaterials.push(standard);
      }
    }

    if (!reveal) continue;

    const wire = new THREE.MeshBasicMaterial({
      color: new THREE.Color(WIRE_COLOR),
      wireframe: true,
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });

    const skinned = object as THREE.SkinnedMesh;
    const overlay = skinned.isSkinnedMesh
      ? new THREE.SkinnedMesh(object.geometry, wire)
      : new THREE.Mesh(object.geometry, wire);

    if (overlay instanceof THREE.SkinnedMesh && skinned.isSkinnedMesh) {
      overlay.bind(skinned.skeleton, skinned.bindMatrix);
    }

    // Added as a sibling with the same local transform, not as a child. A child
    // of a skinned mesh inherits a transform the skinning has already applied.
    overlay.position.copy(object.position);
    overlay.quaternion.copy(object.quaternion);
    overlay.scale.copy(object.scale);
    overlay.renderOrder = 2;
    overlay.name = `${object.name || "mesh"}__wireframe`;

    (object.parent ?? scene).add(overlay);
    wireMaterials.push(wire);
  }

  return {
    scene,
    wireMaterials,
    skinMaterials,
    stats: { vertices, triangles: Math.round(triangles), bones },
    error: null,
  };
}
