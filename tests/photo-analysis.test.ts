import { describe, it, expect } from "vitest";
import sharp from "sharp";
import { analysePhoto, isSkinPixel } from "@/lib/avatar-engine/photo/analyse";

/** A synthetic portrait: one skin-toned oval on a flat background. */
async function portrait(options: {
  width: number;
  height: number;
  faceCx: number;
  faceCy: number;
  faceRx: number;
  faceRy: number;
  skin?: string;
  hair?: string;
  background?: string;
}): Promise<Buffer> {
  const {
    width,
    height,
    faceCx,
    faceCy,
    faceRx,
    faceRy,
    skin = "#c68863",
    hair = "#2b1b12",
    background = "#2d4a63",
  } = options;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
    <rect width="${width}" height="${height}" fill="${background}"/>
    <ellipse cx="${faceCx}" cy="${faceCy - faceRy * 0.55}" rx="${faceRx * 1.12}" ry="${faceRy * 0.6}" fill="${hair}"/>
    <ellipse cx="${faceCx}" cy="${faceCy}" rx="${faceRx}" ry="${faceRy}" fill="${skin}"/>
  </svg>`;

  return sharp(Buffer.from(svg)).png().toBuffer();
}

describe("isSkinPixel", () => {
  it("accepts a range of real skin tones", () => {
    for (const [r, g, b] of [
      [198, 136, 99],
      [241, 194, 165],
      [141, 85, 54],
      [224, 172, 105],
      [255, 219, 172],
    ]) {
      expect(isSkinPixel(r, g, b)).toBe(true);
    }
  });

  it("rejects colours that are plainly not skin", () => {
    for (const [r, g, b] of [
      [0, 0, 0],
      [255, 255, 255],
      [30, 90, 200],
      [20, 180, 60],
      [120, 120, 120],
    ]) {
      expect(isSkinPixel(r, g, b)).toBe(false);
    }
  });
});

describe("analysePhoto", () => {
  it("locates a centred face in a portrait", async () => {
    const photo = await portrait({
      width: 400,
      height: 500,
      faceCx: 200,
      faceCy: 210,
      faceRx: 78,
      faceRy: 100,
    });

    const result = await analysePhoto(photo);

    // The box should sit around the oval, in source-pixel coordinates.
    const cx = result.faceBox.left + result.faceBox.width / 2;
    const cy = result.faceBox.top + result.faceBox.height / 2;

    expect(cx).toBeGreaterThan(150);
    expect(cx).toBeLessThan(250);
    expect(cy).toBeGreaterThan(150);
    expect(cy).toBeLessThan(270);
    expect(result.faceBox.width).toBeGreaterThan(80);
  });

  it("samples a skin tone close to the one in the image", async () => {
    const photo = await portrait({
      width: 300,
      height: 400,
      faceCx: 150,
      faceCy: 160,
      faceRx: 70,
      faceRy: 88,
      skin: "#8d5536",
    });

    const result = await analysePhoto(photo);
    const [r, g, b] = [
      parseInt(result.skinTone.slice(1, 3), 16),
      parseInt(result.skinTone.slice(3, 5), 16),
      parseInt(result.skinTone.slice(5, 7), 16),
    ];

    expect(Math.abs(r - 0x8d)).toBeLessThan(45);
    expect(Math.abs(g - 0x55)).toBeLessThan(45);
    expect(Math.abs(b - 0x36)).toBeLessThan(45);
  });

  it("returns a valid hex colour for hair", async () => {
    const photo = await portrait({
      width: 300,
      height: 400,
      faceCx: 150,
      faceCy: 170,
      faceRx: 66,
      faceRy: 84,
    });

    const result = await analysePhoto(photo);
    expect(result.hairColor).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it("prefers the higher, face-shaped region over a lower blob", async () => {
    // A face near the top and a larger skin-coloured rectangle lower down,
    // standing in for bare arms or a torso.
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="800">
      <rect width="400" height="800" fill="#22303c"/>
      <ellipse cx="200" cy="120" rx="52" ry="66" fill="#c68863"/>
      <rect x="90" y="420" width="220" height="300" fill="#c68863"/>
    </svg>`;
    const photo = await sharp(Buffer.from(svg)).png().toBuffer();

    const result = await analysePhoto(photo);
    const cy = result.faceBox.top + result.faceBox.height / 2;

    expect(cy).toBeLessThan(300);
  });

  it("classifies a tall photo with a small face as full body", async () => {
    const photo = await portrait({
      width: 400,
      height: 900,
      faceCx: 200,
      faceCy: 110,
      faceRx: 42,
      faceRy: 54,
    });

    const result = await analysePhoto(photo);
    expect(result.framing).toBe("full-body");
  });

  it("classifies a photo dominated by the face as a portrait", async () => {
    const photo = await portrait({
      width: 400,
      height: 480,
      faceCx: 200,
      faceCy: 240,
      faceRx: 140,
      faceRy: 175,
    });

    const result = await analysePhoto(photo);
    expect(result.framing).toBe("portrait");
  });

  it("falls back to a plausible face box when no skin is found", async () => {
    const photo = await sharp({
      create: { width: 300, height: 400, channels: 3, background: { r: 20, g: 120, b: 60 } },
    })
      .png()
      .toBuffer();

    const result = await analysePhoto(photo);

    expect(result.faceDetected).toBe(false);
    expect(result.faceBox.width).toBeGreaterThan(0);
    expect(result.faceBox.height).toBeGreaterThan(0);
    expect(result.skinTone).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it("returns a square crop that stays inside the source image", async () => {
    const photo = await portrait({
      width: 300,
      height: 400,
      faceCx: 40,
      faceCy: 40,
      faceRx: 36,
      faceRy: 44,
    });

    const result = await analysePhoto(photo);

    expect(result.faceCrop.left).toBeGreaterThanOrEqual(0);
    expect(result.faceCrop.top).toBeGreaterThanOrEqual(0);
    expect(result.faceCrop.left + result.faceCrop.width).toBeLessThanOrEqual(300);
    expect(result.faceCrop.top + result.faceCrop.height).toBeLessThanOrEqual(400);
    expect(result.faceCrop.width).toBe(result.faceCrop.height);
  });

  it("estimates a height inside human range", async () => {
    const photo = await portrait({
      width: 400,
      height: 900,
      faceCx: 200,
      faceCy: 110,
      faceRx: 44,
      faceRy: 56,
    });

    const result = await analysePhoto(photo);
    expect(result.estimatedHeightCm).toBeGreaterThanOrEqual(140);
    expect(result.estimatedHeightCm).toBeLessThanOrEqual(210);
  });

  it("rejects an unreadable buffer with a clear message", async () => {
    await expect(analysePhoto(Buffer.from("this is not an image"))).rejects.toThrow(
      /could not read|unsupported/i,
    );
  });
});
