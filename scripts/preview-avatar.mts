/**
 * Renders a sample avatar to disk so the geometry and texture can be eyeballed
 * without running the whole app.
 *
 *   npx vite-node scripts/preview-avatar.mts
 *
 * Writes .data/preview/avatar.glb, atlas.png and turntable.png. The turntable
 * is a plain software rasterisation of the mesh from four angles: enough to see
 * whether the silhouette reads as a person, which no unit test can tell us.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import sharp from "sharp";
import { buildAvatarGlb } from "../lib/avatar-engine/build-avatar-glb.ts";
import { buildHumanoid } from "../lib/avatar-engine/geometry/humanoid.ts";
import { garmentTemplate } from "../lib/clothing/templates.ts";
import { buildSkeleton } from "../lib/avatar-engine/geometry/skeleton.ts";
import { bodyParamsSchema, defaultFaceParams } from "../lib/avatar-engine/params.ts";
import { renderAvatarAtlasPng } from "../lib/avatar-engine/texture/atlas.ts";

const VIEW = 460;
const PAD = 16;

interface Layer {
  mesh: { positions: Float32Array; normals: Float32Array; indices: Uint32Array };
  tint: [number, number, number];
}

/** Orthographic projection with painter's-algorithm hidden-surface removal. */
function rasterise(layers: Layer[], yawDegrees: number, height: number): string {
  const yaw = (yawDegrees * Math.PI) / 180;
  const cos = Math.cos(yaw);
  const sin = Math.sin(yaw);

  const scale = (VIEW - PAD * 2) / height;
  const painted: string[] = [];
  const light = [0.35, 0.72, 0.6];

  // Sort within each layer and draw layers in order, rather than sorting every
  // triangle together. Clothing sits only a centimetre or two off the skin, and
  // a garment's coarser triangles have centroids pulled inside the curve, so a
  // single global depth sort hides the garment behind the body it covers. A GPU
  // depth buffer does not have this problem; this rasteriser does.
  for (const layer of layers) {
    const { mesh, tint } = layer;
    const triangles: { d: number; svg: string }[] = [];

    const project = (i: number) => {
      const x = mesh.positions[i * 3];
      const y = mesh.positions[i * 3 + 1];
      const z = mesh.positions[i * 3 + 2];
      // Rotate about Y, then drop the depth axis.
      const rx = x * cos + z * sin;
      const rz = -x * sin + z * cos;
      return { sx: VIEW / 2 + rx * scale, sy: VIEW - PAD - y * scale, depth: rz };
    };

    for (let t = 0; t < mesh.indices.length; t += 3) {
      const [ia, ib, ic] = [mesh.indices[t], mesh.indices[t + 1], mesh.indices[t + 2]];
      const a = project(ia);
      const b = project(ib);
      const c = project(ic);

      // Backface cull using the winding of the projected triangle.
      const area = (b.sx - a.sx) * (c.sy - a.sy) - (c.sx - a.sx) * (b.sy - a.sy);
      if (area >= 0) continue;

      // Average vertex normal, rotated with the model, as a cheap flat shade.
      let nx = 0;
      let ny = 0;
      let nz = 0;
      for (const i of [ia, ib, ic]) {
        nx += mesh.normals[i * 3];
        ny += mesh.normals[i * 3 + 1];
        nz += mesh.normals[i * 3 + 2];
      }
      const rnx = (nx * cos + nz * sin) / 3;
      const rny = ny / 3;
      const rnz = (-nx * sin + nz * cos) / 3;

      const lambert = Math.max(0, rnx * light[0] + rny * light[1] + rnz * light[2]);
      const level = 0.28 + lambert * 0.82;
      const rgb = tint.map((c) => Math.round(Math.min(255, c * level))).join(",");

      triangles.push({
        d: (a.depth + b.depth + c.depth) / 3,
        svg: `<polygon points="${a.sx.toFixed(1)},${a.sy.toFixed(1)} ${b.sx.toFixed(1)},${b.sy.toFixed(1)} ${c.sx.toFixed(1)},${c.sy.toFixed(1)}" fill="rgb(${rgb})"/>`,
      });
    }

    triangles.sort((p, q) => p.d - q.d);
    painted.push(...triangles.map((t) => t.svg));
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${VIEW}" height="${VIEW}">
    <rect width="${VIEW}" height="${VIEW}" fill="#12131a"/>
    <line x1="0" y1="${VIEW - PAD}" x2="${VIEW}" y2="${VIEW - PAD}" stroke="#2c2f3d" stroke-width="1"/>
    ${painted.join("")}
    <text x="8" y="18" fill="#8b8fa3" font-family="monospace" font-size="13">${yawDegrees}&#176;</text>
  </svg>`;
}

const outDir = resolve(process.cwd(), ".data/preview");
mkdirSync(outDir, { recursive: true });

const body = bodyParamsSchema.parse({});
const face = defaultFaceParams();
const skeleton = buildSkeleton(body);
const mesh = buildHumanoid(body, face, skeleton);
const atlas = await renderAvatarAtlasPng({ face });
const glb = buildAvatarGlb({ mesh, skeleton, texture: atlas, name: "Preview Avatar" });

writeFileSync(resolve(outDir, "atlas.png"), atlas);
writeFileSync(resolve(outDir, "avatar.glb"), glb);

const outfit = ["hoodie", "jeans", "sneakers"].map((id) => {
  const template = garmentTemplate(id)!;
  return { name: template.id, mesh: template.build({ body, skeleton }), colorHex: template.defaultColor };
});

writeFileSync(
  resolve(outDir, "avatar-dressed.glb"),
  buildAvatarGlb({ mesh, skeleton, texture: atlas, garments: outfit, name: "Dressed Avatar" }),
);

const hexRgb = (hex: string): [number, number, number] => [
  parseInt(hex.slice(1, 3), 16),
  parseInt(hex.slice(3, 5), 16),
  parseInt(hex.slice(5, 7), 16),
];

const nude: Layer[] = [{ mesh, tint: [214, 160, 124] }];
const dressed: Layer[] = [
  ...nude,
  ...outfit.map((g) => ({ mesh: g.mesh, tint: hexRgb(g.colorHex) })),
];

const angles = [0, 45, 90, 180];
const tiles = await Promise.all([
  ...angles.map((a) => sharp(Buffer.from(rasterise(nude, a, skeleton.height))).png().toBuffer()),
  ...angles.map((a) => sharp(Buffer.from(rasterise(dressed, a, skeleton.height))).png().toBuffer()),
]);

await sharp({
  create: {
    width: VIEW * angles.length,
    height: VIEW * 2,
    channels: 3,
    background: { r: 18, g: 19, b: 26 },
  },
})
  .composite(
    tiles.map((input, i) => ({
      input,
      left: (i % angles.length) * VIEW,
      top: Math.floor(i / angles.length) * VIEW,
    })),
  )
  .png()
  .toFile(resolve(outDir, "turntable.png"));

console.log(`vertices : ${mesh.positions.length / 3}`);
console.log(`triangles: ${mesh.indices.length / 3}`);
console.log(`bones    : ${skeleton.bones.length}`);
console.log(`atlas    : ${(atlas.byteLength / 1024).toFixed(1)} KB`);
console.log(`glb      : ${(glb.byteLength / 1024).toFixed(1)} KB`);
console.log(`written to ${outDir}`);

// --- Exports, so the real output can be opened in Blender or Mixamo ---------
const { exportAs } = await import("../lib/export/index.ts");

for (const format of ["glb", "fbx"]) {
  const result = await exportAs(
    format,
    { glb, mesh, skeleton, texture: atlas, garments: outfit, avatarName: "Preview Avatar" },
    {},
  );
  writeFileSync(resolve(outDir, result.filename), result.bytes);
  console.log(`export ${format.padEnd(4)}: ${result.filename} (${(result.bytes.byteLength / 1024).toFixed(1)} KB)`);
}
