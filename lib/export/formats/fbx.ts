/**
 * FBX 7.4 export, ASCII, with a Mixamo-compatible skeleton and skin clusters.
 *
 * This is the file you upload to Mixamo. The bone names come straight from
 * MIXAMO_BONES, so Mixamo's auto-rigger recognises the skeleton and every
 * Mixamo animation retargets onto it without remapping. That is the whole point
 * of the "Blender-ready" promise in PLAN/idea.md section 8.
 *
 * Notable format differences from glTF, all of which are silent if missed:
 *
 * - FBX measures in centimetres, glTF in metres, so positions are scaled by 100.
 * - FBX's UV origin is bottom-left, glTF's is top-left, so V is flipped.
 * - A polygon's last vertex index is stored bitwise-negated, which is how the
 *   format marks where one polygon ends and the next begins.
 * - Cluster matrices are the bind pose: Transform is the mesh-to-bone matrix
 *   and TransformLink the bone's global bind matrix.
 *
 * The result is bundled into a zip alongside the texture, because a bare .fbx
 * cannot embed a PNG in ASCII form and would arrive with no skin. Mixamo
 * accepts a zip of FBX plus textures directly, and Blender resolves a texture
 * sitting next to the FBX that references it.
 */

import { MIXAMO_BONES, type Skeleton } from "../../avatar-engine/geometry/skeleton";
import type { SkinnedMesh } from "../../avatar-engine/geometry/mesh";
import { translationMat4 } from "../../avatar-engine/geometry/math";
import { createZip, type ZipEntry } from "../zip";
import { safeFilename } from "../filename";
import type { ExportOptions, ExportSource } from "../index";

/** glTF metres to FBX centimetres. */
const UNIT_SCALE = 100;

const TEXTURE_FILENAME = "avatar_atlas.png";

/** FBX object ids must be unique and stable within the file. */
const ID = {
  geometry: 1_000_000,
  meshModel: 2_000_000,
  material: 3_000_000,
  texture: 4_000_000,
  video: 5_000_000,
  skin: 6_000_000,
  bone: 7_000_000,
  cluster: 8_000_000,
  pose: 9_000_000,
};

function num(value: number): string {
  // FBX readers are unhappy with exponent notation from very small floats.
  if (!Number.isFinite(value)) return "0";
  if (Number.isInteger(value)) return value.toString();
  return value.toFixed(6).replace(/\.?0+$/, "") || "0";
}

/** Writes an FBX `*count { a: ... }` array, wrapped so lines stay readable. */
function array(values: ArrayLike<number>, indent: string, perLine = 12): string {
  if (values.length === 0) return `*0 {\n${indent}\ta: \n${indent}}`;

  const chunks: string[] = [];
  for (let i = 0; i < values.length; i += perLine) {
    const slice: string[] = [];
    for (let k = i; k < Math.min(i + perLine, values.length); k++) {
      slice.push(num(values[k]));
    }
    chunks.push(slice.join(","));
  }

  return `*${values.length} {\n${indent}\ta: ${chunks.join(`\n${indent}\t`)}\n${indent}}`;
}

interface FbxMeshInput {
  name: string;
  mesh: SkinnedMesh;
  colorHex: string;
  hasTexture: boolean;
}

function hexToRgb(hex: string): [number, number, number] {
  const value = hex.replace("#", "");
  return [
    parseInt(value.slice(0, 2), 16) / 255,
    parseInt(value.slice(2, 4), 16) / 255,
    parseInt(value.slice(4, 6), 16) / 255,
  ];
}

/**
 * Merges the body and every garment into one mesh.
 *
 * FBX supports several meshes sharing one skin, but every importer handles a
 * single skinned mesh well and only some handle the alternative. Materials are
 * kept per original mesh through a per-polygon material layer, so the parts
 * stay separately shaded.
 */
