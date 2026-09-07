/**
 * Paints the avatar's texture atlas.
 *
 * The sheet is laid out to match ATLAS in geometry/mesh.ts exactly. The head
 * occupies the top seven eighths as an equirectangular map: azimuth runs across
 * U with the face dead centre, elevation runs down V with the crown at the top.
 *
 * Facial features are drawn as SVG and rasterised, which keeps them resolution
 * independent and driven directly by the editor's sliders. When the user has
 * uploaded a photo, the extracted face is composited over the drawn features
 * behind a soft elliptical mask, so the edges of the photo dissolve into the
 * painted skin instead of ending in a visible rectangle.
 */

import sharp from "sharp";
import { ATLAS } from "../geometry/mesh";
import { clamp, lerp } from "../geometry/math";
import type { FaceParams } from "../params";

/** Atlas edge length in pixels. */
export const ATLAS_SIZE = 2048;

const HEAD_TOP = ATLAS.head.v0 * ATLAS_SIZE;
const HEAD_BOTTOM = ATLAS.head.v1 * ATLAS_SIZE;
const HEAD_HEIGHT = HEAD_BOTTOM - HEAD_TOP;

/** Azimuth in degrees to an X pixel. 0 degrees is straight ahead. */
function azimuthX(degrees: number): number {
  return ATLAS_SIZE * (0.5 + degrees / 360);
}

/** Elevation in degrees to a Y pixel. +90 is the crown, -90 the underside. */
function elevationY(degrees: number): number {
  return HEAD_TOP + HEAD_HEIGHT * (0.5 - degrees / 180);
}

function shade(hex: string, amount: number): string {
  const value = hex.replace("#", "");
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);

  const mix = (channel: number) =>
    Math.round(clamp(amount >= 0 ? lerp(channel, 255, amount) : lerp(channel, 0, -amount), 0, 255));

  return `#${[mix(r), mix(g), mix(b)].map((c) => c.toString(16).padStart(2, "0")).join("")}`;
}

export interface FaceRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * Where an uploaded face photo is composited, in atlas pixels.
 *
 * Spans roughly +/-52 degrees of azimuth and +38 to -52 of elevation, which is
 * the part of the head a front-on portrait actually covers.
 */
export function faceRect(): FaceRect {
  const left = azimuthX(-52);
  const right = azimuthX(52);
  const top = elevationY(38);
  const bottom = elevationY(-52);

  return {
    left: Math.round(left),
    top: Math.round(top),
    width: Math.round(right - left),
    height: Math.round(bottom - top),
  };
}

/**
 * The hair mass, as a band across the equirectangular map.
 *
 * The hairline dips highest at the centre of the strip (the forehead) and drops
 * lower towards both edges (the sides and back of the skull), which is what a
 * real hairline does once it is unwrapped this way.
 *
 * Colours are written as literal hex, never CSS custom properties: the SVG is
 * rasterised by librsvg inside sharp, which does not resolve `var()` and
 * silently paints black instead.
 */
function hairPath(style: FaceParams["hairStyle"], hair: string, hairShadow: string): string {
  const top = elevationY(90);
  const mid = ATLAS_SIZE * 0.5;

  const band = (edgeElevation: number, centreElevation: number) =>
    `<path d="M 0 ${top} H ${ATLAS_SIZE} V ${elevationY(edgeElevation)} Q ${mid} ${elevationY(centreElevation)} 0 ${elevationY(edgeElevation)} Z" fill="${hair}"/>` +
    `<path d="M 0 ${elevationY(edgeElevation)} Q ${mid} ${elevationY(centreElevation)} ${ATLAS_SIZE} ${elevationY(edgeElevation)}"
            fill="none" stroke="${hairShadow}" stroke-width="${HEAD_HEIGHT * 0.006}" opacity="0.5"/>`;

  switch (style) {
    case "none":
      return "";
    case "short":
      return band(42, 58);
    case "medium":
      return band(10, 52);
    case "long":
      return band(-40, 50);
    case "bun":
      return (
        band(42, 60) +
        `<ellipse cx="${azimuthX(180)}" cy="${elevationY(62)}" rx="${ATLAS_SIZE * 0.09}" ry="${HEAD_HEIGHT * 0.07}" fill="${hair}"/>` +
        `<ellipse cx="${azimuthX(-180)}" cy="${elevationY(62)}" rx="${ATLAS_SIZE * 0.09}" ry="${HEAD_HEIGHT * 0.07}" fill="${hair}"/>`
      );
    case "afro":
      return band(24, 64);
  }
}

