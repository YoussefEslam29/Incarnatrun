"use client";

import { AlertTriangle, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/primitives";

/**
 * The shared body of every route's error boundary.
 *
 * PLAN/idea.md section 15 asks for boundaries per segment, especially around the 3D
 * viewer where there are the most ways to fail. Each boundary supplies its own
 * heading and a sentence about what that part of the app was doing, because
 * "Something went wrong" tells the user nothing about whether to retry, reload,
 * or upload a different file.
 */
export function ErrorState({
  title,
  description,
  error,
  reset,
}: {
  title: string;
  description: string;
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="mx-auto grid min-h-[60dvh] max-w-xl place-items-center px-4 py-16">
      <Panel className="w-full p-6">
        <span className="mb-4 grid size-10 place-items-center rounded-[4px] border border-bad/40 text-bad">
          <AlertTriangle className="size-5" aria-hidden />
        </span>

        <h1 className="type-display mb-2 text-xl text-chalk">{title}</h1>
        <p className="mb-4 leading-relaxed text-mute">{description}</p>

        {error.message && (
          <pre className="mb-4 overflow-x-auto rounded-[3px] border border-line bg-void p-3 font-mono text-[0.75rem] text-faint">
            <code>{error.message}</code>
          </pre>
        )}

        <div className="flex flex-wrap gap-2">
          <Button variant="primary" onClick={reset}>
            <RotateCcw aria-hidden />
            Try again
          </Button>
        </div>

        {error.digest && (
          <p className="mt-4 font-mono text-[0.6875rem] text-faint">
            Reference: {error.digest}
          </p>
        )}
      </Panel>
    </div>
  );
}
