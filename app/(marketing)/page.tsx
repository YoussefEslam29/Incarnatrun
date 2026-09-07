import Link from "next/link";
import { ArrowRight, Boxes, Shirt, Sliders, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge, DataRow, Divider, Eyebrow, Panel, PanelHeader } from "@/components/ui/primitives";
import { HeroViewport } from "@/components/marketing/hero-viewport";
import { MIXAMO_BONES } from "@/lib/avatar-engine/geometry/skeleton";
import { GARMENT_TEMPLATES } from "@/lib/clothing/templates";
import { EXPORT_FORMATS } from "@/lib/export";

export default function LandingPage() {
  return (
    <>
      {/* ---------------------------------------------------------------- */}
      {/* Hero: the product's own viewport, running the real engine output. */}
      {/* ---------------------------------------------------------------- */}
      <section className="relative border-b border-line">
        <div className="bg-grid absolute inset-0 [mask-image:radial-gradient(ellipse_at_50%_0%,black,transparent_75%)]" />

        <div className="relative mx-auto grid max-w-[1400px] gap-10 px-4 py-14 sm:px-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:items-center lg:py-20">
          <div className="animate-rise space-y-7">
            <Eyebrow>One photo → rigged model</Eyebrow>

            <h1 className="type-display text-[clamp(2.6rem,7vw,4.6rem)] text-chalk">
              You, with a
              <br />
              <span className="text-gradient">bind pose.</span>
            </h1>

            <p className="max-w-lg text-[1.0625rem] leading-relaxed text-mute">
              Upload a photo. Get back a 3D avatar with clean topology, UVs, and a
              Mixamo-named skeleton. Adjust the face, body and clothes in the
              browser, then take it into Blender.
            </p>

            <div className="flex flex-wrap items-center gap-3">
              <Button asChild variant="primary" size="lg">
                <Link href="/create">
                  Build your avatar
                  <ArrowRight aria-hidden />
                </Link>
              </Button>
              <Button asChild variant="outline" size="lg">
                <Link href="#how">See the pipeline</Link>
              </Button>
            </div>

            {/*
              A properties block, not a stat row. Every value here is real and
              comes from the same modules that generate the file.
            */}
            <Panel className="max-w-md">
              <PanelHeader label="Output" />
              <div className="divide-y divide-line px-3 py-1">
                <DataRow label="Rig" value={`mixamorig · ${MIXAMO_BONES.length} bones`} />
                <DataRow label="Pose" value="T-pose, Y-up, metres" />
                <DataRow
                  label="Formats"
                  value={EXPORT_FORMATS.filter((f) => f.enabled)
                    .map((f) => f.extension)
                    .join(" · ")}
                />
                <DataRow label="Wardrobe" value={`${GARMENT_TEMPLATES.length} garments`} />
              </div>
            </Panel>
          </div>

          <HeroViewport />
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      {/* Pipeline. Numbered because it genuinely is an ordered sequence.   */}
      {/* ---------------------------------------------------------------- */}
      <section id="how" className="border-b border-line">
        <div className="mx-auto max-w-[1400px] px-4 py-16 sm:px-6">
          <div className="mb-10 max-w-2xl space-y-4">
            <Eyebrow>The pipeline</Eyebrow>
            <h2 className="type-display text-[clamp(1.9rem,4vw,2.8rem)] text-chalk">
              Four steps, and you own the file.
            </h2>
          </div>

          <ol className="grid gap-px overflow-hidden rounded-[4px] border border-line bg-line md:grid-cols-2 xl:grid-cols-4">
            <Step
              index={1}
              icon={<Upload aria-hidden />}
              title="Upload a photo"
              body="A full-body shot builds the whole figure. A selfie reconstructs the face and attaches a body template you can then reshape."
            />
            <Step
              index={2}
              icon={<Boxes aria-hidden />}
              title="Generate"
              body="The face is located, skin and hair are sampled, and a parametric humanoid is built around a Mixamo-named skeleton with real skin weights."
            />
            <Step
              index={3}
              icon={<Sliders aria-hidden />}
              title="Edit"
              body="Height, build, proportions, jaw, cheeks, nose, eyes, mouth, hair. Every change re-renders live in the viewport."
            />
            <Step
              index={4}
              icon={<Shirt aria-hidden />}
              title="Dress and export"
              body="Pick from the wardrobe, or upload a photo of your own clothes or a 3D garment file. Then download GLB or FBX."
            />
          </ol>
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      {/* Two paths                                                        */}
      {/* ---------------------------------------------------------------- */}
      <section id="editor" className="border-b border-line">
        <div className="mx-auto grid max-w-[1400px] gap-10 px-4 py-16 sm:px-6 lg:grid-cols-2">
          <PathCard
            tag="Path A"
            title="Full body from one photo"
            body="Stand back, take a full-length shot, and the height and proportions come from the image. The result lands close, and every slider is still yours to move."
            points={[
              "Height estimated from head-to-body proportion",
              "Build read from the subject's silhouette",
              "Skin and hair colour sampled from the photo",
            ]}
          />
          <PathCard
            tag="Path B"
            title="Face only, body you choose"
            body="Only have a selfie? The face is reconstructed and attached to one of six body templates, picked deterministically so it never changes under you."
            points={[
              "Six templates: athletic, slim, average, curvy, broad, petite",
              "Same body sliders as Path A once it is generated",
              "Regenerating gives the same body, not a new one",
            ]}
          />
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      {/* Export                                                           */}
      {/* ---------------------------------------------------------------- */}
      <section id="export" className="border-b border-line">
        <div className="mx-auto grid max-w-[1400px] gap-10 px-4 py-16 sm:px-6 lg:grid-cols-[1fr_1.2fr]">
          <div className="space-y-4">
            <Eyebrow>Export</Eyebrow>
            <h2 className="type-display text-[clamp(1.9rem,4vw,2.8rem)] text-chalk">
              A file, not a lock-in.
            </h2>
            <p className="max-w-md leading-relaxed text-mute">
              Every avatar exports with its rig intact and bone names Mixamo
              recognises. Drop the file into Blender, or upload it to Mixamo and
              have it walking in a minute.
            </p>
          </div>

          <div className="space-y-3">
            {EXPORT_FORMATS.map((format) => (
              // A format that is not built yet is marked by its badge and by
              // the reason it gives, never by dimming it. Fading the card with
              // opacity drags the text under the contrast floor, which is what
              // an audit of the first version caught.
              <Panel
                key={format.id}
                className={format.enabled ? "" : "border-dashed bg-transparent"}
              >
                <div className="flex flex-wrap items-start justify-between gap-3 p-4">
                  <div className="min-w-0 space-y-1.5">
                    <div className="flex items-center gap-2">
                      <h3 className="type-display text-lg text-chalk">{format.label}</h3>
                      <Badge tone={format.enabled ? "accent" : "neutral"}>
                        .{format.extension}
                      </Badge>
                      {format.rigged && <Badge tone="good">rigged</Badge>}
                    </div>
                    <p className="text-[0.8125rem] leading-relaxed text-mute">
                      {format.enabled ? format.description : format.unavailableReason}
                    </p>
                  </div>
                  {!format.enabled && <Badge tone="warn">Phase 2</Badge>}
                </div>
              </Panel>
            ))}
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      {/* Close                                                            */}
      {/* ---------------------------------------------------------------- */}
      <section className="relative overflow-hidden">
        <div className="bg-grid-fine absolute inset-0 [mask-image:radial-gradient(ellipse_at_50%_50%,black,transparent_70%)]" />
        <div className="relative mx-auto max-w-[1400px] px-4 py-20 text-center sm:px-6">
          <h2 className="type-display mx-auto max-w-2xl text-[clamp(2rem,5vw,3.2rem)] text-chalk">
            Your first avatar takes about a minute.
          </h2>
          <p className="mx-auto mt-4 max-w-md leading-relaxed text-mute">
            No card, no plugin, no install. A photo and a browser.
          </p>
          <div className="mt-7">
            <Button asChild variant="primary" size="lg">
              <Link href="/sign-up">
                Start free
                <ArrowRight aria-hidden />
              </Link>
            </Button>
          </div>
        </div>
      </section>
    </>
  );
}

