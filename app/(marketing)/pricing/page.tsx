import type { Metadata } from "next";
import Link from "next/link";
import { Check, Minus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge, Divider, Eyebrow, Panel } from "@/components/ui/primitives";

export const metadata: Metadata = {
  title: "Pricing",
  description: "What Incarnatrun costs, and what is still being decided.",
};

/*
  PLAN/idea.md section 12 leaves monetisation open: free-tier limits, whether vendor
  cost is passed through as credits, or a flat subscription. Inventing prices
  here would put numbers in front of users that nobody has agreed to.

  So this page says what is true today, which is that the MVP is free while it
  is being built, and it names the plans that are being considered without
  pricing them. That is more useful than a plausible-looking table nobody can
  honour, and it gives the page something to become once the decision is made.
*/
export default function PricingPage() {
  return (
    <div className="mx-auto max-w-[1400px] px-4 py-16 sm:px-6">
      <div className="mb-12 max-w-2xl space-y-4">
        <Eyebrow>Pricing</Eyebrow>
        <h1 className="type-display text-[clamp(2.2rem,5vw,3.4rem)] text-chalk">
          Free while we build it.
        </h1>
        <p className="text-[1.0625rem] leading-relaxed text-mute">
          Incarnatrun is in its first phase. Everything below is available now at
          no cost, and there is no card to add. When paid plans arrive we will
          say so here first, and anything you have already made stays yours to
          download.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.1fr_1fr]">
        <Panel className="p-6">
          <div className="mb-5 flex items-center justify-between">
            <h2 className="type-display text-2xl text-chalk">Everything, now</h2>
            <Badge tone="good">Free</Badge>
          </div>

          <p className="mb-6 leading-relaxed text-mute">
            The full Phase 1 product. No generation limit while the engine runs
            on our own hardware rather than a metered API.
          </p>

          <Divider className="mb-6" />

          <ul className="mb-7 space-y-3">
            {[
              "Unlimited avatars from photos, both creation paths",
              "Full face and body editor, re-editable at any time",
              "Built-in wardrobe, plus your own clothes from a photo",
              "Upload your own 3D garments as OBJ or GLB",
              "GLB and FBX export with a Mixamo-compatible rig",
              "Version history on every avatar",
            ].map((item) => (
              <li key={item} className="flex gap-3 text-[0.9rem] text-mute">
                <Check className="mt-0.5 size-4 shrink-0 text-good" aria-hidden />
                {item}
              </li>
            ))}
          </ul>

          <Button asChild variant="primary" size="lg" className="w-full sm:w-auto">
            <Link href="/sign-up">Create an account</Link>
          </Button>
        </Panel>

        <Panel className="p-6">
          <div className="mb-5 flex items-center justify-between">
            <h2 className="type-display text-2xl text-chalk">Being decided</h2>
            <Badge tone="warn">Later</Badge>
          </div>

          <p className="mb-6 leading-relaxed text-mute">
            These are on the roadmap. We have not set prices, because we have not
            settled how generation is billed, and a number here that we later
            changed would be worse than no number.
          </p>

          <Divider className="mb-6" />

          <ul className="space-y-3">
            {[
              "Cartoon and stylised output modes",
              "Print-ready export: one watertight mesh, wall-thickness checked",
              "A Blender add-on that pulls your avatar in over the API",
              "AI reconstruction of a 3D garment from photos",
            ].map((item) => (
              <li key={item} className="flex gap-3 text-[0.9rem] text-faint">
                <Minus className="mt-0.5 size-4 shrink-0" aria-hidden />
                {item}
              </li>
            ))}
          </ul>
        </Panel>
      </div>

      <Panel className="mt-6 p-6">
        <h2 className="type-display mb-2 text-lg text-chalk">
          Will my avatars survive a pricing change?
        </h2>
        <p className="max-w-3xl leading-relaxed text-mute">
          Yes. Avatars are stored as parameters plus a standard glTF file, and
          export is not gated. Anything you have made can be downloaded as GLB or
          FBX and used wherever you like, whatever happens to the plans.
        </p>
      </Panel>
    </div>
  );
}
