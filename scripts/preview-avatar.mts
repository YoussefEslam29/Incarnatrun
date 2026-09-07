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
import { buildHumanoid, type HumanoidMesh } from "../lib/avatar-engine/geometry/humanoid.ts";
import { buildSkeleton } from "../lib/avatar-engine/geometry/skeleton.ts";
import { bodyParamsSchema, defaultFaceParams } from "../lib/avatar-engine/params.ts";
import { renderAvatarAtlasPng } from "../lib/avatar-engine/texture/atlas.ts";

const VIEW = 460;
const PAD = 16;

/** Orthographic projection with painter's-algorithm hidden-surface removal. */
function rasterise(mesh: HumanoidMesh, yawDegrees: number, height: number): string {
  const yaw = (yawDegrees * Math.PI) / 180;
  const cos = Math.cos(yaw);
  const sin = Math.sin(yaw);

  const scale = (VIEW - PAD * 2) / height;
  const project = (i: number) => {
    const x = mesh.positions[i * 3];
    const y = mesh.positions[i * 3 + 1];
    const z = mesh.positions[i * 3 + 2];
    // Rotate about Y, then drop the depth axis.
    const rx = x * cos + z * sin;
    const rz = -x * sin + z * cos;
    return {
      sx: VIEW / 2 + rx * scale,
      sy: VIEW - PAD - y * scale,
      depth: rz,
    };
  };

  const triangles: { d: number; svg: string }[] = [];
  const light = [0.42, 0.6, 0.68];

  for (let t = 0; t < mesh.indices.length; t += 3) {
    const [ia, ib, ic] = [mesh.indices[t], mesh.indices[t + 1], mesh.indices[t + 2]];
    const a = project(ia);
    const b = project(ib);
    const c = project(ic);

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
    const shade = Math.round(40 + lambert * 190);
    // Backface cull using the winding of the projected triangle.
    const area = (b.sx - a.sx) * (c.sy - a.sy) - (c.sx - a.sx) * (b.sy - a.sy);
    if (area >= 0) continue;

    triangles.push({
      d: (a.depth + b.depth + c.depth) / 3,
      svg: `<polygon points="${a.sx.toFixed(1)},${a.sy.toFixed(1)} ${b.sx.toFixed(1)},${b.sy.toFixed(1)} ${c.sx.toFixed(1)},${c.sy.toFixed(1)}" fill="rgb(${shade},${Math.round(shade * 0.82)},${Math.round(shade * 0.72)})"/>`,
    });
  }

  triangles.sort((p, q) => p.d - q.d);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${VIEW}" height="${VIEW}">
    <rect width="${VIEW}" height="${VIEW}" fill="#12131a"/>
    <line x1="0" y1="${VIEW - PAD}" x2="${VIEW}" y2="${VIEW - PAD}" stroke="#2c2f3d" stroke-width="1"/>
    ${triangles.map((t) => t.svg).join("")}
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

const angles = [0, 45, 90, 180];
const tiles = await Promise.all(
  angles.map((a) => sharp(Buffer.from(rasterise(mesh, a, skeleton.height))).png().toBuffer()),
);

await sharp({
  create: {
    width: VIEW * angles.length,
    height: VIEW,
    channels: 3,
    background: { r: 18, g: 19, b: 26 },
  },
})
  .composite(tiles.map((input, i) => ({ input, left: i * VIEW, top: 0 })))
  .png()
  .toFile(resolve(outDir, "turntable.png"));

console.log(`vertices : ${mesh.positions.length / 3}`);
console.log(`triangles: ${mesh.indices.length / 3}`);
console.log(`bones    : ${skeleton.bones.length}`);
console.log(`atlas    : ${(atlas.byteLength / 1024).toFixed(1)} KB`);
console.log(`glb      : ${(glb.byteLength / 1024).toFixed(1)} KB`);
console.log(`written to ${outDir}`);