function mergeMeshes(inputs: FbxMeshInput[]): {
  positions: Float32Array;
  normals: Float32Array;
  uvs: Float32Array;
  joints: Uint8Array;
  weights: Float32Array;
  indices: Uint32Array;
  materialPerPolygon: Uint16Array;
} {
  const vertexCount = inputs.reduce((sum, i) => sum + i.mesh.positions.length / 3, 0);
  const indexCount = inputs.reduce((sum, i) => sum + i.mesh.indices.length, 0);

  const positions = new Float32Array(vertexCount * 3);
  const normals = new Float32Array(vertexCount * 3);
  const uvs = new Float32Array(vertexCount * 2);
  const joints = new Uint8Array(vertexCount * 4);
  const weights = new Float32Array(vertexCount * 4);
  const indices = new Uint32Array(indexCount);
  const materialPerPolygon = new Uint16Array(indexCount / 3);

  let vertexOffset = 0;
  let indexOffset = 0;
  let polygonOffset = 0;

  inputs.forEach((input, materialIndex) => {
    const { mesh } = input;
    const count = mesh.positions.length / 3;

    positions.set(mesh.positions, vertexOffset * 3);
    normals.set(mesh.normals, vertexOffset * 3);
    uvs.set(mesh.uvs, vertexOffset * 2);
    joints.set(mesh.joints, vertexOffset * 4);
    weights.set(mesh.weights, vertexOffset * 4);

    for (let i = 0; i < mesh.indices.length; i++) {
      indices[indexOffset + i] = mesh.indices[i] + vertexOffset;
    }
    materialPerPolygon.fill(
      materialIndex,
      polygonOffset,
      polygonOffset + mesh.indices.length / 3,
    );

    vertexOffset += count;
    indexOffset += mesh.indices.length;
    polygonOffset += mesh.indices.length / 3;
  });

  return { positions, normals, uvs, joints, weights, indices, materialPerPolygon };
}

export async function exportFbx(
  source: ExportSource,
  options: ExportOptions,
): Promise<Uint8Array> {
  if (!source.mesh || !source.skeleton) {
    throw new Error(
      "FBX export needs the avatar's mesh and skeleton, not just its GLB. Regenerate the avatar and try again.",
    );
  }

  const inputs: FbxMeshInput[] = [
    {
      name: "AvatarBody",
      mesh: source.mesh,
      colorHex: "#ffffff",
      hasTexture: Boolean(source.texture),
    },
    ...(source.garments ?? []).map((g) => ({
      name: g.name,
      mesh: g.mesh,
      colorHex: g.colorHex,
      hasTexture: false,
    })),
  ];

  const fbx = writeFbxAscii(inputs, source.skeleton, source.avatarName, {
    includeRig: options.includeRig !== false,
    hasTexture: Boolean(source.texture),
  });

  const stem = safeFilename(options.filename ?? source.avatarName);
  const entries: ZipEntry[] = [{ name: `${stem}.fbx`, data: new TextEncoder().encode(fbx) }];

  if (source.texture) {
    entries.push({ name: TEXTURE_FILENAME, data: source.texture });
  }

  return createZip(entries);
}

