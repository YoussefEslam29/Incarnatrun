"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Boxes, Camera, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Badge,
  Field,
  Input,
  Panel,
  PanelHeader,
  SelectCard,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Tooltip,
} from "@/components/ui/primitives";
import { notify } from "@/components/ui/toaster";
import {
  createMeshGarmentAction,
  createPhotoGarmentAction,
  deleteGarmentAction,
} from "@/server-actions/garments";
import { GARMENT_SLOTS, type GarmentSlotId, type Outfit } from "@/lib/avatar-engine/params";
import { GARMENT_TEMPLATES } from "@/lib/clothing/templates";

export interface WardrobeItem {
  id: string;
  name: string;
  slot: GarmentSlotId;
  source: string;
  colorHex: string;
  custom: boolean;
}

export type WardrobeMap = Record<string, WardrobeItem[]>;

const SLOT_LABELS: Record<GarmentSlotId, string> = {
  TOP: "Top",
  BOTTOM: "Bottom",
  SHOES: "Shoes",
  HAIR: "Hair",
  ACCESSORY: "Extras",
};

/** Only slots the built-in wardrobe actually has meshes for are offered. */
const WEARABLE_SLOTS = GARMENT_SLOTS.filter((slot) =>
  GARMENT_TEMPLATES.some((template) => template.slot === slot),
);

export function WardrobePanel({
  wardrobe,
  outfit,
  onChange,
}: {
  wardrobe: WardrobeMap;
  outfit: Outfit;
  onChange: (next: Outfit) => void;
}) {
  const [slot, setSlot] = React.useState<GarmentSlotId>("TOP");
  const items = wardrobe[slot] ?? [];

  function wear(id: string | undefined) {
    const next: Outfit = { ...outfit };
    if (id) next[slot] = id;
    else delete next[slot];
    onChange(next);
  }

  return (
    <div className="space-y-4">
      <Panel>
        <PanelHeader label="Slot" />
        <div className="flex flex-wrap gap-2 p-3">
          {WEARABLE_SLOTS.map((candidate) => (
            <button
              key={candidate}
              type="button"
              onClick={() => setSlot(candidate)}
              aria-pressed={slot === candidate}
              className={`rounded-[3px] border px-2.5 py-1 font-mono text-[0.6875rem] uppercase tracking-[0.1em] transition-colors ${
                slot === candidate
                  ? "border-beam bg-beam/10 text-beam"
                  : "border-line text-faint hover:border-line-bright hover:text-mute"
              }`}
            >
              {SLOT_LABELS[candidate]}
              {outfit[candidate] && (
                <span className="ml-1.5 inline-block size-1 rounded-full bg-beam align-middle" />
              )}
            </button>
          ))}
        </div>
      </Panel>

      <Panel>
        <PanelHeader label={SLOT_LABELS[slot]}>
          <button
            type="button"
            onClick={() => wear(undefined)}
            className="font-mono text-[0.6875rem] uppercase tracking-[0.1em] text-faint hover:text-chalk"
          >
            Take off
          </button>
        </PanelHeader>

        <div className="grid grid-cols-2 gap-2 p-3">
          {items.length === 0 && (
            <p className="col-span-2 py-4 text-center text-[0.8125rem] text-faint">
              Nothing available for this slot yet.
            </p>
          )}

          {items.map((item) => (
            <GarmentCard
              key={item.id}
              item={item}
              selected={outfit[slot] === item.id}
              onSelect={() => wear(item.id)}
            />
          ))}
        </div>
      </Panel>

      <UploadPanel slot={slot} />
    </div>
  );
}

function GarmentCard({
  item,
  selected,
  onSelect,
}: {
  item: WardrobeItem;
  selected: boolean;
  onSelect: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();

  return (
    <div className="relative">
      <SelectCard selected={selected} onSelect={onSelect} className="w-full">
        <span
          className="mb-2 block h-8 w-full rounded-[2px] border border-line"
          style={{ background: item.colorHex }}
          aria-hidden
        />
        <span className="block truncate pr-4 text-[0.8125rem] text-chalk">{item.name}</span>
        {item.custom && (
          <Badge tone="accent" className="mt-1.5">
            {item.source === "USER_MESH" ? "3D file" : "Photo"}
          </Badge>
        )}
      </SelectCard>

      {item.custom && (
        <Tooltip content={`Remove "${item.name}" from your wardrobe`}>
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                if (notify(await deleteGarmentAction(item.id))) router.refresh();
              })
            }
            className="absolute bottom-2 right-2 rounded-[3px] p-1 text-faint transition-colors hover:bg-panel-raised hover:text-bad"
            aria-label={`Remove ${item.name}`}
          >
            <Trash2 className="size-3.5" aria-hidden />
          </button>
        </Tooltip>
      )}
    </div>
  );
}

/**
 * The two custom-clothing routes from PLAN/idea.md section 6.
 *
 * Option A wants a garment shape plus a photo; Option C wants a file. They are
 * separate tabs rather than one form because they need different inputs and
 * mean different things.
 */
