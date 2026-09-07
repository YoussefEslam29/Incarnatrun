import { describe, it, expect } from "vitest";
import * as THREE from "three";
import { prepareModel } from "@/lib/three/prepare-model";

/**
 * A small stand-in for a loaded avatar: a skinned mesh bound to two bones, plus
 * a plain mesh alongside it, which is the shape a dressed avatar arrives in.
 */
function makeScene(): THREE.Group {
  const scene = new THREE.Group();
  scene.name = "Avatar";

  const hips = new THREE.Bone();
  hips.name = "mixamorig:Hips";
  const spine = new THREE.Bone();
  spine.name = "mixamorig:Spine";
  hips.add(spine);

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.BufferAttribute(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 1, 0]), 3),
  );
  geometry.setAttribute(
    "skinIndex",
    new THREE.BufferAttribute(new Uint16Array(16), 4),
  );
  geometry.setAttribute(
    "skinWeight",
    new THREE.BufferAttribute(new Float32Array(16).fill(0.25), 4),
  );
  geometry.setIndex([0, 1, 2, 1, 3, 2]);

  const body = new THREE.SkinnedMesh(
    geometry,
    new THREE.MeshStandardMaterial({ color: 0xffffff }),
  );
  body.name = "AvatarBody";
  body.add(hips);
  body.bind(new THREE.Skeleton([hips, spine]));

  const accessory = new THREE.Mesh(
    geometry.clone(),
    new THREE.MeshStandardMaterial({ color: 0x00ff00 }),
  );
  accessory.name = "Accessory";

  scene.add(body, accessory);
  return scene;
}

describe("prepareModel", () => {
  it("terminates when building the reveal overlay", () => {
    // The first version added each overlay from inside scene.traverse, so
    // traverse walked into the overlay it had just been handed, gave that one
    // its own overlay, and blew the stack. This is that regression.
    expect(() => prepareModel(makeScene(), true)).not.toThrow();
  });

  it("adds exactly one wireframe overlay per mesh", () => {
    const prepared = prepareModel(makeScene(), true);

    expect(prepared.wireMaterials).toHaveLength(2);

    const overlays: string[] = [];
    prepared.scene!.traverse((object) => {
      if (object.name.endsWith("__wireframe")) overlays.push(object.name);
    });
    expect(overlays).toHaveLength(2);
  });

  it("leaves the total mesh count at twice the original, never more", () => {
    const before: THREE.Mesh[] = [];
    const scene = makeScene();
    scene.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) before.push(o as THREE.Mesh);
    });

    const prepared = prepareModel(scene, true);
    const after: THREE.Mesh[] = [];
    prepared.scene!.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) after.push(o as THREE.Mesh);
    });

    expect(after).toHaveLength(before.length * 2);
  });

  it("adds no overlay at all when the reveal is off", () => {
    const prepared = prepareModel(makeScene(), false);

    expect(prepared.wireMaterials).toHaveLength(0);

    let meshes = 0;
    prepared.scene!.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) meshes++;
    });
    expect(meshes).toBe(2);
  });

  it("parents each overlay beside its mesh, not under it", () => {
    // A child of a skinned mesh inherits a transform the skinning has already
    // applied, which doubles it.
    const prepared = prepareModel(makeScene(), true);

    prepared.scene!.traverse((object) => {
      if (!object.name.endsWith("__wireframe")) return;
      expect((object.parent as THREE.Mesh | null)?.isMesh).not.toBe(true);
    });
  });

  it("binds a skinned overlay to the same skeleton", () => {
    const prepared = prepareModel(makeScene(), true);

    let checked = 0;
    prepared.scene!.traverse((object) => {
      const skinned = object as THREE.SkinnedMesh;
      if (object.name === "AvatarBody__wireframe") {
        expect(skinned.isSkinnedMesh).toBe(true);
        expect(skinned.skeleton.bones).toHaveLength(2);
        checked++;
      }
    });
    expect(checked).toBe(1);
  });

  it("counts vertices, triangles and bones", () => {
    const prepared = prepareModel(makeScene(), true);

    // Two meshes of four vertices and two triangles each.
    expect(prepared.stats.vertices).toBe(8);
    expect(prepared.stats.triangles).toBe(4);
    expect(prepared.stats.bones).toBe(2);
  });

  it("does not count the overlays it just added", () => {
    const withReveal = prepareModel(makeScene(), true);
    const without = prepareModel(makeScene(), false);

    expect(withReveal.stats).toEqual(without.stats);
  });

  it("never mutates the source scene, which the loader caches", () => {
    const scene = makeScene();
    const before: string[] = [];
    scene.traverse((o) => before.push(o.name));

    prepareModel(scene, true);

    const after: string[] = [];
    scene.traverse((o) => after.push(o.name));
    expect(after).toEqual(before);
  });

  it("starts the skin invisible when revealing, and opaque when not", () => {
    expect(prepareModel(makeScene(), true).skinMaterials.every((m) => m.opacity === 0)).toBe(true);
    expect(prepareModel(makeScene(), false).skinMaterials.every((m) => m.opacity === 1)).toBe(true);
  });

  it("collects the model's own materials so they can be faded in", () => {
    const prepared = prepareModel(makeScene(), true);
    expect(prepared.skinMaterials).toHaveLength(2);
    expect(prepared.error).toBeNull();
  });

  it("handles a scene with no meshes", () => {
    const prepared = prepareModel(new THREE.Group(), true);

    expect(prepared.error).toBeNull();
    expect(prepared.stats).toEqual({ vertices: 0, triangles: 0, bones: 0 });
    expect(prepared.wireMaterials).toHaveLength(0);
  });

  it("counts triangles for a mesh with no index buffer", () => {
    const scene = new THREE.Group();
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.BufferAttribute(new Float32Array(9), 3),
    );
    scene.add(new THREE.Mesh(geometry, new THREE.MeshStandardMaterial()));

    expect(prepareModel(scene, false).stats.triangles).toBe(1);
  });
});
