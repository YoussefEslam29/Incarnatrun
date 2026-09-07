/**
 * The built-in wardrobe.
 *
 * Garments are generated around the same skeleton as the body, using the same
 * tube primitives, and bound to the same bones. That means clothing exports as
 * extra primitives on one skinned mesh: a Mixamo animation moves the avatar and
 * its clothes together, with no separate cloth rig and no re-skinning step.
 *
 * Every garment is addressed as {meshRef, textureRef}. A template supplies the
 * meshRef from this registry; an uploaded 3D file supplies a storage key
 * instead. That indirection is the requirement from PLAN/idea.md section 6 and is
 * what lets Phase 2 AI garment reconstruction slot in with no refactor.
 */

import { lerp, type Vec3 } from "../avatar-engine/geometry/math";
import {
  buildEllipsoid,
  buildTube,
  MeshAccumulator,
  type Ring,
  type SkinnedMesh,
} from "../avatar-engine/geometry/mesh";
import { boneIndexByName, type Skeleton } from "../avatar-engine/geometry/skeleton";
import { computeSkinWeights } from "../avatar-engine/geometry/skinning";
import type { BodyParams, GarmentSlotId } from "../avatar-engine/params";

/**
 * Garments use the whole texture, with the front of the body at u = 0.5.
 *
 * That matters for photo-as-texture uploads: the middle of the user's photo
 * lands on the chest, which is where they expect the print on their shirt to be.
 */
const GARMENT_REGION = { u0: 0, u1: 1, v0: 0, v1: 1 } as const;

/** How far a garment floats off the skin, as a fraction of body height. */
const CLEARANCE = 0.004;

export interface GarmentBuildContext {
  body: BodyParams;
  skeleton: Skeleton;
}

export interface GarmentTemplate {
  id: string;
  label: string;
  slot: GarmentSlotId;
  /** Default tint when the garment has no texture. */
  defaultColor: string;
  build: (ctx: GarmentBuildContext) => SkinnedMesh;
}

function pos(skeleton: Skeleton, name: string): Vec3 {
  return skeleton.bones[boneIndexByName(name)].worldPosition;
}

/** Finishes an accumulator into a skinned mesh bound to the skeleton. */
function finish(mesh: MeshAccumulator, skeleton: Skeleton): SkinnedMesh {
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
  };
}

// ---------------------------------------------------------------------------
// Tops
// ---------------------------------------------------------------------------

interface TopOptions {
  /** How far down the hips the garment reaches, 0..1. */
  length: number;
  /** 0 = no sleeve, 1 = full length. */
  sleeve: number;
  /** Extra clearance, for loose garments like a hoodie. */
  looseness: number;
  hood?: boolean;
}

