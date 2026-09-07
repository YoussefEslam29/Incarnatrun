"use client";

import { ErrorState } from "@/components/error-state";

/**
 * The editor has the most failure modes of any route: a model that will not
 * parse, a texture that has gone missing from storage, a garment file the
 * fitter cannot use, or WebGL being unavailable entirely.
 */
export default function EditorError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <ErrorState
      title="The editor could not open this avatar"
      description="The model or one of its textures failed to load. Trying again often works. If it keeps happening, the avatar can be regenerated from the dashboard."
      error={error}
      reset={reset}
    />
  );
}
