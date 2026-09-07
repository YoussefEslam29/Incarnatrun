"use client";

import { ErrorState } from "@/components/error-state";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <ErrorState
      title="Your avatars could not be loaded"
      description="The database did not answer. If this is a fresh install, run the setup commands in the README first."
      error={error}
      reset={reset}
    />
  );
}