/** Builds the SVG for the whole sheet. */
function atlasSvg(face: FaceParams): string {
  const skin = face.skinTone;
  const skinShadow = shade(skin, -0.18);
  const skinLight = shade(skin, 0.1);
  const lip = shade(skin, -0.32);

  // Slider-driven feature geometry.
  const eyeSpread = lerp(15, 22, face.eyeSize * 0.35 + 0.5);
  const eyeRx = ATLAS_SIZE * lerp(0.016, 0.028, face.eyeSize);
  const eyeRy = HEAD_HEIGHT * lerp(0.012, 0.022, face.eyeSize);
  const eyeY = elevationY(lerp(14, 8, face.browHeight));
  const browY = elevationY(lerp(20, 28, face.browHeight));
  const browRx = eyeRx * 1.35;
  const browRy = HEAD_HEIGHT * 0.008;

  const noseY = elevationY(lerp(-4, -12, face.noseSize));
  const noseRx = ATLAS_SIZE * lerp(0.013, 0.024, face.noseSize);
  const noseRy = HEAD_HEIGHT * lerp(0.014, 0.026, face.noseSize);

  const mouthY = elevationY(lerp(-26, -32, face.chinLength));
  const mouthRx = ATLAS_SIZE * lerp(0.022, 0.042, face.mouthWidth);
  const mouthRy = HEAD_HEIGHT * 0.014;

  const cheekY = elevationY(-6);
  const cheekRx = ATLAS_SIZE * lerp(0.03, 0.055, face.cheekFullness);
  const cheekOpacity = 0.1 + face.cheekFullness * 0.16;

  const jawInset = lerp(46, 34, face.jawWidth);

  const eye = (sign: 1 | -1) => {
    const cx = azimuthX(sign * eyeSpread);
    return `
      <ellipse cx="${cx}" cy="${eyeY}" rx="${eyeRx}" ry="${eyeRy}" fill="#f6f1ec"/>
      <circle cx="${cx}" cy="${eyeY}" r="${eyeRy * 0.82}" fill="${face.eyeColor}"/>
      <circle cx="${cx}" cy="${eyeY}" r="${eyeRy * 0.38}" fill="#140f0c"/>
      <circle cx="${cx - eyeRx * 0.28}" cy="${eyeY - eyeRy * 0.3}" r="${eyeRy * 0.16}" fill="#ffffff" opacity="0.85"/>
      <path d="M ${cx - eyeRx} ${eyeY} A ${eyeRx} ${eyeRy} 0 0 1 ${cx + eyeRx} ${eyeY}"
            fill="none" stroke="${shade(skin, -0.45)}" stroke-width="${eyeRy * 0.22}" stroke-linecap="round"/>
      <ellipse cx="${cx}" cy="${browY}" rx="${browRx}" ry="${browRy}" fill="${face.hairColor}"/>
    `;
  };

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${ATLAS_SIZE}" height="${ATLAS_SIZE}" viewBox="0 0 ${ATLAS_SIZE} ${ATLAS_SIZE}">
  <defs>
    <!--
      Front-to-back shading across the head map. Lightest at the centre, which
      is the face, falling to shadow at both edges, which are the same point at
      the back of the skull. Because both ends land on the identical colour the
      wrap-around seam is invisible. A pair of hard-edged rectangles was tried
      first and read as painted stripes.
    -->
    <linearGradient id="headWrap" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%"   stop-color="${shade(skin, -0.26)}"/>
      <stop offset="22%"  stop-color="${skinShadow}"/>
      <stop offset="${50 - jawInset * 0.42}%" stop-color="${skin}"/>
      <stop offset="50%"  stop-color="${skinLight}"/>
      <stop offset="${50 + jawInset * 0.42}%" stop-color="${skin}"/>
      <stop offset="78%"  stop-color="${skinShadow}"/>
      <stop offset="100%" stop-color="${shade(skin, -0.26)}"/>
    </linearGradient>
    <linearGradient id="crownShade" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%"   stop-color="${skinLight}" stop-opacity="0.5"/>
      <stop offset="35%"  stop-color="${skin}" stop-opacity="0"/>
      <stop offset="100%" stop-color="${skin}" stop-opacity="0"/>
    </linearGradient>
    <linearGradient id="jawShade" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%"   stop-color="${skinShadow}" stop-opacity="0"/>
      <stop offset="100%" stop-color="${skinShadow}" stop-opacity="0.8"/>
    </linearGradient>
  </defs>

  <!-- Whole sheet defaults to skin so any UV that strays stays plausible. -->
  <rect width="${ATLAS_SIZE}" height="${ATLAS_SIZE}" fill="${skin}"/>

  <!-- Head map -->
  <rect x="0" y="${HEAD_TOP}" width="${ATLAS_SIZE}" height="${HEAD_HEIGHT}" fill="url(#headWrap)"/>
  <rect x="0" y="${HEAD_TOP}" width="${ATLAS_SIZE}" height="${HEAD_HEIGHT * 0.4}" fill="url(#crownShade)"/>

  <!-- Underside of the jaw. -->
  <rect x="0" y="${elevationY(-34)}" width="${ATLAS_SIZE}" height="${elevationY(-90) - elevationY(-34)}" fill="url(#jawShade)"/>

  ${hairPath(face.hairStyle, face.hairColor, shade(face.hairColor, -0.4))}

  <!-- Cheeks -->
  <ellipse cx="${azimuthX(-26)}" cy="${cheekY}" rx="${cheekRx}" ry="${cheekRx * 0.6}" fill="${shade(skin, -0.12)}" opacity="${cheekOpacity}"/>
  <ellipse cx="${azimuthX(26)}" cy="${cheekY}" rx="${cheekRx}" ry="${cheekRx * 0.6}" fill="${shade(skin, -0.12)}" opacity="${cheekOpacity}"/>

  ${eye(-1)}
  ${eye(1)}

  <!-- Nose: a soft shadow plus two nostrils reads better than an outline. -->
  <ellipse cx="${azimuthX(0)}" cy="${noseY}" rx="${noseRx}" ry="${noseRy}" fill="${skinShadow}" opacity="0.35"/>
  <ellipse cx="${azimuthX(-3.2)}" cy="${noseY + noseRy * 0.55}" rx="${noseRx * 0.22}" ry="${noseRy * 0.16}" fill="${shade(skin, -0.55)}" opacity="0.7"/>
  <ellipse cx="${azimuthX(3.2)}" cy="${noseY + noseRy * 0.55}" rx="${noseRx * 0.22}" ry="${noseRy * 0.16}" fill="${shade(skin, -0.55)}" opacity="0.7"/>

  <!-- Mouth -->
  <ellipse cx="${azimuthX(0)}" cy="${mouthY}" rx="${mouthRx}" ry="${mouthRy}" fill="${lip}"/>
  <path d="M ${azimuthX(0) - mouthRx} ${mouthY} Q ${azimuthX(0)} ${mouthY + mouthRy * 0.6} ${azimuthX(0) + mouthRx} ${mouthY}"
        fill="none" stroke="${shade(skin, -0.5)}" stroke-width="${mouthRy * 0.3}" stroke-linecap="round"/>

  <!-- Body and detail strips stay flat skin. -->
  <rect x="${ATLAS.body.u0 * ATLAS_SIZE}" y="${ATLAS.body.v0 * ATLAS_SIZE}"
        width="${(ATLAS.body.u1 - ATLAS.body.u0) * ATLAS_SIZE}"
        height="${(ATLAS.body.v1 - ATLAS.body.v0) * ATLAS_SIZE}" fill="${skin}"/>
  <rect x="${ATLAS.detail.u0 * ATLAS_SIZE}" y="${ATLAS.detail.v0 * ATLAS_SIZE}"
        width="${(ATLAS.detail.u1 - ATLAS.detail.u0) * ATLAS_SIZE}"
        height="${(ATLAS.detail.v1 - ATLAS.detail.v0) * ATLAS_SIZE}" fill="${skinLight}"/>
</svg>`;
}

/** A soft-edged elliptical alpha mask the size of the face rectangle. */
function faceMaskSvg(width: number, height: number): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
  <defs>
    <radialGradient id="m" cx="50%" cy="48%" r="52%">
      <stop offset="0%" stop-color="#fff" stop-opacity="1"/>
      <stop offset="62%" stop-color="#fff" stop-opacity="1"/>
      <stop offset="100%" stop-color="#fff" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${width}" height="${height}" fill="url(#m)"/>
</svg>`;
}

