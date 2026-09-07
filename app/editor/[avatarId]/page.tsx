import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getAvatar, listVersions, paramsFromVersion } from "@/lib/db/avatars";
import { wardrobeForSlot } from "@/lib/db/garments";
import { GARMENT_SLOTS } from "@/lib/avatar-engine/params";
import { SiteHeader } from "@/components/site-header";
import { EditorShell } from "@/components/editor/editor-shell";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ avatarId: string }>;
}): Promise<Metadata> {
  const session = await auth();
  if (!session?.user?.id) return { title: "Editor" };

  const { avatarId } = await params;
  const avatar = await getAvatar(session.user.id, avatarId);

  return { title: avatar ? `Editing ${avatar.name}` : "Editor" };
}

export default async function EditorPage({
  params,
}: {
  params: Promise<{ avatarId: string }>;
}) {
  const { avatarId } = await params;

  const session = await auth();
  if (!session?.user?.id) redirect(`/sign-in?next=/editor/${avatarId}`);

  const avatar = await getAvatar(session.user.id, avatarId);
  if (!avatar) notFound();

  const [versions, wardrobe] = await Promise.all([
    listVersions(session.user.id, avatarId),
    // Every slot's options in one pass, so the wardrobe tab has no loading
    // state to flicker through when the user switches slots.
    Promise.all(
      GARMENT_SLOTS.map(async (slot) => [slot, await wardrobeForSlot(session.user!.id!, slot)] as const),
    ),
  ]);

  const initialParams = avatar.currentVersion
    ? paramsFromVersion(avatar.currentVersion)
    : undefined;

  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />

      <main id="main" className="flex-1">
        <EditorShell
          avatarId={avatar.id}
          name={avatar.name}
          status={avatar.status}
          failureReason={avatar.failureReason}
          modelUrl={
            avatar.currentVersion?.modelKey
              ? `/api/storage/${avatar.currentVersion.modelKey}`
              : null
          }
          version={avatar.currentVersion?.version ?? 1}
          initialParams={initialParams}
          wardrobe={Object.fromEntries(wardrobe)}
          versions={versions.map((v) => ({
            id: v.id,
            version: v.version,
            createdAt: v.createdAt.toISOString(),
          }))}
        />
      </main>
    </div>
  );
}
