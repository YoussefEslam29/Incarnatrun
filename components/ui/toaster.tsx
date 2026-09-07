"use client";

import { Toaster as Sonner, toast } from "sonner";
import { useTheme } from "next-themes";
import type { ActionResult } from "@/lib/actions/result";

/**
 * Toasts, styled in this project's tokens.
 *
 * PLAN/idea.md section 15 requires every Server Action result to reach a toast, so
 * `notify` below is the single place that translates an ActionResult into one.
 * Doing it per call site is how some results end up silently ignored.
 */
export function Toaster() {
  const { theme } = useTheme();

  return (
    <Sonner
      theme={theme === "light" ? "light" : "dark"}
      position="bottom-right"
      closeButton
      toastOptions={{
        classNames: {
          toast:
            "!rounded-[4px] !border !border-line-bright !bg-panel !text-chalk !font-sans !shadow-2xl",
          description: "!text-mute",
          actionButton: "!bg-beam !text-white !rounded-[3px]",
          cancelButton: "!bg-panel-raised !text-mute !rounded-[3px]",
          error: "!border-bad/50",
          success: "!border-good/40",
        },
      }}
    />
  );
}

export interface NotifyOptions {
  /** Shown instead of the result's own message when it succeeded. */
  successMessage?: string;
  /** Extra lines to show under the message, such as engine warnings. */
  warnings?: string[];
}

/**
 * Shows a Server Action result as a toast and returns whether it succeeded.
 *
 * Warnings are surfaced separately: a generation that worked but could not find
 * a face is a success the user still needs told about, and folding that into
 * the failure path would be wrong.
 */
export function notify(result: ActionResult<unknown>, options: NotifyOptions = {}): boolean {
  if (result.success) {
    toast.success(options.successMessage ?? result.message);
  } else {
    toast.error(result.message);
  }

  for (const warning of options.warnings ?? []) {
    toast.warning(warning, { duration: 8000 });
  }

  return result.success;
}

export { toast };