export interface RenderAtlasOptions {
  face: FaceParams;
  /**
   * The user's face, already cropped square by the photo analyser. When absent
   * the atlas is the drawn face alone, which is what Path B uses before the
   * user uploads anything.
   */
  photo?: Buffer;
  /** 0 = drawn face only, 1 = photo at full strength. */
  photoStrength?: number;
}

/** Renders the full atlas and returns PNG bytes ready to embed in the GLB. */
export async function renderAvatarAtlasPng(options: RenderAtlasOptions): Promise<Uint8Array> {
  const { face, photo, photoStrength = 0.92 } = options;

  const base = sharp(Buffer.from(atlasSvg(face)));

  if (!photo) {
    return new Uint8Array(await base.png({ compressionLevel: 9 }).toBuffer());
  }

  const rect = faceRect();

  // Fit the portrait to the face rectangle, then punch a soft ellipse out of it
  // so nothing shows a hard photo edge against the painted skin.
  const masked = await sharp(photo)
    .resize(rect.width, rect.height, { fit: "cover", position: "attention" })
    .ensureAlpha()
    .composite([{ input: Buffer.from(faceMaskSvg(rect.width, rect.height)), blend: "dest-in" }])
    .png()
    .toBuffer();

  return new Uint8Array(
    await base
      .composite([
        {
          input: masked,
          left: rect.left,
          top: rect.top,
          blend: "over",
          ...(photoStrength < 1 ? {} : {}),
        },
      ])
      .png({ compressionLevel: 9 })
      .toBuffer(),
  );
}
