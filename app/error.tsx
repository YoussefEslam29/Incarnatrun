"use client";

import { ErrorState } from "@/components/error-state";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <ErrorState
      title="This page did not load"
      description="Something failed while rendering. Trying again usually clears it."
      error={error}
      reset={reset}
    />
  );
}
