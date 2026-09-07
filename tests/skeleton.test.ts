import { describe, it, expect } from "vitest";
import { buildSkeleton, MIXAMO_BONES, boneIndexByName } from "@/lib/avatar-engine/geometry/skeleton";
import { bodyParamsSchema, defaultBodyParams } from "@/lib/avatar-engine/params";
import { transformPoint } from "@/lib/avatar-engine/geometry/math";

describe("MIXAMO_BONES", () => {
  it("uses the mixamorig prefix on every bone, which is what Mixamo matches on", () => {
    for (const bone of MIXAMO_BONES) {
      expect(bone.name.startsWith("mixamorig:")).toBe(true);
    }
  });

  it("includes the bones Mixamo requires for a humanoid rig", () => {
    const names = MIXAMO_BONES.map((b) => b.name);
    for (const required of [
      "mixamorig:Hips",
      "mixamorig:Spine",
      "mixamorig:Spine1",
      "mixamorig:Spine2",
      "mixamorig:Neck",
      "mixamorig:Head",
      "mixamorig:LeftArm",
      "mixamorig:LeftForeArm",
      "mixamorig:LeftHand",
      "mixamorig:RightArm",
      "mixamorig:RightForeArm",
      "mixamorig:RightHand",
      "mixamorig:LeftUpLeg",
      "mixamorig:LeftLeg",
      "mixamorig:LeftFoot",
      "mixamorig:RightUpLeg",
      "mixamorig:RightLeg",
      "mixamorig:RightFoot",
    ]) {
      expect(names).toContain(required);
    }
  });

  it("has exactly one root", () => {
    expect(MIXAMO_BONES.filter((b) => b.parent === -1)).toHaveLength(1);
    expect(MIXAMO_BONES[0].name).toBe("mixamorig:Hips");
  });

  it("lists every parent before its children, so world transforms need one pass", () => {
    MIXAMO_BONES.forEach((bone, index) => {
      expect(bone.parent).toBeLessThan(index);
    });
  });

  it("has no duplicate bone names", () => {
    const names = MIXAMO_BONES.map((b) => b.name);
    expect(new Set(names).size).toBe(names.length);
  });
});

describe("buildSkeleton", () => {
  it("produces a skeleton exactly as tall as the requested height", () => {
    for (const heightCm of [140, 160, 175, 190, 210]) {
      const skeleton = buildSkeleton(bodyParamsSchema.parse({ heightCm }));
      const top = skeleton.bones[boneIndexByName("mixamorig:HeadTop_End")];
      expect(top.worldPosition[1]).toBeCloseTo(heightCm / 100, 4);
    }
  });

  it("keeps total height fixed as leg length is redistributed", () => {
    for (const legLength of [0, 0.25, 0.5, 0.75, 1]) {
      const skeleton = buildSkeleton(bodyParamsSchema.parse({ heightCm: 175, legLength }));
      const top = skeleton.bones[boneIndexByName("mixamorig:HeadTop_End")];
      expect(top.worldPosition[1]).toBeCloseTo(1.75, 4);
    }
  });

  it("raises the hips when legs are made longer", () => {
    const short = buildSkeleton(bodyParamsSchema.parse({ legLength: 0 }));
    const long = buildSkeleton(bodyParamsSchema.parse({ legLength: 1 }));

    expect(long.bones[0].worldPosition[1]).toBeGreaterThan(short.bones[0].worldPosition[1]);
  });

  it("mirrors the left and right sides across the YZ plane", () => {
    const skeleton = buildSkeleton(defaultBodyParams());

    for (const [leftName, rightName] of [
      ["mixamorig:LeftArm", "mixamorig:RightArm"],
      ["mixamorig:LeftHand", "mixamorig:RightHand"],
      ["mixamorig:LeftUpLeg", "mixamorig:RightUpLeg"],
      ["mixamorig:LeftFoot", "mixamorig:RightFoot"],
    ]) {
      const left = skeleton.bones[boneIndexByName(leftName)].worldPosition;
      const right = skeleton.bones[boneIndexByName(rightName)].worldPosition;

      expect(left[0]).toBeCloseTo(-right[0], 6);
      expect(left[1]).toBeCloseTo(right[1], 6);
      expect(left[2]).toBeCloseTo(right[2], 6);
    }
  });

  it("widens the shoulders as the slider increases", () => {
    const narrow = buildSkeleton(bodyParamsSchema.parse({ shoulderWidth: 0 }));
    const wide = buildSkeleton(bodyParamsSchema.parse({ shoulderWidth: 1 }));
    const i = boneIndexByName("mixamorig:LeftArm");

    expect(wide.bones[i].worldPosition[0]).toBeGreaterThan(narrow.bones[i].worldPosition[0]);
  });

  it("lengthens the arms as the slider increases", () => {
    const reach = (t: number) => {
      const s = buildSkeleton(bodyParamsSchema.parse({ armLength: t }));
      return s.bones[boneIndexByName("mixamorig:LeftHand")].worldPosition[0];
    };
    expect(reach(1)).toBeGreaterThan(reach(0));
  });

  it("stands on the ground: the lowest joint sits at or just above y=0", () => {
    const skeleton = buildSkeleton(defaultBodyParams());
    const lowest = Math.min(...skeleton.bones.map((b) => b.worldPosition[1]));

    // The leg chain is scaled to land exactly on the floor, so allow only
    // floating-point noise below zero.
    expect(lowest).toBeGreaterThan(-1e-6);
    expect(lowest).toBeLessThan(0.05);
  });

  it("gives an inverse bind matrix per bone that undoes its world transform", () => {
    const skeleton = buildSkeleton(defaultBodyParams());
    expect(skeleton.inverseBindMatrices).toHaveLength(skeleton.bones.length * 16);

    skeleton.bones.forEach((bone, i) => {
      const ibm = skeleton.inverseBindMatrices.subarray(i * 16, i * 16 + 16);
      const origin = transformPoint(ibm, bone.worldPosition);
      expect(origin[0]).toBeCloseTo(0, 5);
      expect(origin[1]).toBeCloseTo(0, 5);
      expect(origin[2]).toBeCloseTo(0, 5);
    });
  });

  it("is a T-pose: both arms are horizontal and level with the shoulders", () => {
    const skeleton = buildSkeleton(defaultBodyParams());
    const arm = skeleton.bones[boneIndexByName("mixamorig:LeftArm")].worldPosition;
    const hand = skeleton.bones[boneIndexByName("mixamorig:LeftHand")].worldPosition;

    expect(hand[1]).toBeCloseTo(arm[1], 5);
    expect(hand[0]).toBeGreaterThan(arm[0]);
  });
});

describe("boneIndexByName", () => {
  it("resolves a known bone", () => {
    expect(boneIndexByName("mixamorig:Hips")).toBe(0);
  });

  it("throws on an unknown bone rather than returning -1 that silently indexes wrong", () => {
    expect(() => boneIndexByName("mixamorig:Tail")).toThrow(/unknown bone/i);
  });
});
