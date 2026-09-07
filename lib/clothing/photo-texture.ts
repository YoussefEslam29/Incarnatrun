/**
 * Option A from PLAN/idea.md section 6: put the user's real garment on the avatar by
 * using their photo as the texture on a template mesh.
 *
 * The silhouette stays the template's; the colour, print, logo and pattern
 * become theirs. That is a deliberate scope choice, not a shortcut: it needs
 * only image processing against a known UV layout, whereas recovering a
 * garment's true 3D shape from a phone photo is the unsolved Option B problem
 * that section 6 explicitly keeps out of the MVP.
 *
 * Garment UVs run the full 0..1 range with the front of the body at u = 0.5, so
 * the middle of the photo lands on the chest, which is where a person expects
 * the print on their shirt to be.
 */

import sharp, { type Metadata, type Sharp } from "sharp";

export const GARMENT_TEXTURE_SIZE = 1024;

/** How much of the U range the photo covers. The rest is the matched colour. */
const FRONT_SPAN = 0.5;
/** How much of the V range the photo covers. */
const VERTICAL_SPAN = 0.72;

export interface GarmentTextureResult {
  texture: Uint8Array;
  /** Average colour of the garment, used to fill everything the photo misses. */
  dominantColor: string;
  /** True when uniform borders were cropped away. */
  trimmed: boolean;
}

export class GarmentPhotoError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GarmentPhotoError";
  }
}

function toHex(r: number, g: number, b: number): string {
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  return `#${[clamp(r), clamp(g), clamp(b)].map((c) => c.toString(16).padStart(2, "0")).join("")}`;
}

/**
 * Averages the middle of the image.
 *
 * The centre rather than the whole frame, because a flat-lay photo is mostly
 * the surface it was laid on, and averaging that gives the colour of the user's
 * bedsheet rather than of their shirt.
 */
async function centreColor(image: Sharp, width: number, height: number): Promise<string> {
  const inset = {
    left: Math.floor(width * 0.3),
    top: Math.floor(height * 0.3),
    width: Math.max(1, Math.floor(width * 0.4)),
    height: Math.max(1, Math.floor(height * 0.4)),
  };

  const stats = await image.clone().extract(inset).stats();
  const [r, g, b] = stats.channels;
  return toHex(r.mean, g.mean, b.mean);
}

export interface ProcessGarmentPhotoOptions {
  photo: Buffer;
  /** Trim uniform edges, which are usually the table or floor. */
  autoTrim?: boolean;
}

export async function processGarmentPhoto(
  options: ProcessGarmentPhotoOptions,
): Promise<GarmentTextureResult> {
  const { photo, autoTrim = true } = options;

  let source = sharp(photo);
  let meta: Metadata;

  try {
    meta = await source.metadata();
  } catch {
    throw new GarmentPhotoError("That image could not be read. Try a JPEG, PNG or WebP file.");
  }

  if (!meta.width || !meta.height) {
    throw new GarmentPhotoError("That image could not be read. Try a JPEG, PNG or WebP file.");
  }

  if (meta.width < 128 || meta.height < 128) {
    throw new GarmentPhotoError(
      `That image is only ${meta.width} by ${meta.height} pixels. Please upload one at least 128 pixels on each side.`,
    );
  }

  let trimmed = false;

  if (autoTrim) {
    try {
      const cropped = await source.clone().trim({ threshold: 12 }).toBuffer({ resolveWithObject: true });
      // Only accept the trim if something meaningful survived. An aggressive
      // trim on a low-contrast photo can leave a few pixels.
      if (cropped.info.width > meta.width * 0.35 && cropped.info.height > meta.height * 0.35) {
        source = sharp(cropped.data);
        meta = { ...meta, width: cropped.info.width, height: cropped.info.height };
        trimmed = true;
      }
    } catch {
      // Trimming is a nicety. A failure here is not a reason to reject the
      // upload, so carry on with the untrimmed image.
    }
  }

  const dominantColor = await centreColor(source, meta.width!, meta.height!);

  const panelWidth = Math.round(GARMENT_TEXTURE_SIZE * FRONT_SPAN);
  const panelHeight = Math.round(GARMENT_TEXTURE_SIZE * VERTICAL_SPAN);
  const left = Math.round((GARMENT_TEXTURE_SIZE - panelWidth) / 2);
  const top = Math.round((GARMENT_TEXTURE_SIZE - panelHeight) / 2);

  const panel = await source
    .clone()
    .resize(panelWidth, panelHeight, { fit: "cover", position: "attention" })
    .ensureAlpha()
    .composite([
      {
        // Feather the edges so the photo dissolves into the matched colour
        // instead of ending in a visible rectangle around the chest.
        input: Buffer.from(featherMask(panelWidth, panelHeight)),
        blend: "dest-in",
      },
    ])
    .png()
    .toBuffer();

  const texture = await sharp({
    create: {
      width: GARMENT_TEXTURE_SIZE,
      height: GARMENT_TEXTURE_SIZE,
      channels: 4,
      background: dominantColor,
    },
  })
    .composite([{ input: panel, left, top }])
    .png({ compressionLevel: 9 })
    .toBuffer();

  return { texture: new Uint8Array(texture), dominantColor, trimmed };
}

/** A rounded-rectangle alpha mask with soft edges. */
function featherMask(width: number, height: number): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
  <defs>
    <linearGradient id="h" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#000"/>
      <stop offset="12%" stop-color="#fff"/>
      <stop offset="88%" stop-color="#fff"/>
      <stop offset="100%" stop-color="#000"/>
    </linearGradient>
    <linearGradient id="v" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#000"/>
      <stop offset="10%" stop-color="#fff"/>
      <stop offset="90%" stop-color="#fff"/>
      <stop offset="100%" stop-color="#000"/>
    </linearGradient>
    <mask id="m">
      <rect width="${width}" height="${height}" fill="url(#h)"/>
      <rect width="${width}" height="${height}" fill="url(#v)" style="mix-blend-mode:multiply"/>
    </mask>
  </defs>
  <rect width="${width}" height="${height}" fill="url(#h)" mask="url(#m)"/>
</svg>`;
}
