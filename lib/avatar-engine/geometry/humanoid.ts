/**
 * Assembles the avatar body mesh from the skeleton and the body parameters.
 *
 * The mesh is built directly around the posed skeleton rather than being a
 * fixed model that gets scaled: every ring centre is derived from a joint
 * position, so when the skeleton changes shape the surface follows it and the
 * skin weights stay meaningful.
 *
 * The figure faces +Z, which is the direction the editor camera looks from and
 * the orientation Blender and Mixamo expect for a T-posed character.
 */

import { lerp, remap, type Vec3 } from "./math";
import {
  ATLAS,
  buildEllipsoid,
  buildTube,
  MeshAccumulator,
  type Ring,
  type SkinnedMesh,
} from "./mesh";
import { boneIndexByName, type Skeleton } from "./skeleton";
import { computeSkinWeights } from "./skinning";
import type { BodyParams, FaceParams } from "../params";

export interface HumanoidMesh extends SkinnedMesh {
  /** Head centre and radii, so the texture pipeline can frame the face. */
  head: { center: Vec3; radii: Vec3 };
}

const TORSO_SEGMENTS = 20;
const LIMB_SEGMENTS = 12;
const HEAD_RADIAL = 28;
const HEAD_ROWS = 20;

/** Blends between a slim and a heavy figure for one circumference slider. */
function girth(base: number, slider: number, build: number, muscle: number): number {
  const fromBuild = remap(build, 0.82, 1.35);
  const fromSlider = remap(slider, 0.84, 1.22);
  const fromMuscle = remap(muscle, 0.94, 1.1);
  return base * fromBuild * fromSlider * fromMuscle;
}

function pos(skeleton: Skeleton, name: string): Vec3 {
  return skeleton.bones[boneIndexByName(name)].worldPosition;
}

export function buildHumanoid(
  body: BodyParams,
  _face: FaceParams,
  skeleton: Skeleton,
): HumanoidMesh {
  const mesh = new MeshAccumulator();
  const h = skeleton.height;

  buildTorso(mesh, body, skeleton, h);
  const head = buildHead(mesh, body, skeleton);
  buildArm(mesh, body, skeleton, h, "Left");
  buildArm(mesh, body, skeleton, h, "Right");
  buildLeg(mesh, body, skeleton, h, "Left");
  buildLeg(mesh, body, skeleton, h, "Right");

  const positions = new Float32Array(mesh.positions);
  const { joints, weights } = computeSkinWeights(positions, mesh.parts, skeleton);

  return {
    positions,
    normals: new Float32Array(mesh.normals),
    uvs: new Float32Array(mesh.uvs),
    joints,
    weights,
    indices: new Uint32Array(mesh.indices),
    parts: mesh.parts,
    head,
  };
}

// ---------------------------------------------------------------------------
// Torso
// ---------------------------------------------------------------------------

function buildTorso(mesh: MeshAccumulator, body: BodyParams, skeleton: Skeleton, h: number): void {
  const hips = pos(skeleton, "mixamorig:Hips");
  const spine = pos(skeleton, "mixamorig:Spine");
  const spine1 = pos(skeleton, "mixamorig:Spine1");
  const spine2 = pos(skeleton, "mixamorig:Spine2");
  const neck = pos(skeleton, "mixamorig:Neck");

  const hipW = girth(0.098 * h, body.hips, body.build, body.muscle);
  const waistW = girth(0.082 * h, body.waist, body.build, body.muscle);
  const chestW = girth(0.104 * h, body.chest, body.build, body.muscle);
  const shoulderW = girth(0.116 * h, body.shoulderWidth, body.build, body.muscle * 0.6);
  const neckW = girth(0.032 * h, 0.5, body.build * 0.5, body.muscle);

  // A torso is deeper than it is wide at the hips and flatter at the chest.
  // Without that ratio changing down the body it reads as a plain cylinder.
  const depth = (w: number, ratio: number) => w * ratio;

  const rings: Ring[] = [
    // Just below the hip joint, so the legs have something to emerge from.
    { center: [0, hips[1] - 0.045 * h, 0], radiusU: hipW * 0.84, radiusV: depth(hipW, 0.8), t: 0 },
    { center: [0, hips[1], 0], radiusU: hipW, radiusV: depth(hipW, 0.82), t: 0.12 },
    { center: [0, spine[1], 0], radiusU: waistW, radiusV: depth(waistW, 0.76), t: 0.3 },
    { center: [0, spine1[1], 0], radiusU: chestW * 0.95, radiusV: depth(chestW, 0.73), t: 0.5 },
    { center: [0, spine2[1], 0], radiusU: chestW, radiusV: depth(chestW, 0.7), t: 0.68 },
    {
      center: [0, lerp(spine2[1], neck[1], 0.6), 0],
      radiusU: shoulderW,
      radiusV: depth(shoulderW, 0.6),
      t: 0.84,
    },
    { center: [0, neck[1], 0], radiusU: neckW * 1.6, radiusV: depth(neckW * 1.6, 0.92), t: 0.94 },
  ];

  const torso = buildTube(rings, {
    radialSegments: TORSO_SEGMENTS,
    region: ATLAS.body,
    capStart: true,
  });

  mesh.addPart(
    "torso",
    [
      "mixamorig:Hips",
      "mixamorig:Spine",
      "mixamorig:Spine1",
      "mixamorig:Spine2",
      "mixamorig:LeftShoulder",
      "mixamorig:RightShoulder",
    ],
    torso.vertices,
    torso.triangles,
  );

  // Neck, from the shoulders up into the base of the skull.
  const headJoint = pos(skeleton, "mixamorig:Head");
  const neckTube = buildTube(
    [
      { center: [0, neck[1] - 0.02 * h, 0], radiusU: neckW * 1.25, radiusV: neckW * 1.2, t: 0 },
      { center: [0, headJoint[1] + 0.01 * h, 0], radiusU: neckW, radiusV: neckW * 0.95, t: 1 },
    ],
    { radialSegments: TORSO_SEGMENTS, region: ATLAS.body },
  );

  mesh.addPart(
    "neck",
    ["mixamorig:Spine2", "mixamorig:Neck", "mixamorig:Head"],
    neckTube.vertices,
    neckTube.triangles,
  );
}

