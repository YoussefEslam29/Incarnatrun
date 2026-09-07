"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { AlertTriangle, RotateCcw, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Badge,
  IndeterminateBar,
  Panel,
  PanelHeader,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  TooltipProvider,
} from "@/components/ui/primitives";
import { notify } from "@/components/ui/toaster";
import { BodyPanel } from "@/components/editor/body-panel";
import { FacePanel } from "@/components/editor/face-panel";
import { WardrobePanel, type WardrobeMap } from "@/components/editor/wardrobe-panel";
import { ExportPanel } from "@/components/editor/export-panel";
import { saveAvatarAction } from "@/server-actions/avatars";
import {
  defaultAvatarParams,
  type AvatarParams,
  type BodyParams,
  type FaceParams,
  type Outfit,
} from "@/lib/avatar-engine/params";
import { formatRelative } from "@/lib/utils";

const AvatarViewer = dynamic(
  () => import("@/components/three/avatar-viewer").then((m) => m.AvatarViewer),
  {
    ssr: false,
    loading: () => (
      <div className="grid h-full w-full place-items-center bg-void">
        <p className="type-data animate-pulse">Loading viewport</p>
      </div>
    ),
  },
);

export interface EditorShellProps {
  avatarId: string;
  name: string;
  status: string;
  failureReason: string | null;
  modelUrl: string | null;
  version: number;
  initialParams?: AvatarParams;
  wardrobe: WardrobeMap;
  versions: { id: string; version: number; createdAt: string }[];
}

/**
 * The editor.
 *
 * Slider changes update local state and nothing else. Saving is what re-renders
 * the model on the server and appends a version. Regenerating per keystroke
 * would make the editor unusable and the server expensive, and the parameters
 * are the source of truth either way.
 *
 * The consequence is that the viewport shows the last saved model while there
 * are unsaved edits, so the header says so plainly rather than letting the user
 * believe they are looking at their changes.
 */
