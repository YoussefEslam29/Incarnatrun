/**
 * Export downloads.
 *
 * A route handler rather than a Server Action, because the response is a file:
 * actions return JSON, and streaming a 300 KB GLB through one only to rebuild
 * it as a Blob in the browser wastes the trip.
 *
 * Geometry is rebuilt from the stored parameters rather than read back from the
 * saved GLB, because FBX needs vertices, bones and weights, not a container.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { currentUserId } from "@/lib/auth";
import { rebuildAvatarGeometry } from "@/lib/avatars/service";
import { getAvatar, paramsFromVersion } from "@/lib/db/avatars";
import {
  exportAs,
  exportFormat,
  ExportNotAvailableError,
  UnknownExportFormatError,
} from "@/lib/export";

export const dynamic = "force-dynamic";
// Rebuilding geometry and writing an FBX takes longer than the default budget
// on a slow instance.
export const maxDuration = 60;

const requestSchema = z.object({
  avatarId: z.string().min(1),
  format: z.string().min(1),
  includeRig: z.boolean().optional(),
});

export async function POST(request: Request) {
  const userId = await currentUserId();
  if (!userId) {
    return NextResponse.json({ error: "Sign in to export an avatar." }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Expected a JSON body." }, { status: 400 });
  }

  const parsed = requestSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "That export request was not understood." },
      { status: 400 },
    );
  }

  const { avatarId, format, includeRig } = parsed.data;

  const entry = exportFormat(format);
  if (!entry) {
    return NextResponse.json({ error: new UnknownExportFormatError(format).message }, { status: 400 });
  }
  if (!entry.enabled) {
    // 501, not 400: the request is well formed and this format is a real one,
    // it is simply not built yet.
    return NextResponse.json(
      { error: new ExportNotAvailableError(format).message },
      { status: 501 },
    );
  }

  const avatar = await getAvatar(userId, avatarId);
  if (!avatar?.currentVersion) {
    return NextResponse.json({ error: "That avatar could not be found." }, { status: 404 });
  }

  try {
    const params = paramsFromVersion(avatar.currentVersion);

    const geometry = await rebuildAvatarGeometry({
      userId,
      avatarId,
      body: params.body,
      face: params.face,
      outfit: params.outfit,
      name: avatar.name,
    });

    const result = await exportAs(
      format,
      {
        glb: geometry.glb,
        mesh: geometry.mesh,
        skeleton: geometry.skeleton,
        garments: geometry.garments,
        texture: geometry.texture,
        avatarName: avatar.name,
      },
      { includeRig },
    );

    return new NextResponse(new Uint8Array(result.bytes), {
      headers: {
        "Content-Type": result.contentType,
        "Content-Length": String(result.bytes.byteLength),
        "Content-Disposition": `attachment; filename="${result.filename}"`,
        // Exports reflect the avatar's current state, which can change.
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("[export]", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "That avatar could not be exported. Please try again.",
      },
      { status: 500 },
    );
  }
}
