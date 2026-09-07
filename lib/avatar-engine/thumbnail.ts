/**
 * Renders a thumbnail of an avatar on the server, with no GPU involved.
 *
 * Dashboards need a picture of each saved avatar. The alternatives are running
 * a headless browser with WebGL, which is a heavy dependency to deploy, or
 * asking the client to screenshot its canvas and upload it, which fails for any
 * avatar the user has not opened. Projecting the mesh and painting flat-shaded
 * triangles is a few dozen lines and always works.
 *
 * It is a painter's algorithm, so it sorts within each layer and draws layers
 * in order rather than sorting every triangle together. Clothing sits barely a
 * centimetre off the skin and its coarser triangles have centroids pulled
 * inside the curve, so a single global sort hides garments behind the body.
 */

import sharp from "sharp";
import type { SkinnedMesh } from "./geometry/mesh";

export interface ThumbnailLayer {
  mesh: Pick<SkinnedMesh, "positions" | "normals" | "indices">;
  /** Flat tint as #rrggbb. */
  colorHex: string;
}

export interface ThumbnailOptions {
  layers: ThumbnailLayer[];
  /** Avatar height in metres, used to frame the shot. */
  height: number;
  size?: number;
  yawDegrees?: number;
  background?: string;
  /** Crop to the head and shoulders instead of the whole figure. */
  portrait?: boolean;
}

const LIGHT: [number, number, number] = [0.35, 0.72, 0.6];

function hexRgb(hex: string): [number, number, number] {
  const value = hex.replace("#", "");
  return [
    parseInt(value.slice(0, 2), 16),
    parseInt(value.slice(2, 4), 16),
    parseInt(value.slice(4, 6), 16),
  ];
}

export function renderAvatarSvg(options: ThumbnailOptions): string {
  const {
    layers,
    height,
    size = 512,
    yawDegrees = 18,
    background = "#0f1117",
    portrait = false,
  } = options;

  const yaw = (yawDegrees * Math.PI) / 180;
  const cos = Math.cos(yaw);
  const sin = Math.sin(yaw);

  // Full-figure framing fits the whole height with room to breathe; portrait
  // framing zooms on the top fifth, which is where the face the user actually
  // recognises is. The margin is deliberate: a figure that touches the edges of
  // its card reads as cropped rather than as framed.
  const visibleHeight = portrait ? height * 0.3 : height * 1.18;
  const baseline = portrait ? height * 1.02 : height * 1.09;
  const scale = size / visibleHeight;

  const painted: string[] = [];

  for (const layer of layers) {
    const { mesh } = layer;
    const [tr, tg, tb] = hexRgb(layer.colorHex);
    const triangles: { d: number; svg: string }[] = [];

    for (let t = 0; t < mesh.indices.length; t += 3) {
      const ia = mesh.indices[t];
      const ib = mesh.indices[t + 1];
      const ic = mesh.indices[t + 2];

      const project = (i: number) => {
        const x = mesh.positions[i * 3];
        const y = mesh.positions[i * 3 + 1];
        const z = mesh.positions[i * 3 + 2];
        return {
          sx: size / 2 + (x * cos + z * sin) * scale,
          sy: (baseline - y) * scale,
          depth: -x * sin + z * cos,
        };
      };

      const a = project(ia);
      const b = project(ib);
      const c = project(ic);

      // Backface cull from the winding of the projected triangle.
      if ((b.sx - a.sx) * (c.sy - a.sy) - (c.sx - a.sx) * (b.sy - a.sy) >= 0) continue;

      let nx = 0;
      let ny = 0;
      let nz = 0;
      for (const i of [ia, ib, ic]) {
        nx += mesh.normals[i * 3];
        ny += mesh.normals[i * 3 + 1];
        nz += mesh.normals[i * 3 + 2];
      }
      const rnx = (nx * cos + nz * sin) / 3;
      const rnz = (-nx * sin + nz * cos) / 3;

      // A generous ambient floor, because a card sitting on a dark dashboard
      // needs the silhouette to read at a glance more than it needs contrast
      // between its own facets.
      const lambert = Math.max(0, rnx * LIGHT[0] + (ny / 3) * LIGHT[1] + rnz * LIGHT[2]);
      const level = 0.46 + lambert * 0.72;
      const rgb = [tr, tg, tb].map((ch) => Math.round(Math.min(255, ch * level))).join(",");

      triangles.push({
        d: (a.depth + b.depth + c.depth) / 3,
        svg: `<polygon points="${a.sx.toFixed(1)},${a.sy.toFixed(1)} ${b.sx.toFixed(1)},${b.sy.toFixed(1)} ${c.sx.toFixed(1)},${c.sy.toFixed(1)}" fill="rgb(${rgb})"/>`,
      });
    }

    triangles.sort((p, q) => p.d - q.d);
    painted.push(...triangles.map((tri) => tri.svg));
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <defs>
    <radialGradient id="bg" cx="50%" cy="38%" r="72%">
      <stop offset="0%" stop-color="#1b1f2e"/>
      <stop offset="100%" stop-color="${background}"/>
    </radialGradient>
  </defs>
  <rect width="${size}" height="${size}" fill="url(#bg)"/>
  ${painted.join("")}
</svg>`;
}

/** Renders the thumbnail to PNG bytes. */
export async function renderAvatarThumbnail(options: ThumbnailOptions): Promise<Uint8Array> {
  const svg = renderAvatarSvg(options);
  return new Uint8Array(await sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toBuffer());
}