function writeFbxAscii(
  inputs: FbxMeshInput[],
  skeleton: Skeleton,
  avatarName: string,
  flags: { includeRig: boolean; hasTexture: boolean },
): string {
  const merged = mergeMeshes(inputs);
  const vertexCount = merged.positions.length / 3;
  const polygonCount = merged.indices.length / 3;

  // --- Vertices, in centimetres -------------------------------------------
  const vertices = new Float64Array(vertexCount * 3);
  for (let i = 0; i < vertexCount * 3; i++) {
    vertices[i] = merged.positions[i] * UNIT_SCALE;
  }

  // --- Polygon vertex indices ---------------------------------------------
  // The final index of each polygon is bitwise-negated to close it.
  const polygonVertexIndex = new Int32Array(merged.indices.length);
  for (let p = 0; p < polygonCount; p++) {
    polygonVertexIndex[p * 3] = merged.indices[p * 3];
    polygonVertexIndex[p * 3 + 1] = merged.indices[p * 3 + 1];
    polygonVertexIndex[p * 3 + 2] = ~merged.indices[p * 3 + 2];
  }

  // --- UVs, with V flipped for FBX's bottom-left origin --------------------
  const uvs = new Float64Array(vertexCount * 2);
  for (let v = 0; v < vertexCount; v++) {
    uvs[v * 2] = merged.uvs[v * 2];
    uvs[v * 2 + 1] = 1 - merged.uvs[v * 2 + 1];
  }

  const timestamp = new Date();
  const lines: string[] = [];

  lines.push(
    `; FBX 7.4.0 project file`,
    `; Generated by Incarnatrun`,
    `; ----------------------------------------------------`,
    ``,
    `FBXHeaderExtension:  {`,
    `\tFBXHeaderVersion: 1003`,
    `\tFBXVersion: 7400`,
    `\tCreationTimeStamp:  {`,
    `\t\tVersion: 1000`,
    `\t\tYear: ${timestamp.getUTCFullYear()}`,
    `\t\tMonth: ${timestamp.getUTCMonth() + 1}`,
    `\t\tDay: ${timestamp.getUTCDate()}`,
    `\t\tHour: ${timestamp.getUTCHours()}`,
    `\t\tMinute: ${timestamp.getUTCMinutes()}`,
    `\t\tSecond: ${timestamp.getUTCSeconds()}`,
    `\t\tMillisecond: 0`,
    `\t}`,
    `\tCreator: "Incarnatrun"`,
    `}`,
    `GlobalSettings:  {`,
    `\tVersion: 1000`,
    `\tProperties70:  {`,
    // Y up, Z front, X right: the same handedness as glTF, so nothing is
    // mirrored on import.
    `\t\tP: "UpAxis", "int", "Integer", "",1`,
    `\t\tP: "UpAxisSign", "int", "Integer", "",1`,
    `\t\tP: "FrontAxis", "int", "Integer", "",2`,
    `\t\tP: "FrontAxisSign", "int", "Integer", "",1`,
    `\t\tP: "CoordAxis", "int", "Integer", "",0`,
    `\t\tP: "CoordAxisSign", "int", "Integer", "",1`,
    `\t\tP: "UnitScaleFactor", "double", "Number", "",1`,
    `\t\tP: "OriginalUnitScaleFactor", "double", "Number", "",1`,
    `\t}`,
    `}`,
  );

  const boneCount = flags.includeRig ? MIXAMO_BONES.length : 0;
  const modelCount = 1 + boneCount;
  const deformerCount = flags.includeRig ? 1 + boneCount : 0;

  lines.push(
    `Definitions:  {`,
    `\tVersion: 100`,
    `\tCount: ${1 + modelCount + inputs.length + deformerCount + (flags.hasTexture ? 2 : 0) + 1}`,
    `\tObjectType: "GlobalSettings" {`,
    `\t\tCount: 1`,
    `\t}`,
    `\tObjectType: "Geometry" {`,
    `\t\tCount: 1`,
    `\t}`,
    `\tObjectType: "Model" {`,
    `\t\tCount: ${modelCount}`,
    `\t}`,
    `\tObjectType: "Material" {`,
    `\t\tCount: ${inputs.length}`,
    `\t}`,
  );

  if (flags.hasTexture) {
    lines.push(
      `\tObjectType: "Texture" {`,
      `\t\tCount: 1`,
      `\t}`,
      `\tObjectType: "Video" {`,
      `\t\tCount: 1`,
      `\t}`,
    );
  }

  if (flags.includeRig) {
    lines.push(
      `\tObjectType: "Deformer" {`,
      `\t\tCount: ${deformerCount}`,
      `\t}`,
      `\tObjectType: "Pose" {`,
      `\t\tCount: 1`,
      `\t}`,
    );
  }

  lines.push(`}`, `Objects:  {`);

  // --- Geometry ------------------------------------------------------------
  lines.push(
    `\tGeometry: ${ID.geometry}, "Geometry::AvatarBody", "Mesh" {`,
    `\t\tVertices: ${array(vertices, "\t\t", 9)}`,
    `\t\tPolygonVertexIndex: ${array(polygonVertexIndex, "\t\t", 12)}`,
    `\t\tGeometryVersion: 124`,
    `\t\tLayerElementNormal: 0 {`,
    `\t\t\tVersion: 102`,
    `\t\t\tName: ""`,
    `\t\t\tMappingInformationType: "ByVertice"`,
    `\t\t\tReferenceInformationType: "Direct"`,
    `\t\t\tNormals: ${array(merged.normals, "\t\t\t", 9)}`,
    `\t\t}`,
    `\t\tLayerElementUV: 0 {`,
    `\t\t\tVersion: 101`,
    `\t\t\tName: "UVMap"`,
    `\t\t\tMappingInformationType: "ByPolygonVertex"`,
    `\t\t\tReferenceInformationType: "IndexToDirect"`,
    `\t\t\tUV: ${array(uvs, "\t\t\t", 10)}`,
    `\t\t\tUVIndex: ${array(merged.indices, "\t\t\t", 12)}`,
    `\t\t}`,
    `\t\tLayerElementMaterial: 0 {`,
    `\t\t\tVersion: 101`,
    `\t\t\tName: ""`,
    // One material index per polygon keeps the body and each garment shaded
    // separately even though they are merged into a single mesh.
    `\t\t\tMappingInformationType: "ByPolygon"`,
    `\t\t\tReferenceInformationType: "IndexToDirect"`,
    `\t\t\tMaterials: ${array(merged.materialPerPolygon, "\t\t\t", 20)}`,
    `\t\t}`,
    `\t\tLayer: 0 {`,
    `\t\t\tVersion: 100`,
    `\t\t\tLayerElement:  {`,
    `\t\t\t\tType: "LayerElementNormal"`,
    `\t\t\t\tTypedIndex: 0`,
    `\t\t\t}`,
    `\t\t\tLayerElement:  {`,
    `\t\t\t\tType: "LayerElementUV"`,
    `\t\t\t\tTypedIndex: 0`,
    `\t\t\t}`,
    `\t\t\tLayerElement:  {`,
    `\t\t\t\tType: "LayerElementMaterial"`,
    `\t\t\t\tTypedIndex: 0`,
    `\t\t\t}`,
    `\t\t}`,
    `\t}`,
  );

  // --- Mesh model ----------------------------------------------------------
  lines.push(
    `\tModel: ${ID.meshModel}, "Model::${avatarName}", "Mesh" {`,
    `\t\tVersion: 232`,
    `\t\tProperties70:  {`,
    `\t\t\tP: "InheritType", "enum", "", "",1`,
    `\t\t}`,
    `\t\tShading: T`,
    `\t\tCulling: "CullingOff"`,
    `\t}`,
  );

  // --- Bone models ---------------------------------------------------------
  if (flags.includeRig) {
    MIXAMO_BONES.forEach((bone, index) => {
      const [x, y, z] = skeleton.bones[index].localTranslation;
      lines.push(
        `\tModel: ${ID.bone + index}, "Model::${bone.name}", "LimbNode" {`,
        `\t\tVersion: 232`,
        `\t\tProperties70:  {`,
        `\t\t\tP: "InheritType", "enum", "", "",1`,
        `\t\t\tP: "Lcl Translation", "Lcl Translation", "", "A",${num(x * UNIT_SCALE)},${num(y * UNIT_SCALE)},${num(z * UNIT_SCALE)}`,
        `\t\t}`,
        `\t\tShading: T`,
        `\t\tCulling: "CullingOff"`,
        `\t}`,
      );
    });
  }

  // --- Materials -----------------------------------------------------------
  inputs.forEach((input, index) => {
    const [r, g, b] = hexToRgb(input.colorHex);
    lines.push(
      `\tMaterial: ${ID.material + index}, "Material::${input.name}", "" {`,
      `\t\tVersion: 102`,
      `\t\tShadingModel: "phong"`,
      `\t\tMultiLayer: 0`,
      `\t\tProperties70:  {`,
      `\t\t\tP: "DiffuseColor", "Color", "", "A",${num(r)},${num(g)},${num(b)}`,
      `\t\t\tP: "SpecularColor", "Color", "", "A",0.05,0.05,0.05`,
      `\t\t\tP: "Shininess", "double", "Number", "",8`,
      `\t\t}`,
      `\t}`,
    );
  });

  // --- Texture -------------------------------------------------------------
  if (flags.hasTexture) {
    lines.push(
      `\tVideo: ${ID.video}, "Video::AvatarAtlas", "Clip" {`,
      `\t\tType: "Clip"`,
      `\t\tProperties70:  {`,
      `\t\t\tP: "Path", "KString", "XRefUrl", "", "${TEXTURE_FILENAME}"`,
      `\t\t}`,
      `\t\tUseMipMap: 0`,
      `\t\tFilename: "${TEXTURE_FILENAME}"`,
      `\t\tRelativeFilename: "${TEXTURE_FILENAME}"`,
      `\t}`,
      `\tTexture: ${ID.texture}, "Texture::AvatarAtlas", "" {`,
      `\t\tType: "TextureVideoClip"`,
      `\t\tVersion: 202`,
      `\t\tTextureName: "Texture::AvatarAtlas"`,
      `\t\tProperties70:  {`,
      `\t\t\tP: "UVSet", "KString", "", "", "UVMap"`,
      `\t\t\tP: "UseMaterial", "bool", "", "",1`,
      `\t\t}`,
      `\t\tMedia: "Video::AvatarAtlas"`,
      `\t\tFileName: "${TEXTURE_FILENAME}"`,
      `\t\tRelativeFilename: "${TEXTURE_FILENAME}"`,
      `\t\tModelUVTranslation: 0,0`,
      `\t\tModelUVScaling: 1,1`,
      `\t\tTexture_Alpha_Source: "None"`,
      `\t\tCropping: 0,0,0,0`,
      `\t}`,
    );
  }

  // --- Skin and clusters ---------------------------------------------------
  if (flags.includeRig) {
    lines.push(
      `\tDeformer: ${ID.skin}, "Deformer::Skin", "Skin" {`,
      `\t\tVersion: 101`,
      `\t\tLink_DeformAcuracy: 50`,
      `\t}`,
    );

    for (let bone = 0; bone < MIXAMO_BONES.length; bone++) {
      // Gather the vertices this bone actually influences. Writing every vertex
      // with a zero weight would multiply the file size by the bone count.
      const indexes: number[] = [];
      const boneWeights: number[] = [];

      for (let v = 0; v < vertexCount; v++) {
        for (let k = 0; k < 4; k++) {
          if (merged.joints[v * 4 + k] === bone && merged.weights[v * 4 + k] > 0) {
            indexes.push(v);
            boneWeights.push(merged.weights[v * 4 + k]);
            break;
          }
        }
      }

      const world = skeleton.bones[bone].worldPosition;
      // Transform is the mesh-to-bone bind matrix; the mesh's own transform is
      // identity, so it is just the inverse of the bone's global bind pose.
      const transform = translationMat4(
        -world[0] * UNIT_SCALE,
        -world[1] * UNIT_SCALE,
        -world[2] * UNIT_SCALE,
      );
      const transformLink = translationMat4(
        world[0] * UNIT_SCALE,
        world[1] * UNIT_SCALE,
        world[2] * UNIT_SCALE,
      );

      lines.push(
        `\tDeformer: ${ID.cluster + bone}, "SubDeformer::Cluster ${MIXAMO_BONES[bone].name}", "Cluster" {`,
        `\t\tVersion: 100`,
        `\t\tUserData: "", ""`,
        `\t\tIndexes: ${array(indexes, "\t\t", 20)}`,
        `\t\tWeights: ${array(boneWeights, "\t\t", 12)}`,
        `\t\tTransform: ${array(transform, "\t\t", 4)}`,
        `\t\tTransformLink: ${array(transformLink, "\t\t", 4)}`,
        `\t}`,
      );
    }

    // --- Bind pose ---------------------------------------------------------
    lines.push(
      `\tPose: ${ID.pose}, "Pose::BIND_POSES", "BindPose" {`,
      `\t\tType: "BindPose"`,
      `\t\tVersion: 100`,
      `\t\tNbPoseNodes: ${MIXAMO_BONES.length + 1}`,
      `\t\tPoseNode:  {`,
      `\t\t\tNode: ${ID.meshModel}`,
      `\t\t\tMatrix: ${array(translationMat4(0, 0, 0), "\t\t\t", 4)}`,
      `\t\t}`,
    );

    MIXAMO_BONES.forEach((_, index) => {
      const world = skeleton.bones[index].worldPosition;
      lines.push(
        `\t\tPoseNode:  {`,
        `\t\t\tNode: ${ID.bone + index}`,
        `\t\t\tMatrix: ${array(
          translationMat4(world[0] * UNIT_SCALE, world[1] * UNIT_SCALE, world[2] * UNIT_SCALE),
          "\t\t\t",
          4,
        )}`,
        `\t\t}`,
      );
    });

    lines.push(`\t}`);
  }

  lines.push(`}`);

  // --- Connections ---------------------------------------------------------
  lines.push(`Connections:  {`);
  lines.push(`\t;Model::${avatarName}, Model::RootNode`);
  lines.push(`\tC: "OO",${ID.meshModel},0`);
  lines.push(`\t;Geometry::AvatarBody, Model::${avatarName}`);
  lines.push(`\tC: "OO",${ID.geometry},${ID.meshModel}`);

  inputs.forEach((_, index) => {
    lines.push(`\tC: "OO",${ID.material + index},${ID.meshModel}`);
  });

  if (flags.hasTexture) {
    lines.push(`\tC: "OO",${ID.video},${ID.texture}`);
    // The texture drives the first material's diffuse channel, which is the
    // body's; garments keep their flat colours.
    lines.push(`\tC: "OP",${ID.texture},${ID.material},"DiffuseColor"`);
  }

  if (flags.includeRig) {
    // Root bone hangs off the scene root, not off the mesh.
    lines.push(`\tC: "OO",${ID.bone},0`);

    MIXAMO_BONES.forEach((bone, index) => {
      if (bone.parent === -1) return;
      lines.push(`\tC: "OO",${ID.bone + index},${ID.bone + bone.parent}`);
    });

    lines.push(`\tC: "OO",${ID.skin},${ID.geometry}`);

    MIXAMO_BONES.forEach((_, index) => {
      lines.push(`\tC: "OO",${ID.cluster + index},${ID.skin}`);
      lines.push(`\tC: "OO",${ID.bone + index},${ID.cluster + index}`);
    });
  }

  lines.push(`}`, ``);

  return lines.join("\n");
}
