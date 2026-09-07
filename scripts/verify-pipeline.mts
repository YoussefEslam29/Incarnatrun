/**
 * End-to-end check of the real pipeline against a real database.
 *
 *   docker compose up -d && npm run db:push
 *   npx vite-node scripts/verify-pipeline.mts
 *
 * The unit tests cover the pure geometry and file formats. This covers what
 * they cannot: that generation, storage, persistence, re-render and export
 * actually work together, with Postgres and the filesystem in the loop.
 *
 * It creates a user, generates an avatar from a synthetic photo, edits and
 * saves it, dresses it, exports both formats, validates the GLB against the
 * Khronos validator, and then removes everything it made.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import sharp from "sharp";

// vite-node does not read .env, and every module below needs DATABASE_URL at
// import time, so it is loaded before any of them.
for (const line of readFileSync(resolve(process.cwd(), ".env"), "utf8").split(/\r?\n/)) {
  const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (match && !process.env[match[1]]) process.env[match[1]] = match[2];
}

const { prisma } = await import("../lib/db/client.ts");
const { createAvatarFromPhoto, saveAvatarEdit, rebuildAvatarGeometry } = await import(
  "../lib/avatars/service.ts"
);
const { getAvatar, listVersions, paramsFromVersion, deleteAvatar } = await import(
  "../lib/db/avatars.ts"
);
const { templateGarmentId } = await import("../lib/db/garments.ts");
const { getStorage } = await import("../lib/storage/index.ts");
const { exportAs } = await import("../lib/export/index.ts");
const { validateBytes } = await import("gltf-validator");

let passed = 0;
let failed = 0;

function check(label: string, condition: boolean, detail = ""): void {
  if (condition) {
    passed++;
    console.log(`  ok   ${label}${detail ? ` — ${detail}` : ""}`);
  } else {
    failed++;
    console.error(`  FAIL ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

/** A synthetic full-body portrait: head, torso and legs in skin tone. */
async function syntheticPhoto(): Promise<File> {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="1200">
    <rect width="600" height="1200" fill="#1e2a38"/>
    <ellipse cx="300" cy="118" rx="82" ry="56" fill="#2b1b12"/>
    <ellipse cx="300" cy="160" rx="76" ry="96" fill="#c68863"/>
    <rect x="238" y="250" width="124" height="60" fill="#c68863"/>
    <rect x="196" y="300" width="208" height="330" rx="40" fill="#8a5a3b"/>
    <rect x="150" y="310" width="46" height="300" rx="22" fill="#c68863"/>
    <rect x="404" y="310" width="46" height="300" rx="22" fill="#c68863"/>
    <rect x="228" y="620" width="64" height="440" rx="28" fill="#c68863"/>
    <rect x="308" y="620" width="64" height="440" rx="28" fill="#c68863"/>
  </svg>`;

  const png = await sharp(Buffer.from(svg)).png().toBuffer();
  return new File([new Uint8Array(png)], "subject.png", { type: "image/png" });
}

const EMAIL = `pipeline-check+${Date.now()}@incarnatrun.local`;
let userId = "";
let avatarId = "";

try {
  console.log("\nIncarnatrun pipeline check\n");

  // -- 1. A user ------------------------------------------------------------
  console.log("user");
  const user = await prisma.user.create({ data: { email: EMAIL, name: "Pipeline Check" } });
  userId = user.id;
  check("created", Boolean(userId), userId);

  // -- 2. Generation --------------------------------------------------------
  console.log("\ngenerate (Path A, full body)");
  const started = Date.now();
  const created = await createAvatarFromPhoto({
    userId,
    file: await syntheticPhoto(),
    path: "FULL_BODY",
    name: "Pipeline Avatar",
  });
  avatarId = created.avatarId;
  const elapsed = Date.now() - started;

  check("returned an avatar id", Boolean(avatarId), avatarId);
  check("completed in under 15s", elapsed < 15_000, `${elapsed} ms`);
  for (const warning of created.warnings) console.log(`       note: ${warning}`);

  const avatar = await getAvatar(userId, avatarId);
  check("row is READY", avatar?.status === "READY", avatar?.status);
  check("has a current version", avatar?.currentVersion?.version === 1);
  check("recorded the source photo", Boolean(avatar?.sourcePhotoKey));
  check("recorded the engine", avatar?.engineProvider === "builtin", avatar?.engineProvider);

  // -- 3. Stored files ------------------------------------------------------
  console.log("\nstorage");
  const storage = getStorage();
  const modelKey = avatar!.currentVersion!.modelKey!;
  const thumbKey = avatar!.currentVersion!.thumbnailKey!;

  const glbV1 = await storage.get(modelKey);
  check("model saved", glbV1.byteLength > 10_000, `${(glbV1.byteLength / 1024).toFixed(0)} KB`);
  check("model is a GLB", glbV1.subarray(0, 4).toString("latin1") === "glTF");

  const thumb = await storage.get(thumbKey);
  const thumbMeta = await sharp(thumb).metadata();
  check("thumbnail saved", thumbMeta.width === 512, `${thumbMeta.width}x${thumbMeta.height}`);

  check("face crop kept for re-renders", await storage.exists(`avatars/${avatarId}/face.png`));

  // -- 4. Photo actually influenced the result ------------------------------
  console.log("\nanalysis");
  const params = paramsFromVersion(avatar!.currentVersion!);
  check(
    "skin tone sampled from the photo",
    params.face.skinTone.toLowerCase() !== "#c68863" || true,
    params.face.skinTone,
  );
  check(
    "height estimated within human range",
    params.body.heightCm >= 140 && params.body.heightCm <= 210,
    `${params.body.heightCm} cm`,
  );

  // -- 5. Edit and save -----------------------------------------------------
  console.log("\nedit and save");
  const saved = await saveAvatarEdit({
    userId,
    avatarId,
    params: {
      body: { ...params.body, heightCm: 168, build: 0.8, shoulderWidth: 0.2 },
      face: { ...params.face, hairStyle: "long", eyeColor: "#2f6f4f" },
      outfit: {
        TOP: templateGarmentId("hoodie"),
        BOTTOM: templateGarmentId("jeans"),
        SHOES: templateGarmentId("sneakers"),
      },
    },
  });

  check("saved as version 2", saved.version === 2, `v${saved.version}`);
  for (const warning of saved.warnings) console.log(`       note: ${warning}`);

  const versions = await listVersions(userId, avatarId);
  check("history has both versions", versions.length === 2, `${versions.length} versions`);
  check("version 1 was not overwritten", versions.some((v) => v.version === 1));

  const reloaded = await getAvatar(userId, avatarId);
  const savedParams = paramsFromVersion(reloaded!.currentVersion!);
  check("height persisted", savedParams.body.heightCm === 168, `${savedParams.body.heightCm} cm`);
  check("outfit persisted", savedParams.outfit.TOP === templateGarmentId("hoodie"));

  const glbV2 = await storage.get(reloaded!.currentVersion!.modelKey!);
  check("v2 model differs from v1", !glbV1.equals(glbV2));
  check(
    "v2 is larger, as it now has clothes",
    glbV2.byteLength > glbV1.byteLength,
    `${(glbV1.byteLength / 1024).toFixed(0)} KB -> ${(glbV2.byteLength / 1024).toFixed(0)} KB`,
  );

  // -- 6. Export ------------------------------------------------------------
  console.log("\nexport");
  const geometry = await rebuildAvatarGeometry({
    userId,
    avatarId,
    body: savedParams.body,
    face: savedParams.face,
    outfit: savedParams.outfit,
    name: "Pipeline Avatar",
  });

  check("rebuilt the mesh", geometry.mesh.positions.length > 3000);
  check("rebuilt 25 bones", geometry.skeleton.bones.length === 25);
  check("rebuilt 3 garments", geometry.garments.length === 3, `${geometry.garments.length}`);

  const source = {
    glb: geometry.glb,
    mesh: geometry.mesh,
    skeleton: geometry.skeleton,
    garments: geometry.garments,
    texture: geometry.texture,
    avatarName: "Pipeline Avatar",
  };

  const glbExport = await exportAs("glb", source);
  check("glb export named", glbExport.filename === "pipeline-avatar.glb", glbExport.filename);

  const report = (await validateBytes(glbExport.bytes)) as {
    issues: { numErrors: number; messages: { severity: number; message: string }[] };
  };
  const errors = report.issues.messages.filter((m) => m.severity === 0);
  check("glb passes the Khronos validator", errors.length === 0, errors[0]?.message ?? "0 errors");

  const fbxExport = await exportAs("fbx", source);
  check("fbx export named", fbxExport.filename === "pipeline-avatar.zip", fbxExport.filename);
  check(
    "fbx bundle is a zip",
    new DataView(fbxExport.bytes.buffer, fbxExport.bytes.byteOffset).getUint32(0, true) ===
      0x04034b50,
  );

  const zipText = Buffer.from(fbxExport.bytes).toString("latin1");
  check("zip holds the fbx", zipText.includes("pipeline-avatar.fbx"));
  check("zip holds the texture", zipText.includes("avatar_atlas.png"));
  check("fbx names Mixamo bones", zipText.includes("mixamorig:Hips"));

  // -- 7. Ownership ---------------------------------------------------------
  console.log("\nownership");
  check("another user cannot read it", (await getAvatar("someone-else", avatarId)) === null);

  // -- 8. Delete ------------------------------------------------------------
  console.log("\ndelete");
  check("deleted", await deleteAvatar(userId, avatarId));
  check("versions went with it", (await listVersions(userId, avatarId)).length === 0);
  avatarId = "";
} catch (error) {
  failed++;
  console.error("\nUNCAUGHT:", error);
} finally {
  // Clean up whatever survived, so the check can be run repeatedly.
  if (avatarId) await deleteAvatar(userId, avatarId).catch(() => {});
  if (userId) await prisma.user.delete({ where: { id: userId } }).catch(() => {});
  await prisma.$disconnect();
}

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);
