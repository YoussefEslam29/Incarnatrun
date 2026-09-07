"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useActionState } from "react";
import Image from "next/image";
import { ImageUp, PersonStanding, ScanFace, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Field,
  IndeterminateBar,
  Input,
  Panel,
  PanelHeader,
  SelectCard,
} from "@/components/ui/primitives";
import { notify } from "@/components/ui/toaster";
import { createAvatarAction, type CreatedAvatar } from "@/server-actions/avatars";
import {
  ACCEPTED_PHOTO_TYPES,
  MAX_PHOTO_BYTES,
  type AcceptedPhotoType,
} from "@/lib/avatars/upload-limits";
import type { ActionResult } from "@/lib/actions/result";
import { formatBytes } from "@/lib/utils";

type Path = "FULL_BODY" | "FACE_ONLY";

/**
 * The creation flow: pick a path, choose a photo, generate.
 *
 * The two paths are the ones PLAN/idea.md section 1 specifies, and the copy for each
 * says what the photo is used for rather than naming the path, because "Path A"
 * means nothing to the person choosing.
 */
export function CreateFlow() {
  const router = useRouter();
  const [path, setPath] = React.useState<Path>("FULL_BODY");
  const [file, setFile] = React.useState<File | null>(null);
  const [localError, setLocalError] = React.useState<string | null>(null);
  const [dragging, setDragging] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const [state, formAction, pending] = useActionState<
    ActionResult<CreatedAvatar> | undefined,
    FormData
  >(createAvatarAction, undefined);

  // The preview is derived from the file rather than mirrored into state, so
  // there is no effect writing state and no render where the two disagree. The
  // effect exists only to revoke the URL; leaving it alive would leak the whole
  // image for the life of the page.
  const preview = React.useMemo(
    () => (file ? URL.createObjectURL(file) : null),
    [file],
  );

  React.useEffect(() => {
    if (!preview) return;
    return () => URL.revokeObjectURL(preview);
  }, [preview]);

  const handled = React.useRef<ActionResult<CreatedAvatar> | undefined>(undefined);
  React.useEffect(() => {
    if (!state || state === handled.current) return;
    handled.current = state;

    // Warnings ride along with a success, so they must be shown before we
    // navigate away from this component.
    if (notify(state, { warnings: state.data?.warnings })) {
      router.push(`/editor/${state.data!.avatarId}`);
    }
  }, [state, router]);

  function accept(candidate: File | undefined | null) {
    setLocalError(null);
    if (!candidate) return;

    // Checked here as well as on the server, so a wrong file is rejected
    // instantly instead of after a round trip.
    if (!ACCEPTED_PHOTO_TYPES.includes(candidate.type as AcceptedPhotoType)) {
      setLocalError("That file type is not supported. Choose a JPEG, PNG or WebP image.");
      return;
    }
    if (candidate.size > MAX_PHOTO_BYTES) {
      setLocalError(
        `That photo is ${formatBytes(candidate.size)}. The limit is ${formatBytes(MAX_PHOTO_BYTES)}.`,
      );
      return;
    }

    setFile(candidate);
  }

  return (
    <form action={formAction} className="grid gap-6 lg:grid-cols-[1fr_1fr]">
      <input type="hidden" name="path" value={path} />

      {/* ---------------------------------------------------------------- */}
      {/* Path                                                             */}
      {/* ---------------------------------------------------------------- */}
      <div className="space-y-6">
        <Panel>
          <PanelHeader label="How should we build it" />
          <div className="grid gap-3 p-3 sm:grid-cols-2">
            <SelectCard selected={path === "FULL_BODY"} onSelect={() => setPath("FULL_BODY")}>
              <PersonStanding className="mb-3 size-5 text-beam" aria-hidden />
              <p className="mb-1 text-[0.9rem] font-medium text-chalk">
                Full body from the photo
              </p>
              <p className="text-[0.8125rem] leading-relaxed text-mute">
                Best with a full-length shot. Height and build are read from the
                image.
              </p>
            </SelectCard>

            <SelectCard selected={path === "FACE_ONLY"} onSelect={() => setPath("FACE_ONLY")}>
              <ScanFace className="mb-3 size-5 text-flare" aria-hidden />
              <p className="mb-1 text-[0.9rem] font-medium text-chalk">
                Face only, pick a body
              </p>
              <p className="text-[0.8125rem] leading-relaxed text-mute">
                Best with a selfie. The face is used, and a body template is
                attached for you to reshape.
              </p>
            </SelectCard>
          </div>
        </Panel>

        <Panel>
          <PanelHeader label="Name" />
          <div className="p-3">
            <Field
              label="What should we call it?"
              htmlFor="name"
              hint="You can rename it at any time."
            >
              <Input id="name" name="name" defaultValue="My avatar" maxLength={60} />
            </Field>
          </div>
        </Panel>
      </div>

      {/* ---------------------------------------------------------------- */}
      {/* Photo                                                            */}
      {/* ---------------------------------------------------------------- */}
      <div className="space-y-6">
        <Panel>
          <PanelHeader label="Photo">
            {file && (
              <span className="font-mono text-[0.6875rem] text-faint">
                {formatBytes(file.size)}
              </span>
            )}
          </PanelHeader>

          <div className="p-3">
            {preview ? (
              <div className="relative overflow-hidden rounded-[3px] border border-line">
                <Image
                  src={preview}
                  alt="The photo you selected"
                  width={640}
                  height={800}
                  className="max-h-[22rem] w-full bg-void object-contain"
                  unoptimized
                />
                <button
                  type="button"
                  onClick={() => {
                    setFile(null);
                    if (inputRef.current) inputRef.current.value = "";
                  }}
                  className="absolute right-2 top-2 rounded-[3px] border border-line-bright bg-panel/90 p-1.5 text-mute backdrop-blur transition-colors hover:text-chalk"
                  aria-label="Choose a different photo"
                >
                  <X className="size-4" aria-hidden />
                </button>
              </div>
            ) : (
              <label
                onDragOver={(event) => {
                  event.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={(event) => {
                  event.preventDefault();
                  setDragging(false);
                  accept(event.dataTransfer.files?.[0]);
                }}
                className={`flex cursor-pointer flex-col items-center justify-center gap-3 rounded-[3px] border border-dashed px-6 py-14 text-center transition-colors ${
                  dragging ? "border-beam bg-beam/[0.06]" : "border-line-bright hover:border-beam"
                }`}
              >
                <ImageUp className="size-6 text-faint" aria-hidden />
                <span className="text-[0.9rem] text-chalk">
                  Drop a photo here, or choose a file
                </span>
                <span className="type-data normal-case tracking-normal">
                  JPEG, PNG or WebP · up to {formatBytes(MAX_PHOTO_BYTES)}
                </span>
                <input
                  ref={inputRef}
                  type="file"
                  name="photo"
                  accept={ACCEPTED_PHOTO_TYPES.join(",")}
                  className="sr-only"
                  onChange={(event) => accept(event.target.files?.[0])}
                  required
                />
              </label>
            )}

            {/*
              Keeps the chosen file attached to the form once the drop zone is
              replaced by the preview.
            */}
            {preview && (
              <input
                ref={inputRef}
                type="file"
                name="photo"
                accept={ACCEPTED_PHOTO_TYPES.join(",")}
                className="sr-only"
                onChange={(event) => accept(event.target.files?.[0])}
                required
              />
            )}

            {localError && (
              <p className="mt-3 text-[0.8125rem] text-bad" role="alert">
                {localError}
              </p>
            )}
          </div>
        </Panel>

        {pending ? (
          <Panel className="space-y-3 p-4">
            <p className="text-[0.875rem] text-chalk">Building your avatar</p>
            <IndeterminateBar />
            <p className="text-[0.8125rem] text-mute">
              Finding the face, sampling colours, generating geometry and rigging
              it. This takes a few seconds.
            </p>
          </Panel>
        ) : (
          <Button
            type="submit"
            variant="primary"
            size="lg"
            className="w-full"
            disabled={!file}
          >
            Generate avatar
          </Button>
        )}

        {state && !state.success && (
          <p
            className="rounded-[3px] border border-bad/40 bg-bad/[0.08] px-3 py-2 text-[0.8125rem] text-bad"
            role="alert"
          >
            {state.message}
          </p>
        )}
      </div>
    </form>
  );
}