export function EditorShell(props: EditorShellProps) {
  const router = useRouter();
  const initial = React.useMemo(
    () => props.initialParams ?? defaultAvatarParams(),
    [props.initialParams],
  );

  const [params, setParams] = React.useState<AvatarParams>(initial);
  const [saving, startSaving] = React.useTransition();
  const [savedAt, setSavedAt] = React.useState<Date | null>(null);
  const [version, setVersion] = React.useState(props.version);
  const [modelUrl, setModelUrl] = React.useState(props.modelUrl);

  const dirty = React.useMemo(
    () => JSON.stringify(params) !== JSON.stringify(initial),
    [params, initial],
  );

  // Warn before leaving with unsaved edits. The browser owns the wording.
  React.useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  const setBody = React.useCallback(
    (next: Partial<BodyParams>) =>
      setParams((current) => ({ ...current, body: { ...current.body, ...next } })),
    [],
  );

  const setFace = React.useCallback(
    (next: Partial<FaceParams>) =>
      setParams((current) => ({ ...current, face: { ...current.face, ...next } })),
    [],
  );

  const setOutfit = React.useCallback(
    (next: Outfit) => setParams((current) => ({ ...current, outfit: next })),
    [],
  );

  function save() {
    startSaving(async () => {
      const result = await saveAvatarAction({ avatarId: props.avatarId, params });

      if (notify(result, { warnings: result.data?.warnings })) {
        const nextVersion = result.data!.version;
        setVersion(nextVersion);
        setSavedAt(new Date());
        // Bust the loader cache: the key is versioned, so a new URL is a new
        // model rather than a stale one served from three.js's cache.
        setModelUrl(`/api/storage/avatars/${props.avatarId}/v${nextVersion}/model.glb`);
        router.refresh();
      }
    });
  }

  const failed = props.status === "FAILED";

  return (
    <TooltipProvider>
      <div className="grid min-h-[calc(100dvh-3.5rem)] grid-rows-[auto_minmax(0,1fr)] lg:grid-cols-[minmax(0,1fr)_25rem] lg:grid-rows-[auto_minmax(0,1fr)]">
        {/* ------------------------------------------------------------ */}
        {/* Toolbar                                                      */}
        {/* ------------------------------------------------------------ */}
        <div className="col-span-full flex flex-wrap items-center gap-3 border-b border-line px-4 py-2.5 sm:px-6">
          <div className="min-w-0">
            <h1 className="type-display truncate text-lg text-chalk">{props.name}</h1>
            <p className="type-data mt-0.5 normal-case tracking-normal">
              Version {version}
              {savedAt ? ` · saved ${formatRelative(savedAt)}` : ""}
            </p>
          </div>

          <div className="ml-auto flex items-center gap-2">
            {dirty && <Badge tone="warn">Unsaved changes</Badge>}

            <Button
              variant="ghost"
              size="sm"
              onClick={() => setParams(initial)}
              disabled={!dirty || saving}
            >
              <RotateCcw aria-hidden />
              <span className="hidden sm:inline">Revert</span>
            </Button>

            <Button
              variant="primary"
              size="sm"
              onClick={save}
              loading={saving}
              disabled={!dirty}
            >
              <Save aria-hidden />
              Save
            </Button>
          </div>
        </div>

        {/* ------------------------------------------------------------ */}
        {/* Viewport                                                     */}
        {/* ------------------------------------------------------------ */}
        <section
          className="relative min-h-[24rem] border-b border-line lg:min-h-0 lg:border-b-0 lg:border-r"
          aria-label="Avatar preview"
        >
          {failed ? (
            <div className="grid h-full place-items-center p-8 text-center">
              <div className="max-w-sm space-y-3">
                <AlertTriangle className="mx-auto size-6 text-bad" aria-hidden />
                <h2 className="type-display text-lg text-chalk">
                  This avatar could not be generated
                </h2>
                <p className="text-[0.875rem] leading-relaxed text-mute">
                  {props.failureReason ??
                    "Something went wrong while building it. Try creating it again with a different photo."}
                </p>
              </div>
            </div>
          ) : modelUrl ? (
            <AvatarViewer
              key={modelUrl}
              src={modelUrl}
              className="h-full w-full"
              height={params.body.heightCm / 100}
              reveal
            />
          ) : (
            <div className="grid h-full place-items-center p-8">
              <p className="type-data">No model yet</p>
            </div>
          )}

          {saving && (
            <div className="absolute inset-x-0 bottom-0 space-y-2 border-t border-line bg-panel/95 p-3 backdrop-blur">
              <p className="text-[0.8125rem] text-chalk">Rebuilding your avatar</p>
              <IndeterminateBar />
            </div>
          )}
        </section>

        {/* ------------------------------------------------------------ */}
        {/* Controls                                                     */}
        {/* ------------------------------------------------------------ */}
        <aside className="min-h-0 overflow-y-auto" aria-label="Avatar settings">
          <Tabs defaultValue="body" className="flex h-full flex-col">
            <TabsList className="sticky top-0 z-10 bg-void px-2">
              <TabsTrigger value="body">Body</TabsTrigger>
              <TabsTrigger value="face">Face</TabsTrigger>
              <TabsTrigger value="clothes">Clothes</TabsTrigger>
              <TabsTrigger value="export">Export</TabsTrigger>
            </TabsList>

            <div className="flex-1 p-4">
              <TabsContent value="body">
                <BodyPanel value={params.body} onChange={setBody} />
              </TabsContent>

              <TabsContent value="face">
                <FacePanel value={params.face} onChange={setFace} />
              </TabsContent>

              <TabsContent value="clothes">
                <WardrobePanel
                  wardrobe={props.wardrobe}
                  outfit={params.outfit}
                  onChange={setOutfit}
                />
              </TabsContent>

              <TabsContent value="export" className="space-y-4">
                <ExportPanel
                  avatarId={props.avatarId}
                  avatarName={props.name}
                  dirty={dirty}
                />

                <Panel>
                  <PanelHeader label="History" />
                  <ul className="divide-y divide-line">
                    {props.versions.map((entry) => (
                      <li
                        key={entry.id}
                        className="flex items-center justify-between gap-3 px-3 py-2"
                      >
                        <span className="font-mono text-[0.8125rem] text-chalk">
                          v{entry.version}
                        </span>
                        <span className="text-[0.8125rem] text-faint">
                          {formatRelative(entry.createdAt)}
                        </span>
                      </li>
                    ))}
                  </ul>
                  <p className="border-t border-line px-3 py-2 text-[0.75rem] leading-relaxed text-faint">
                    Every save appends a version. Nothing you have saved is
                    overwritten.
                  </p>
                </Panel>
              </TabsContent>
            </div>
          </Tabs>
        </aside>
      </div>
    </TooltipProvider>
  );
}