// ---------------------------------------------------------------------------
// Head
// ---------------------------------------------------------------------------

function buildHead(
  mesh: MeshAccumulator,
  body: BodyParams,
  skeleton: Skeleton,
): { center: Vec3; radii: Vec3 } {
  const headJoint = pos(skeleton, "mixamorig:Head");
  const crown = pos(skeleton, "mixamorig:HeadTop_End");

  // Size the skull so its crown lands exactly on the HeadTop_End joint. That is
  // what keeps the mesh's total height equal to the requested body height, so
  // the head-size slider changes the head without making the height slider lie.
  const sizeScale = remap(body.headSize, 0.9, 1.1);
  const halfHeight = ((crown[1] - headJoint[1]) / 1.42) * sizeScale;
  const center: Vec3 = [0, crown[1] - halfHeight, 0];
  const radii: Vec3 = [halfHeight * 0.78, halfHeight, halfHeight * 0.86];

  const headMesh = buildEllipsoid({
    center,
    radii,
    radialSegments: HEAD_RADIAL,
    heightSegments: HEAD_ROWS,
    region: ATLAS.head,
    // The ellipsoid already puts theta=0, which faces +Z, at the middle of the
    // strip, so the face lands centred with no offset.
    uOffset: 0,
  });

  mesh.addPart("head", ["mixamorig:Head", "mixamorig:Neck"], headMesh.vertices, headMesh.triangles);

  return { center, radii };
}

// ---------------------------------------------------------------------------
// Arms
// ---------------------------------------------------------------------------

function buildArm(
  mesh: MeshAccumulator,
  body: BodyParams,
  skeleton: Skeleton,
  h: number,
  side: "Left" | "Right",
): void {
  const shoulder = pos(skeleton, `mixamorig:${side}Shoulder`);
  const arm = pos(skeleton, `mixamorig:${side}Arm`);
  const foreArm = pos(skeleton, `mixamorig:${side}ForeArm`);
  const hand = pos(skeleton, `mixamorig:${side}Hand`);

  const upper = girth(0.044 * h, body.muscle, body.build, body.muscle);
  const elbow = girth(0.034 * h, body.muscle, body.build, body.muscle);
  const wrist = girth(0.024 * h, 0.4, body.build * 0.6, body.muscle * 0.5);

  // Arms run along X in a T-pose, so the rings stack along X.
  const at = (x: number, r: number, t: number): Ring => ({
    center: [x, arm[1], 0],
    radiusU: r,
    radiusV: r,
    t,
  });

  const armTube = buildTube(
    [
      at(lerp(shoulder[0], arm[0], 0.35), upper * 1.2, 0),
      at(arm[0], upper, 0.18),
      at(lerp(arm[0], foreArm[0], 0.62), elbow * 1.06, 0.45),
      at(foreArm[0], elbow, 0.6),
      at(lerp(foreArm[0], hand[0], 0.88), wrist, 0.88),
    ],
    { radialSegments: LIMB_SEGMENTS, region: ATLAS.body, axis: "x" },
  );

  mesh.addPart(
    `${side.toLowerCase()}Arm`,
    [`mixamorig:${side}Shoulder`, `mixamorig:${side}Arm`, `mixamorig:${side}ForeArm`],
    armTube.vertices,
    armTube.triangles,
  );

  // Hand: a flattened blob, not fingers. At this polygon budget fingers read as
  // noise, and we do not export finger bones for Mixamo to drive anyway.
  const handLength = Math.abs(hand[0] - foreArm[0]) * 0.42;
  const direction = side === "Left" ? 1 : -1;
  const handMesh = buildEllipsoid({
    center: [hand[0] + direction * handLength * 0.5, hand[1], 0],
    radii: [handLength, wrist * 1.5, wrist * 0.75],
    radialSegments: 12,
    heightSegments: 8,
    region: ATLAS.body,
  });

  mesh.addPart(
    `${side.toLowerCase()}Hand`,
    [`mixamorig:${side}Hand`, `mixamorig:${side}ForeArm`],
    handMesh.vertices,
    handMesh.triangles,
  );
}

