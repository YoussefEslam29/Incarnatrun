"use client";

import { ErrorState } from "@/components/error-state";

export default function CreateError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <ErrorState
      title="Your avatar could not be generated"
      description="The photo may be unreadable, or generation failed partway. Try again, or start over with a different photo."
      error={error}
      reset={reset}
    />
  );
}