function Step({
  index,
  icon,
  title,
  body,
}: {
  index: number;
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <li className="bg-panel p-5">
      <div className="mb-4 flex items-center justify-between">
        <span className="grid size-8 place-items-center rounded-[3px] border border-line-bright text-mute [&_svg]:size-4">
          {icon}
        </span>
        <span className="font-mono text-[0.6875rem] tracking-[0.14em] text-faint">
          0{index}
        </span>
      </div>
      <h3 className="type-display mb-2 text-[1.05rem] text-chalk">{title}</h3>
      <p className="text-[0.8125rem] leading-relaxed text-mute">{body}</p>
    </li>
  );
}

function PathCard({
  tag,
  title,
  body,
  points,
}: {
  tag: string;
  title: string;
  body: string;
  points: string[];
}) {
  return (
    <Panel className="flex flex-col p-6">
      <Badge tone="accent" className="mb-4 self-start">
        {tag}
      </Badge>
      <h3 className="type-display mb-3 text-[clamp(1.4rem,2.6vw,1.9rem)] text-chalk">{title}</h3>
      <p className="mb-5 leading-relaxed text-mute">{body}</p>
      <Divider className="mb-5" />
      <ul className="space-y-2.5">
        {points.map((point) => (
          <li key={point} className="flex gap-3 text-[0.8125rem] text-mute">
            <span className="mt-[0.55em] size-1 shrink-0 rounded-full bg-beam" aria-hidden />
            {point}
          </li>
        ))}
      </ul>
    </Panel>
  );
}
