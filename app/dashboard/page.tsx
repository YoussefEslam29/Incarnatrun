import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Plus, Sparkles } from "lucide-react";
import { auth } from "@/lib/auth";
import { listAvatars } from "@/lib/db/avatars";
import { databaseStatus } from "@/lib/db/client";
import { SiteHeader } from "@/components/site-header";
import { Button } from "@/components/ui/button";
import { Badge, Eyebrow, Panel } from "@/components/ui/primitives";
import { AvatarCardMenu } from "@/components/dashboard/avatar-card-menu";
import { SetupNotice } from "@/components/setup-notice";
import { formatRelative } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Your avatars",
  description: "Every avatar you have made, ready to open and keep editing.",
};

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/sign-in?next=/dashboard");

  // Check the database before querying it, so a missing DATABASE_URL produces
  // setup instructions rather than an error boundary.
  const status = await databaseStatus();

  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />

      <main id="main" className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-10 sm:px-6">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div className="space-y-3">
            <Eyebrow>Your avatars</Eyebrow>
            <h1 className="type-display text-[clamp(1.9rem,4vw,2.8rem)] text-chalk">
              {session.user.name?.trim()
                ? `${session.user.name.split(" ")[0]}'s models`
                : "Your models"}
            </h1>
          </div>

          <Button asChild variant="primary">
            <Link href="/create">
              <Plus aria-hidden />
              New avatar
            </Link>
          </Button>
        </div>

        {!status.ok ? (
          <SetupNotice message={status.message ?? "The database is not reachable."} />
        ) : (
          <AvatarGrid userId={session.user.id} />
        )}
      </main>
    </div>
  );
}

async function AvatarGrid({ userId }: { userId: string }) {
  const avatars = await listAvatars(userId);

  if (avatars.length === 0) {
    return (
      <Panel className="grid place-items-center px-6 py-20 text-center">
        <div className="max-w-sm space-y-4">
          <span className="mx-auto grid size-11 place-items-center rounded-[4px] border border-line-bright text-beam">
            <Sparkles className="size-5" aria-hidden />
          </span>
          <h2 className="type-display text-xl text-chalk">Nothing here yet</h2>
          <p className="text-[0.875rem] leading-relaxed text-mute">
            Upload a photo and the first avatar takes about a minute. You can keep
            editing it afterwards, as many times as you like.
          </p>
          <Button asChild variant="primary">
            <Link href="/create">
              <Plus aria-hidden />
              Build your first avatar
            </Link>
          </Button>
        </div>
      </Panel>
    );
  }

  return (
    <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {avatars.map((avatar) => {
        const thumbnail = avatar.currentVersion?.thumbnailKey;
        const failed = avatar.status === "FAILED";

        return (
          <li key={avatar.id}>
            <Panel className="group h-full overflow-hidden">
              <Link
                href={`/editor/${avatar.id}`}
                className="block focus-visible:outline-none"
                aria-label={`Open ${avatar.name} in the editor`}
              >
                <div className="bg-grid-fine relative aspect-square border-b border-line bg-void">
                  {thumbnail && !failed ? (
                    <Image
                      src={`/api/storage/${thumbnail}`}
                      alt=""
                      fill
                      sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
                      className="object-contain transition-transform duration-500 group-hover:scale-[1.03]"
                      unoptimized
                    />
                  ) : (
                    <div className="grid h-full place-items-center px-4 text-center">
                      <p className="type-data">
                        {failed ? "Generation failed" : "No preview"}
                      </p>
                    </div>
                  )}

                  {failed && (
                    <span className="absolute left-2 top-2">
                      <Badge tone="bad">Failed</Badge>
                    </span>
                  )}
                </div>
              </Link>

              <div className="flex items-start justify-between gap-2 p-3">
                <div className="min-w-0">
                  <Link
                    href={`/editor/${avatar.id}`}
                    className="block truncate text-[0.9rem] font-medium text-chalk hover:text-beam"
                  >
                    {avatar.name}
                  </Link>
                  <p className="type-data mt-1 normal-case tracking-normal">
                    {avatar.path === "FULL_BODY" ? "Full body" : "Face only"}
                    {" · v"}
                    {avatar.currentVersion?.version ?? 1}
                    {" · "}
                    {formatRelative(avatar.updatedAt)}
                  </p>
                </div>

                <AvatarCardMenu id={avatar.id} name={avatar.name} />
              </div>

              {failed && avatar.failureReason && (
                <p className="border-t border-line px-3 py-2 text-[0.75rem] leading-relaxed text-bad">
                  {avatar.failureReason}
                </p>
              )}
            </Panel>
          </li>
        );
      })}
    </ul>
  );
}
