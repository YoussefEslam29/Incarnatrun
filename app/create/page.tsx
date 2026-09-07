import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { databaseStatus } from "@/lib/db/client";
import { SiteHeader } from "@/components/site-header";
import { Eyebrow } from "@/components/ui/primitives";
import { CreateFlow } from "@/components/create/create-flow";
import { SetupNotice } from "@/components/setup-notice";

export const metadata: Metadata = {
  title: "New avatar",
  description: "Upload a photo and generate a rigged 3D avatar.",
};

export const dynamic = "force-dynamic";

export default async function CreatePage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/sign-in?next=/create");

  const status = await databaseStatus();

  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />

      <main id="main" className="mx-auto w-full max-w-[1100px] flex-1 px-4 py-10 sm:px-6">
        <div className="mb-8 space-y-3">
          <Eyebrow>New avatar</Eyebrow>
          <h1 className="type-display text-[clamp(1.9rem,4vw,2.8rem)] text-chalk">
            Start from a photo.
          </h1>
          <p className="max-w-xl leading-relaxed text-mute">
            Your photo is used to build the model and is never shown to anyone
            else. You can change everything about the result afterwards.
          </p>
        </div>

        {status.ok ? (
          <CreateFlow />
        ) : (
          <SetupNotice message={status.message ?? "The database is not reachable."} />
        )}
      </main>
    </div>
  );
}