function buildTop(ctx: GarmentBuildContext, options: TopOptions): SkinnedMesh {
  const { body, skeleton } = ctx;
  const h = skeleton.height;
  const mesh = new MeshAccumulator();
  const gap = h * (CLEARANCE + options.looseness);

  const hips = pos(skeleton, "mixamorig:Hips");
  const spine = pos(skeleton, "mixamorig:Spine");
  const spine1 = pos(skeleton, "mixamorig:Spine1");
  const spine2 = pos(skeleton, "mixamorig:Spine2");
  const neck = pos(skeleton, "mixamorig:Neck");

  // Mirrors the torso rings, pushed outward by the clearance.
  const g = (base: number, slider: number) =>
    base * h * lerp(0.86, 1.3, body.build) * lerp(0.88, 1.18, slider) + gap;

  const hem = lerp(hips[1] - 0.02 * h, hips[1] - 0.075 * h, options.length);

  const rings: Ring[] = [
    { center: [0, hem, 0], radiusU: g(0.1, body.hips), radiusV: g(0.1, body.hips) * 0.8, t: 0 },
    { center: [0, spine[1], 0], radiusU: g(0.088, body.waist), radiusV: g(0.088, body.waist) * 0.78, t: 0.32 },
    { center: [0, spine1[1], 0], radiusU: g(0.106, body.chest), radiusV: g(0.106, body.chest) * 0.74, t: 0.58 },
    { center: [0, spine2[1], 0], radiusU: g(0.108, body.chest), radiusV: g(0.108, body.chest) * 0.72, t: 0.76 },
    {
      center: [0, lerp(spine2[1], neck[1], 0.62), 0],
      radiusU: g(0.118, body.shoulderWidth),
      radiusV: g(0.118, body.shoulderWidth) * 0.62,
      t: 0.9,
    },
    { center: [0, neck[1] + 0.006 * h, 0], radiusU: g(0.05, 0.5), radiusV: g(0.05, 0.5) * 0.9, t: 1 },
  ];

  const torso = buildTube(rings, { radialSegments: 22, region: GARMENT_REGION });
  mesh.addPart(
    "topTorso",
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

  if (options.sleeve > 0.02) {
    for (const side of ["Left", "Right"] as const) {
      const shoulder = pos(skeleton, `mixamorig:${side}Shoulder`);
      const arm = pos(skeleton, `mixamorig:${side}Arm`);
      const hand = pos(skeleton, `mixamorig:${side}Hand`);

      const reach = lerp(arm[0], hand[0], options.sleeve);
      const upper = 0.046 * h * lerp(0.9, 1.2, body.muscle) + gap;
      const cuff = lerp(upper, 0.028 * h + gap, options.sleeve);

      const sleeve = buildTube(
        [
          {
            center: [lerp(shoulder[0], arm[0], 0.2), arm[1], 0],
            radiusU: upper * 1.16,
            radiusV: upper * 1.16,
            t: 0,
          },
          { center: [arm[0], arm[1], 0], radiusU: upper, radiusV: upper, t: 0.3 },
          { center: [lerp(arm[0], reach, 0.6), arm[1], 0], radiusU: lerp(upper, cuff, 0.6), radiusV: lerp(upper, cuff, 0.6), t: 0.7 },
          { center: [reach, arm[1], 0], radiusU: cuff, radiusV: cuff, t: 1 },
        ],
        { radialSegments: 14, region: GARMENT_REGION, axis: "x", capEnd: true },
      );

      mesh.addPart(
        `${side.toLowerCase()}Sleeve`,
        [`mixamorig:${side}Shoulder`, `mixamorig:${side}Arm`, `mixamorig:${side}ForeArm`],
        sleeve.vertices,
        sleeve.triangles,
      );
    }
  }

  if (options.hood) {
    // A hood that is down, resting as a cowl behind the neck. Modelling it up
    // over the head would bury the face the product exists to show, and would
    // have to be a half-shell rather than a closed surface to avoid it.
    const shoulderR = g(0.118, body.shoulderWidth);

    const hood = buildEllipsoid({
      center: [0, neck[1] - 0.012 * h, -shoulderR * 0.52],
      radii: [shoulderR * 0.62, 0.052 * h, 0.042 * h],
      radialSegments: 18,
      heightSegments: 12,
      region: GARMENT_REGION,
    });

    mesh.addPart("hood", ["mixamorig:Neck", "mixamorig:Spine2"], hood.vertices, hood.triangles);
  }

  return finish(mesh, skeleton);
}

// ---------------------------------------------------------------------------
// Bottoms
// ---------------------------------------------------------------------------

/** 0..1 of the way from hip to ankle that the leg opening sits at. */
function buildBottom(ctx: GarmentBuildContext, length: number, looseness: number): SkinnedMesh {
  const { body, skeleton } = ctx;
  const h = skeleton.height;
  const mesh = new MeshAccumulator();
  const gap = h * (CLEARANCE + looseness);

  const hips = pos(skeleton, "mixamorig:Hips");
  const spine = pos(skeleton, "mixamorig:Spine");

  const waistR = 0.086 * h * lerp(0.88, 1.3, body.build) * lerp(0.9, 1.16, body.waist) + gap;
  const hipR = 0.1 * h * lerp(0.88, 1.3, body.build) * lerp(0.9, 1.16, body.hips) + gap;

  const waistband = buildTube(
    [
      { center: [0, hips[1] - 0.055 * h, 0], radiusU: hipR, radiusV: hipR * 0.82, t: 0 },
      { center: [0, hips[1], 0], radiusU: hipR, radiusV: hipR * 0.82, t: 0.5 },
      { center: [0, lerp(hips[1], spine[1], 0.5), 0], radiusU: waistR, radiusV: waistR * 0.8, t: 1 },
    ],
    { radialSegments: 20, region: GARMENT_REGION },
  );

  mesh.addPart(
    "waistband",
    ["mixamorig:Hips", "mixamorig:Spine", "mixamorig:LeftUpLeg", "mixamorig:RightUpLeg"],
    waistband.vertices,
    waistband.triangles,
  );

  for (const side of ["Left", "Right"] as const) {
    const upLeg = pos(skeleton, `mixamorig:${side}UpLeg`);
    const knee = pos(skeleton, `mixamorig:${side}Leg`);
    const ankle = pos(skeleton, `mixamorig:${side}Foot`);

    const thighR = 0.066 * h * lerp(0.88, 1.3, body.build) * lerp(0.92, 1.14, body.hips) + gap;
    const kneeR = 0.046 * h * lerp(0.9, 1.2, body.build) + gap;
    const openTo = lerp(upLeg[1] - (upLeg[1] - knee[1]) * 0.55, ankle[1] + 0.012 * h, length);
    const openR = lerp(thighR * 0.94, kneeR * 0.92, length);

    const leg = buildTube(
      [
        { center: [upLeg[0], openTo, 0], radiusU: openR, radiusV: openR, t: 0 },
        { center: [upLeg[0], lerp(openTo, upLeg[1], 0.55), 0], radiusU: lerp(openR, thighR, 0.7), radiusV: lerp(openR, thighR, 0.7), t: 0.55 },
        { center: [upLeg[0], upLeg[1] - 0.01 * h, 0], radiusU: thighR, radiusV: thighR * 0.98, t: 1 },
      ],
      { radialSegments: 14, region: GARMENT_REGION, capStart: true },
    );

    mesh.addPart(
      `${side.toLowerCase()}Trouser`,
      [`mixamorig:${side}UpLeg`, `mixamorig:${side}Leg`, "mixamorig:Hips"],
      leg.vertices,
      leg.triangles,
    );
  }

  return finish(mesh, skeleton);
}

// ---------------------------------------------------------------------------
// Shoes
// ---------------------------------------------------------------------------

function buildShoes(ctx: GarmentBuildContext, ankleHeight: number): SkinnedMesh {
  const { body, skeleton } = ctx;
  const h = skeleton.height;
  const mesh = new MeshAccumulator();
  const gap = h * 0.006;

  for (const side of ["Left", "Right"] as const) {
    const upLeg = pos(skeleton, `mixamorig:${side}UpLeg`);
    const ankle = pos(skeleton, `mixamorig:${side}Foot`);
    const toe = pos(skeleton, `mixamorig:${side}ToeBase`);

    const width = 0.028 * h * lerp(0.92, 1.12, body.build) + gap;
    const instep = ankle[1] * 0.62 + gap;
    const heelZ = -0.042 * h;
    const toeZ = toe[2] + 0.06 * h;

    const shoe = buildTube(
      [
        { center: [upLeg[0], instep * 0.9, heelZ], radiusU: instep * 0.9, radiusV: width, t: 0 },
        { center: [upLeg[0], instep * 1.05, -0.01 * h], radiusU: instep * 1.05, radiusV: width * 1.16, t: 0.28 },
        { center: [upLeg[0], instep * 0.86, toeZ * 0.58], radiusU: instep * 0.86, radiusV: width * 1.22, t: 0.7 },
        { center: [upLeg[0], instep * 0.52, toeZ], radiusU: instep * 0.52, radiusV: width * 0.98, t: 1 },
      ],
      { radialSegments: 14, region: GARMENT_REGION, axis: "z", capStart: true, capEnd: true },
    );

    mesh.addPart(
      `${side.toLowerCase()}Shoe`,
      [`mixamorig:${side}Foot`, `mixamorig:${side}ToeBase`],
      shoe.vertices,
      shoe.triangles,
    );

    if (ankleHeight > 0.02) {
      const collar = buildTube(
        [
          { center: [upLeg[0], instep * 1.1, -0.006 * h], radiusU: width * 1.35, radiusV: width * 1.5, t: 0 },
          {
            center: [upLeg[0], instep * 1.1 + ankleHeight * h, -0.006 * h],
            radiusU: width * 1.2,
            radiusV: width * 1.32,
            t: 1,
          },
        ],
        { radialSegments: 14, region: GARMENT_REGION, capEnd: true },
      );

      mesh.addPart(
        `${side.toLowerCase()}ShoeCollar`,
        [`mixamorig:${side}Foot`, `mixamorig:${side}Leg`],
        collar.vertices,
        collar.triangles,
      );
    }
  }

  return finish(mesh, skeleton);
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

export const GARMENT_TEMPLATES: GarmentTemplate[] = [
  {
    id: "crew-tee",
    label: "Crew T-shirt",
    slot: "TOP",
    defaultColor: "#e5e7eb",
    build: (ctx) => buildTop(ctx, { length: 0.45, sleeve: 0.3, looseness: 0.003 }),
  },
  {
    id: "long-sleeve",
    label: "Long-sleeve tee",
    slot: "TOP",
    defaultColor: "#334155",
    build: (ctx) => buildTop(ctx, { length: 0.5, sleeve: 0.94, looseness: 0.003 }),
  },
  {
    id: "hoodie",
    label: "Hoodie",
    slot: "TOP",
    defaultColor: "#4c1d95",
    build: (ctx) => buildTop(ctx, { length: 0.75, sleeve: 0.96, looseness: 0.008, hood: true }),
  },
  {
    id: "tank-top",
    label: "Tank top",
    slot: "TOP",
    defaultColor: "#f1f5f9",
    build: (ctx) => buildTop(ctx, { length: 0.4, sleeve: 0, looseness: 0.002 }),
  },
  {
    id: "jeans",
    label: "Jeans",
    slot: "BOTTOM",
    defaultColor: "#1e3a5f",
    build: (ctx) => buildBottom(ctx, 1, 0.004),
  },
  {
    id: "joggers",
    label: "Joggers",
    slot: "BOTTOM",
    defaultColor: "#374151",
    build: (ctx) => buildBottom(ctx, 0.95, 0.008),
  },
  {
    id: "shorts",
    label: "Shorts",
    slot: "BOTTOM",
    defaultColor: "#0f766e",
    build: (ctx) => buildBottom(ctx, 0.18, 0.007),
  },
  {
    id: "sneakers",
    label: "Sneakers",
    slot: "SHOES",
    defaultColor: "#f8fafc",
    build: (ctx) => buildShoes(ctx, 0.012),
  },
  {
    id: "boots",
    label: "Boots",
    slot: "SHOES",
    defaultColor: "#3f2a1d",
    build: (ctx) => buildShoes(ctx, 0.055),
  },
];

const BY_ID = new Map(GARMENT_TEMPLATES.map((t) => [t.id, t]));

export function garmentTemplate(id: string): GarmentTemplate | undefined {
  return BY_ID.get(id);
}

export function templatesForSlot(slot: GarmentSlotId): GarmentTemplate[] {
  return GARMENT_TEMPLATES.filter((t) => t.slot === slot);
}