// ---------------------------------------------------------------------------
// Legs and feet
// ---------------------------------------------------------------------------

function buildLeg(
  mesh: MeshAccumulator,
  body: BodyParams,
  skeleton: Skeleton,
  h: number,
  side: "Left" | "Right",
): void {
  const upLeg = pos(skeleton, `mixamorig:${side}UpLeg`);
  const knee = pos(skeleton, `mixamorig:${side}Leg`);
  const ankle = pos(skeleton, `mixamorig:${side}Foot`);
  const toe = pos(skeleton, `mixamorig:${side}ToeBase`);

  const thigh = girth(0.064 * h, body.hips, body.build, body.muscle);
  const kneeW = girth(0.042 * h, 0.45, body.build * 0.7, body.muscle * 0.6);
  const calf = girth(0.047 * h, body.muscle, body.build, body.muscle);
  const ankleW = girth(0.027 * h, 0.35, body.build * 0.5, body.muscle * 0.4);

  const x = upLeg[0];

  // Rings run bottom-up so t increases with height, matching every other part.
  const legTube = buildTube(
    [
      { center: [x, ankle[1], 0], radiusU: ankleW, radiusV: ankleW, t: 0 },
      { center: [x, lerp(ankle[1], knee[1], 0.62), 0], radiusU: calf, radiusV: calf * 1.06, t: 0.32 },
      { center: [x, knee[1], 0], radiusU: kneeW, radiusV: kneeW, t: 0.5 },
      { center: [x, lerp(knee[1], upLeg[1], 0.55), 0], radiusU: thigh * 0.9, radiusV: thigh * 0.88, t: 0.75 },
      { center: [x, upLeg[1] + 0.025 * h, 0], radiusU: thigh, radiusV: thigh * 0.96, t: 1 },
    ],
    { radialSegments: LIMB_SEGMENTS, region: ATLAS.body },
  );

  mesh.addPart(
    `${side.toLowerCase()}Leg`,
    [`mixamorig:${side}UpLeg`, `mixamorig:${side}Leg`, `mixamorig:${side}Foot`, "mixamorig:Hips"],
    legTube.vertices,
    legTube.triangles,
  );

  // Foot: rings stacked along Z, from the heel forward to the toe. Stacking
  // them along Y, as an earlier version did, collapses the foot into a flat
  // sliver because a foot barely varies in height along its length.
  const heelZ = -0.036 * h;
  const toeZ = toe[2] + 0.052 * h;
  const instep = ankle[1] * 0.62;

  const footTube = buildTube(
    [
      { center: [x, instep * 0.86, heelZ], radiusU: instep * 0.86, radiusV: ankleW * 0.95, t: 0 },
      { center: [x, instep, 0], radiusU: instep, radiusV: ankleW * 1.14, t: 0.3 },
      { center: [x, instep * 0.8, toeZ * 0.55], radiusU: instep * 0.8, radiusV: ankleW * 1.2, t: 0.7 },
      { center: [x, instep * 0.5, toeZ], radiusU: instep * 0.5, radiusV: ankleW * 0.98, t: 1 },
    ],
    {
      radialSegments: LIMB_SEGMENTS,
      region: ATLAS.body,
      axis: "z",
      capStart: true,
      capEnd: true,
    },
  );

  mesh.addPart(
    `${side.toLowerCase()}Foot`,
    [`mixamorig:${side}Foot`, `mixamorig:${side}ToeBase`, `mixamorig:${side}Leg`],
    footTube.vertices,
    footTube.triangles,
  );
}
