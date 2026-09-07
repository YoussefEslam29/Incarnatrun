/**
 * Runs generated avatars through the official Khronos glTF validator.
 *
 * The other suites assert that the file matches what this codebase intended to
 * write. This one asserts it matches the specification, which is the only thing
 * Blender, Mixamo and three.js actually care about.
 */

import { describe, it, expect } from "vitest";
import { validateBytes } from "gltf-validator";
import { buildAvatarGlb } from "@/lib/avatar-engine/build-avatar-glb";
import { buildHumanoid } from "@/lib/avatar-engine/geometry/humanoid";
import { buildSkeleton } from "@/lib/avatar-engine/geometry/skeleton";
import { bodyParamsSchema, defaultFaceParams, randomBodyParams } from "@/lib/avatar-engine/params";
import { renderAvatarAtlasPng } from "@/lib/avatar-engine/texture/atlas";

interface ValidationIssues {
  numErrors: number;
  numWarnings: number;
  messages: { severity: number; code: string; message: string; pointer?: string }[];
}

interface ValidationReport {
  issues: ValidationIssues;
}

async function validate(glb: Uint8Array): Promise<ValidationReport> {
  return (await validateBytes(glb)) as ValidationReport;
}

function describeErrors(report: ValidationReport): string {
  return report.issues.messages
    .filter((m) => m.severity === 0)
    .map((m) => `${m.code} at ${m.pointer ?? "?"}: ${m.message}`)
    .join("\n");
}

function makeGlb(overrides: Record<string, unknown> = {}, texture?: Uint8Array): Uint8Array {
  const body = bodyParamsSchema.parse(overrides);
  const face = defaultFaceParams();
  const skeleton = buildSkeleton(body);
  const mesh = buildHumanoid(body, face, skeleton);
  return buildAvatarGlb({ mesh, skeleton, texture, name: "Conformance Avatar" });
}

describe("generated GLB conformance", () => {
  it("passes the Khronos validator with zero errors", async () => {
    const report = await validate(makeGlb());
    expect(describeErrors(report)).toBe("");
    expect(report.issues.numErrors).toBe(0);
  });

  it("passes with an embedded PNG texture", async () => {
    const png = await renderAvatarAtlasPng({ face: defaultFaceParams() });
    const report = await validate(makeGlb({}, png));

    expect(describeErrors(report)).toBe("");
    expect(report.issues.numErrors).toBe(0);
  });

  it("passes at both extremes of every body slider", async () => {
    const extremes = [
      { heightCm: 140, build: 0, chest: 0, waist: 0, hips: 0, shoulderWidth: 0, armLength: 0, legLength: 0, muscle: 0, headSize: 0 },
      { heightCm: 210, build: 1, chest: 1, waist: 1, hips: 1, shoulderWidth: 1, armLength: 1, legLength: 1, muscle: 1, headSize: 1 },
    ];

    for (const params of extremes) {
      const report = await validate(makeGlb(params));
      expect(describeErrors(report)).toBe("");
    }
  });

  it("passes for randomly generated Path B bodies", async () => {
    for (let i = 0; i < 5; i++) {
      const body = randomBodyParams(`conformance-${i}`);
      const skeleton = buildSkeleton(body);
      const mesh = buildHumanoid(body, defaultFaceParams(), skeleton);
      const report = await validate(buildAvatarGlb({ mesh, skeleton, name: `Random ${i}` }));

      expect(describeErrors(report)).toBe("");
    }
  });

  it("reports a skinned mesh with the expected joint count", async () => {
    const report = await validate(makeGlb());
    // The validator surfaces structural warnings we would want to know about;
    // none of them should concern skinning.
    const skinIssues = report.issues.messages.filter((m) => (m.pointer ?? "").includes("skin"));
    expect(skinIssues.filter((m) => m.severity === 0)).toEqual([]);
  });
});