function UploadPanel({ slot }: { slot: GarmentSlotId }) {
  const router = useRouter();
  const templates = GARMENT_TEMPLATES.filter((template) => template.slot === slot);

  const [photoState, photoAction, photoPending] = React.useActionState(
    createPhotoGarmentAction,
    undefined,
  );
  const [meshState, meshAction, meshPending] = React.useActionState(
    createMeshGarmentAction,
    undefined,
  );
  // The chosen template is derived, not synchronised. Switching slot changes
  // which templates exist, and an effect resetting the selection would render
  // once with a template that is not in the list.
  const [chosen, setChosen] = React.useState<string | null>(null);
  const templateId =
    chosen && templates.some((template) => template.id === chosen)
      ? chosen
      : (templates[0]?.id ?? "");

  const handledPhoto = React.useRef<unknown>(undefined);
  React.useEffect(() => {
    if (!photoState || photoState === handledPhoto.current) return;
    handledPhoto.current = photoState;
    if (notify(photoState, { warnings: photoState.data?.warnings })) router.refresh();
  }, [photoState, router]);

  const handledMesh = React.useRef<unknown>(undefined);
  React.useEffect(() => {
    if (!meshState || meshState === handledMesh.current) return;
    handledMesh.current = meshState;
    if (notify(meshState, { warnings: meshState.data?.warnings })) router.refresh();
  }, [meshState, router]);

  return (
    <Panel>
      <PanelHeader label="Add your own" />

      <Tabs defaultValue="photo">
        <TabsList className="px-2">
          <TabsTrigger value="photo">
            <Camera className="mr-1.5 inline size-3.5" aria-hidden />
            From a photo
          </TabsTrigger>
          <TabsTrigger value="mesh">
            <Boxes className="mr-1.5 inline size-3.5" aria-hidden />
            3D file
          </TabsTrigger>
        </TabsList>

        <TabsContent value="photo" className="space-y-3 p-3">
          {templates.length === 0 ? (
            <p className="text-[0.8125rem] text-faint">
              There is no garment shape for this slot to map a photo onto yet.
            </p>
          ) : (
            <form action={photoAction} className="space-y-3">
              <p className="text-[0.75rem] leading-relaxed text-faint">
                Pick the closest shape, then upload a photo of your actual item.
                The colour and print become yours; the silhouette stays the
                template&rsquo;s.
              </p>

              <input type="hidden" name="templateId" value={templateId} />

              <div className="grid grid-cols-2 gap-2">
                {templates.map((template) => (
                  <SelectCard
                    key={template.id}
                    selected={templateId === template.id}
                    onSelect={() => setChosen(template.id)}
                    className="p-2"
                  >
                    <span className="text-[0.8125rem] text-chalk">{template.label}</span>
                  </SelectCard>
                ))}
              </div>

              <Field label="Name" htmlFor="photo-garment-name">
                <Input
                  id="photo-garment-name"
                  name="name"
                  placeholder="My favourite tee"
                  maxLength={60}
                />
              </Field>

              <Field
                label="Photo of the item"
                htmlFor="garment-photo"
                hint="Flat-lay or worn, front-on. JPEG, PNG or WebP."
              >
                <Input
                  id="garment-photo"
                  name="photo"
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  required
                  className="h-auto py-2 file:mr-3 file:rounded-[3px] file:border-0 file:bg-panel-raised file:px-2 file:py-1 file:text-[0.75rem] file:text-chalk"
                />
              </Field>

              <Button type="submit" variant="outline" className="w-full" loading={photoPending}>
                Add from photo
              </Button>
            </form>
          )}
        </TabsContent>

        <TabsContent value="mesh" className="space-y-3 p-3">
          <form action={meshAction} className="space-y-3">
            <p className="text-[0.75rem] leading-relaxed text-faint">
              Upload a garment you already have as OBJ or GLB. It is scaled to
              your avatar, pushed outside the body, and skinned to the same rig.
            </p>

            <input type="hidden" name="slot" value={slot} />

            <Field label="Name" htmlFor="mesh-garment-name">
              <Input
                id="mesh-garment-name"
                name="name"
                placeholder="Leave blank to use the filename"
                maxLength={60}
              />
            </Field>

            <Field
              label="Model file"
              htmlFor="garment-mesh"
              hint="OBJ or GLB. Export FBX as GLB first."
            >
              <Input
                id="garment-mesh"
                name="mesh"
                type="file"
                accept=".obj,.glb,.gltf"
                required
                className="h-auto py-2 file:mr-3 file:rounded-[3px] file:border-0 file:bg-panel-raised file:px-2 file:py-1 file:text-[0.75rem] file:text-chalk"
              />
            </Field>

            <Button type="submit" variant="outline" className="w-full" loading={meshPending}>
              Add 3D garment
            </Button>
          </form>
        </TabsContent>
      </Tabs>
    </Panel>
  );
}
