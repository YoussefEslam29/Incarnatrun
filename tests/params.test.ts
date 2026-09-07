import { describe, it, expect } from "vitest";
import {
  bodyParamsSchema,
  faceParamsSchema,
  outfitSchema,
  defaultBodyParams,
  defaultFaceParams,
  randomBodyParams,
  BODY_TEMPLATES,
} from "@/lib/avatar-engine/params";

describe("bodyParamsSchema", () => {
  it("fills in every default when given an empty object", () => {
    const parsed = bodyParamsSchema.parse({});
    expect(parsed).toEqual(defaultBodyParams());
    expect(parsed.heightCm).toBeGreaterThan(140);
  });

  it("rejects a height outside human range", () => {
    expect(bodyParamsSchema.safeParse({ heightCm: 40 }).success).toBe(false);
    expect(bodyParamsSchema.safeParse({ heightCm: 400 }).success).toBe(false);
  });

  it("rejects normalised sliders outside 0..1", () => {
    expect(bodyParamsSchema.safeParse({ waist: 1.5 }).success).toBe(false);
    expect(bodyParamsSchema.safeParse({ waist: -0.1 }).success).toBe(false);
  });

  it("accepts the extremes of every slider", () => {
    const low = bodyParamsSchema.safeParse({
      heightCm: 140, build: 0, shoulderWidth: 0, chest: 0, waist: 0,
      hips: 0, armLength: 0, legLength: 0, muscle: 0, headSize: 0,
    });
    const high = bodyParamsSchema.safeParse({
      heightCm: 210, build: 1, shoulderWidth: 1, chest: 1, waist: 1,
      hips: 1, armLength: 1, legLength: 1, muscle: 1, headSize: 1,
    });
    expect(low.success).toBe(true);
    expect(high.success).toBe(true);
  });

  it("strips unknown keys instead of trusting client input", () => {
    const parsed = bodyParamsSchema.parse({ waist: 0.5, isAdmin: true });
    expect("isAdmin" in parsed).toBe(false);
  });
});

describe("faceParamsSchema", () => {
  it("requires colours to be six-digit hex", () => {
    expect(faceParamsSchema.safeParse({ skinTone: "red" }).success).toBe(false);
    expect(faceParamsSchema.safeParse({ skinTone: "#fff" }).success).toBe(false);
    expect(faceParamsSchema.safeParse({ skinTone: "#AABBCC" }).success).toBe(true);
  });

  it("defaults to a complete, renderable face", () => {
    const face = defaultFaceParams();
    expect(face.skinTone).toMatch(/^#[0-9a-fA-F]{6}$/);
    expect(face.hairColor).toMatch(/^#[0-9a-fA-F]{6}$/);
    expect(face.eyeColor).toMatch(/^#[0-9a-fA-F]{6}$/);
  });

  it("rejects an unknown hair style", () => {
    expect(faceParamsSchema.safeParse({ hairStyle: "mohawk-deluxe" }).success).toBe(false);
  });
});

describe("outfitSchema", () => {
  it("accepts an empty outfit", () => {
    expect(outfitSchema.parse({})).toEqual({});
  });

  it("maps known slots to garment ids", () => {
    const parsed = outfitSchema.parse({ TOP: "abc", SHOES: "def" });
    expect(parsed.TOP).toBe("abc");
    expect(parsed.SHOES).toBe("def");
  });

  it("rejects an unknown slot", () => {
    expect(outfitSchema.safeParse({ CAPE: "abc" }).success).toBe(false);
  });
});

describe("randomBodyParams", () => {
  it("is deterministic for a given seed", () => {
    expect(randomBodyParams("seed-one")).toEqual(randomBodyParams("seed-one"));
  });

  it("produces different bodies for different seeds", () => {
    expect(randomBodyParams("seed-one")).not.toEqual(randomBodyParams("seed-two"));
  });

  it("always produces params that pass validation", () => {
    for (let i = 0; i < 50; i++) {
      const result = bodyParamsSchema.safeParse(randomBodyParams(`seed-${i}`));
      expect(result.success).toBe(true);
    }
  });

  it("picks one of the named body templates", () => {
    const params = randomBodyParams("seed-one");
    expect(BODY_TEMPLATES.map((t) => t.id)).toContain(params.template);
  });
});
