/**
 * Reads what it can out of an uploaded photo: where the face is, what colour
 * the skin and hair are, and roughly how the shot is framed.
 *
 * This is deliberately classical computer vision, not machine learning. Skin
 * pixels are classified by a colour rule, grouped into connected components,
 * and the component that most looks like a head is picked. It is fast, has no
 * model to ship or license, and runs anywhere.
 *
 * What it does NOT do is reconstruct a face or true body measurements from a
 * photo. That is the genuinely hard problem, and it is precisely what buying an
 * avatar vendor buys you (see idea.md section 4). The estimates here are honest
 * heuristics that give a good starting point which the user then edits, and the
 * vendor adapters can replace them wholesale without touching anything else.
 */

import sharp from "sharp";

/** Longest edge used for analysis. Full resolution buys nothing here. */
const ANALYSIS_SIZE = 192;

export interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

export type Framing = "portrait" | "full-body";

export interface PhotoAnalysis {
  /** True when a face-like skin region was actually found. */
  faceDetected: boolean;
  /** Face bounding box in source-image pixels. */
  faceBox: Box;
  /** Square crop around the face, clamped inside the image. */
  faceCrop: Box;
  skinTone: string;
  hairColor: string;
  framing: Framing;
  estimatedHeightCm: number;
  /** 0..1 estimate of how heavy the subject appears. */
  estimatedBuild: number;
  sourceWidth: number;
  sourceHeight: number;
}

/**
 * Kovac's RGB skin rule, plus a YCbCr chroma window.
 *
 * Neither is reliable alone: the RGB rule alone lets warm wood and orange
 * clothing through, and the chroma window alone lets desaturated greys through.
 * Requiring both cuts most of that.
 */
export function isSkinPixel(r: number, g: number, b: number): boolean {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);

  const rgbRule =
    r > 95 &&
    g > 40 &&
    b > 20 &&
    max - min > 15 &&
    Math.abs(r - g) > 15 &&
    r > g &&
    r > b;

  if (!rgbRule) return false;

  const cb = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b;
  const cr = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b;

  return cb >= 77 && cb <= 135 && cr >= 133 && cr <= 180;
}

function toHex(r: number, g: number, b: number): string {
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  return `#${[clamp(r), clamp(g), clamp(b)].map((c) => c.toString(16).padStart(2, "0")).join("")}`;
}

interface Component {
  pixels: number;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  sumR: number;
  sumG: number;
  sumB: number;
}

/**
 * Groups skin pixels into connected components with an iterative flood fill.
 *
 * Iterative, not recursive: a large skin region in a selfie is tens of
 * thousands of pixels and would blow the call stack.
 */
function connectedComponents(
  mask: Uint8Array,
  data: Buffer,
  channels: number,
  width: number,
  height: number,
): Component[] {
  const visited = new Uint8Array(mask.length);
  const components: Component[] = [];
  const stack: number[] = [];

  for (let start = 0; start < mask.length; start++) {
    if (!mask[start] || visited[start]) continue;

    const component: Component = {
      pixels: 0,
      minX: width,
      maxX: 0,
      minY: height,
      maxY: 0,
      sumR: 0,
      sumG: 0,
      sumB: 0,
    };

    stack.push(start);
    visited[start] = 1;

    while (stack.length > 0) {
      const index = stack.pop()!;
      const x = index % width;
      const y = (index / width) | 0;

      component.pixels++;
      if (x < component.minX) component.minX = x;
      if (x > component.maxX) component.maxX = x;
      if (y < component.minY) component.minY = y;
      if (y > component.maxY) component.maxY = y;

      const p = index * channels;
      component.sumR += data[p];
      component.sumG += data[p + 1];
      component.sumB += data[p + 2];

      if (x > 0) push(index - 1);
      if (x < width - 1) push(index + 1);
      if (y > 0) push(index - width);
      if (y < height - 1) push(index + width);
    }

    components.push(component);
  }

  return components;

  function push(next: number): void {
    if (mask[next] && !visited[next]) {
      visited[next] = 1;
      stack.push(next);
    }
  }
}

/**
 * Scores how much a skin region looks like a head.
 *
 * Three signals multiplied together: size, how high it sits in the frame, and
 * how close its aspect ratio is to a head's. Height matters because in a
 * full-body shot bare arms and legs are larger skin regions than the face, but
 * the face is always the topmost one.
 */
function headScore(component: Component, width: number, height: number): number {
  const w = component.maxX - component.minX + 1;
  const h = component.maxY - component.minY + 1;
  if (w < 3 || h < 3) return 0;

  const area = Math.sqrt(component.pixels / (width * height));

  const centreY = (component.minY + component.maxY) / 2 / height;
  const heightBonus = Math.pow(1 - centreY, 1.8);

  const aspect = w / h;
  const aspectBonus = Math.exp(-Math.pow(aspect - 0.78, 2) / 0.18);

  // A head is a reasonably solid blob; a scattered mask is not.
  const fill = component.pixels / (w * h);
  const fillBonus = fill < 0.35 ? 0.25 : 1;

  return area * heightBonus * aspectBonus * fillBonus;
}

