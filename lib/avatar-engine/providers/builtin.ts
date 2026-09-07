/**
 * The built-in avatar engine.
 *
 * Generates a rigged, Mixamo-compatible GLB locally, with no vendor API and no
 * credentials. That is what lets the whole product be built, demonstrated and
 * shipped while the vendor decision in PLAN/idea.md section 12 is still open, and it
 * doubles as the reference definition of what any vendor adapter must return.
 */

import sharp from "sharp";
import { buildAvatarGlb, type GarmentLayer } from "../build-avatar-glb";
import { buildHumanoid } from "../geometry/humanoid";
import { buildSkeleton } from "../geometry/skeleton";
import { analysePhoto } from "../photo/analyse";
import { renderAvatarAtlasPng } from "../texture/atlas";
import { renderAvatarThumbnail } from "../thumbnail";
import {
  bodyParamsSchema,
  defaultFaceParams,
  faceParamsSchema,
  randomBodyParams,
  type BodyParams,
  type FaceParams,
} from "../params";
import {
  EngineInputError,
  type AvatarEngineProvider,
  type EngineResult,
  type GenerateInput,
  type RenderInput,
  type ResolvedGarment,
} from "../types";
import { garmentTemplate } from "../../clothing/templates";
import { importGarmentMesh } from "../../clothing/mesh-import";
import { fitGarmentToBody } from "../../clothing/fit";

/** Smallest usable upload. Below this there is nothing to read a face from. */
const MIN_DIMENSION = 96;

export class BuiltinAvatarEngine implements AvatarEngineProvider {
  readonly id = "builtin";
  readonly label = "Built-in engine";

  /** Always ready. It has no external dependency to be missing. */
  isConfigured(): boolean {
    return true;
  }

  async generate(input: GenerateInput): Promise<EngineResult> {
    const analysis = await analysePhoto(input.photo).catch((error: unknown) => {
      throw new EngineInputError(
        error instanceof Error ? error.message : "That image could not be read.",
      );
    });

    if (analysis.sourceWidth < MIN_DIMENSION || analysis.sourceHeight < MIN_DIMENSION) {
      throw new EngineInputError(
        `That image is only ${analysis.sourceWidth} by ${analysis.sourceHeight} pixels. Please upload one at least ${MIN_DIMENSION} pixels on each side.`,
      );
    }

    const warnings: string[] = [];
    if (!analysis.faceDetected) {
      warnings.push(
        "No face was found in that photo, so a default face was used. You can adjust it in the editor.",
      );
    }

    // Path A reads the body from the photo. Path B ignores it and attaches a
    // random pre-made body, which the user then edits, exactly as PLAN/idea.md
    // section 1 describes.
    let body: BodyParams;
    if (input.path === "FULL_BODY") {
      if (analysis.framing === "portrait") {
        warnings.push(
          "That looks like a head-and-shoulders photo, so the body is an estimate. Upload a full-body shot for a closer match.",
        );
      }
      body = bodyParamsSchema.parse({
        heightCm: analysis.estimatedHeightCm,
        build: analysis.estimatedBuild,
        chest: analysis.estimatedBuild,
        waist: analysis.estimatedBuild,
        hips: analysis.estimatedBuild,
      });
    } else {
      body = randomBodyParams(input.seed);
    }

    const face = faceParamsSchema.parse({
      skinTone: analysis.skinTone,
      hairColor: analysis.hairColor,
    });

    // Keep the square face crop: later re-renders reuse it so the user's face
    // survives every edit without re-uploading or re-analysing the photo.
    const faceCrop = analysis.faceDetected
      ? await sharp(input.photo).extract(analysis.faceCrop).png().toBuffer()
      : undefined;

    const result = await this.compose({
      body,
      face,
      garments: [],
      facePhoto: faceCrop,
      name: input.name,
    });

    return { ...result, faceCrop, warnings };
  }

  async render(input: RenderInput): Promise<EngineResult> {
    return this.compose(input);
  }

  /** Shared path: parameters in, GLB plus thumbnail out. */
  private async compose(input: {
    body: BodyParams;
    face: FaceParams;
    garments: ResolvedGarment[];
    facePhoto?: Buffer;
    name?: string;
  }): Promise<EngineResult> {
    const body = bodyParamsSchema.parse(input.body);
    const face = faceParamsSchema.parse(input.face ?? defaultFaceParams());

    const skeleton = buildSkeleton(body);
    const mesh = buildHumanoid(body, face, skeleton);
    const texture = await renderAvatarAtlasPng({ face, photo: input.facePhoto });

    const layers: GarmentLayer[] = [];
    const warnings: string[] = [];

    for (const garment of input.garments) {
      try {
        if (garment.source === "USER_MESH") {
          // PLAN/idea.md section 6, Option C: the user's own 3D garment file, fitted
          // and skinned onto this avatar's skeleton.
          if (!garment.meshFile) {
            warnings.push(`The file for "${garment.name}" is missing, so it was left off.`);
            continue;
          }

          const imported = importGarmentMesh(
            new Uint8Array(garment.meshFile),
            garment.meshFilename ?? garment.meshRef,
          );
          const fitted = fitGarmentToBody({
            garment: imported,
            slot: garment.slot,
            skeleton,
            body: mesh,
          });

          warnings.push(...fitted.warnings);
          layers.push({
            name: garment.name,
            mesh: fitted,
            texture: garment.texture ? new Uint8Array(garment.texture) : undefined,
            colorHex: garment.colorHex,
          });
          continue;
        }

        const template = garmentTemplate(garment.meshRef);
        if (!template) {
          warnings.push(`Could not load "${garment.name}", so it was left off.`);
          continue;
        }

        layers.push({
          name: garment.name,
          mesh: template.build({ body, skeleton }),
          texture: garment.texture ? new Uint8Array(garment.texture) : undefined,
          colorHex: garment.colorHex,
        });
      } catch (error) {
        // One bad garment must not cost the user their whole avatar. Leave it
        // off and say why.
        warnings.push(
          `Could not put on "${garment.name}": ${error instanceof Error ? error.message : "unknown error"}`,
        );
      }
    }

    const glb = buildAvatarGlb({
      mesh,
      skeleton,
      texture,
      garments: layers,
      name: input.name ?? "Avatar",
      extras: {
        generator: "incarnatrun",
        provider: this.id,
        heightCm: body.heightCm,
        // Recorded in the file so a downloaded GLB can be traced back to the
        // parameters that produced it.
        bodyParams: body,
        faceParams: face,
      },
    });

    const thumbnail = await renderAvatarThumbnail({
      layers: [
        { mesh, colorHex: face.skinTone },
        ...layers.map((l) => ({ mesh: l.mesh, colorHex: l.colorHex })),
      ],
      height: skeleton.height,
    });

    return {
      glb,
      thumbnail,
      texture,
      body,
      face,
      warnings,
      provider: this.id,
    };
  }
}
