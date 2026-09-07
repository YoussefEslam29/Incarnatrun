/**
 * Serves objects held by the local storage driver.
 *
 * The hosted drivers hand out their own URLs, so this route exists for local
 * development. It still checks ownership, because a development route that
 * skips authorisation is exactly the sort of thing that survives to production.
 *
 * Every key is scoped to a row the requester owns. Keys are shaped
 * `avatars/<avatarId>/...` and `garments/<garmentId>/...`, so the owning row is
 * looked up and matched against the session before a single byte is read.
 */

import { NextResponse } from "next/server";
import { currentUserId } from "@/lib/auth";
import { prisma } from "@/lib/db/client";
import { getStorage, ObjectNotFoundError } from "@/lib/storage";

export const dynamic = "force-dynamic";

/** Content types by extension. Anything unlisted is served as a download. */
const CONTENT_TYPES: Record<string, string> = {
  glb: "model/gltf-binary",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  obj: "text/plain",
};

async function userOwnsKey(userId: string, key: string): Promise<boolean> {
  const [kind, id] = key.split("/");

  if (kind === "avatars" && id) {
    const count = await prisma.avatar.count({ where: { id, userId } });
    return count > 0;
  }

  if (kind === "garments" && id) {
    const count = await prisma.garment.count({ where: { id, userId } });
    return count > 0;
  }

  return false;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ key: string[] }> },
) {
  const { key: segments } = await params;
  const key = segments.map(decodeURIComponent).join("/");

  const userId = await currentUserId();
  if (!userId) {
    return NextResponse.json({ error: "Sign in to view this file." }, { status: 401 });
  }

  if (!(await userOwnsKey(userId, key))) {
    // 404 rather than 403: telling an unauthorised requester that a file exists
    // is itself information they should not have.
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  try {
    const data = await getStorage().get(key);
    const extension = key.split(".").pop()?.toLowerCase() ?? "";

    return new NextResponse(new Uint8Array(data), {
      headers: {
        "Content-Type": CONTENT_TYPES[extension] ?? "application/octet-stream",
        "Content-Length": String(data.byteLength),
        // Keys carry a version number, so a given key's contents never change.
        "Cache-Control": "private, max-age=31536000, immutable",
      },
    });
  } catch (error) {
    if (error instanceof ObjectNotFoundError) {
      return NextResponse.json({ error: "Not found." }, { status: 404 });
    }
    console.error("[storage]", error);
    return NextResponse.json({ error: "Could not read that file." }, { status: 500 });
  }
}