export async function analysePhoto(photo: Buffer): Promise<PhotoAnalysis> {
  let image: sharp.Sharp;
  let meta: sharp.Metadata;

  try {
    image = sharp(photo);
    meta = await image.metadata();
  } catch {
    throw new Error("Could not read that image. Try a JPEG, PNG or WebP file.");
  }

  const sourceWidth = meta.width ?? 0;
  const sourceHeight = meta.height ?? 0;

  if (!sourceWidth || !sourceHeight) {
    throw new Error("Could not read that image. Try a JPEG, PNG or WebP file.");
  }

  const { data, info } = await image
    .clone()
    .resize(ANALYSIS_SIZE, ANALYSIS_SIZE, { fit: "inside", withoutEnlargement: true })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { width, height, channels } = info;
  const scaleX = sourceWidth / width;
  const scaleY = sourceHeight / height;

  const mask = new Uint8Array(width * height);
  for (let i = 0; i < width * height; i++) {
    const p = i * channels;
    mask[i] = isSkinPixel(data[p], data[p + 1], data[p + 2]) ? 1 : 0;
  }

  const components = connectedComponents(mask, data, channels, width, height);
  let best: Component | null = null;
  let bestScore = 0;

  for (const component of components) {
    // Ignore specks; they are almost always compression artefacts.
    if (component.pixels < (width * height) / 900) continue;
    const score = headScore(component, width, height);
    if (score > bestScore) {
      bestScore = score;
      best = component;
    }
  }

  const faceDetected = best !== null;

  // Fall back to the classic portrait framing: a face in the upper third,
  // centred. It is wrong for an unusual photo but never absurd, and the user
  // can adjust the result in the editor.
  const box: Box = best
    ? {
        left: Math.round(best.minX * scaleX),
        top: Math.round(best.minY * scaleY),
        width: Math.round((best.maxX - best.minX + 1) * scaleX),
        height: Math.round((best.maxY - best.minY + 1) * scaleY),
      }
    : {
        left: Math.round(sourceWidth * 0.28),
        top: Math.round(sourceHeight * 0.12),
        width: Math.round(sourceWidth * 0.44),
        height: Math.round(sourceHeight * 0.34),
      };

  const skinTone = best
    ? toHex(best.sumR / best.pixels, best.sumG / best.pixels, best.sumB / best.pixels)
    : "#c68863";

  const hairColor = best
    ? sampleHair(data, channels, width, height, best)
    : "#2b1b12";

  // Framing: how much of the frame the head fills. A portrait's head is a large
  // fraction of the image; a full-body shot's is small.
  const headFraction = box.height / sourceHeight;
  const framing: Framing = headFraction > 0.28 ? "portrait" : "full-body";

  // Heads-tall is the classic figure-drawing proportion: adults run about seven
  // and a half heads. Inverting it turns an apparent head size into a height.
  const headsTall = framing === "full-body" ? 1 / Math.max(headFraction, 0.06) : 7.5;
  const estimatedHeightCm = Math.round(
    Math.max(140, Math.min(210, 155 + (headsTall - 6.5) * 12)),
  );

  const estimatedBuild = estimateBuild(mask, width, height);

  return {
    faceDetected,
    faceBox: box,
    faceCrop: squareCrop(box, sourceWidth, sourceHeight),
    skinTone,
    hairColor,
    framing,
    estimatedHeightCm,
    estimatedBuild,
    sourceWidth,
    sourceHeight,
  };
}

/** Averages the pixels just above the face, which is where hair usually is. */
function sampleHair(
  data: Buffer,
  channels: number,
  width: number,
  height: number,
  face: Component,
): string {
  const faceHeight = face.maxY - face.minY + 1;
  const top = Math.max(0, face.minY - Math.round(faceHeight * 0.45));
  const bottom = Math.max(0, face.minY - 1);

  let r = 0;
  let g = 0;
  let b = 0;
  let count = 0;

  for (let y = top; y <= bottom; y++) {
    for (let x = face.minX; x <= face.maxX; x++) {
      const p = (y * width + x) * channels;
      // Skip anything that is itself skin — that is forehead, not hair.
      if (isSkinPixel(data[p], data[p + 1], data[p + 2])) continue;
      r += data[p];
      g += data[p + 1];
      b += data[p + 2];
      count++;
    }
  }

  return count > 12 ? toHex(r / count, g / count, b / count) : "#2b1b12";
}

/**
 * Rough build estimate from how wide the subject is relative to its height.
 *
 * Uses the skin mask's horizontal spread as a stand-in for the silhouette,
 * because separating a clothed subject from an arbitrary background reliably is
 * its own hard problem. Treat this as a starting position for the slider.
 */
function estimateBuild(mask: Uint8Array, width: number, height: number): number {
  let minX = width;
  let maxX = 0;
  let minY = height;
  let maxY = 0;
  let any = false;

  for (let i = 0; i < mask.length; i++) {
    if (!mask[i]) continue;
    any = true;
    const x = i % width;
    const y = (i / width) | 0;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }

  if (!any) return 0.5;

  const spread = (maxX - minX + 1) / (maxY - minY + 1);
  // A spread of about 0.5 is an average figure; wider reads as heavier.
  return Math.max(0, Math.min(1, 0.5 + (spread - 0.5) * 0.6));
}

/** Widens a face box into a square crop that stays inside the image. */
function squareCrop(box: Box, imageWidth: number, imageHeight: number): Box {
  // Include some forehead and chin: a tight box on the skin region alone cuts
  // the hairline off, which looks wrong once it is on the head.
  const padded = Math.round(Math.max(box.width, box.height) * 1.28);
  const size = Math.min(padded, imageWidth, imageHeight);

  const cx = box.left + box.width / 2;
  const cy = box.top + box.height / 2;

  const left = Math.round(Math.max(0, Math.min(cx - size / 2, imageWidth - size)));
  const top = Math.round(Math.max(0, Math.min(cy - size / 2, imageHeight - size)));

  return { left, top, width: size, height: size };
}
