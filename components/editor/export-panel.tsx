"use client";

import * as React from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge, Panel, PanelHeader } from "@/components/ui/primitives";
import { toast } from "@/components/ui/toaster";
import { EXPORT_FORMATS } from "@/lib/export";

/**
 * Downloads.
 *
 * The export route answers with the file itself rather than JSON, so this
 * fetches it as a blob and clicks a temporary link. Pointing an anchor straight
 * at the route would need a GET with the parameters in the query string, and
 * would lose the ability to show the server's error message when it fails.
 */
export function ExportPanel({
  avatarId,
  avatarName,
  dirty,
}: {
  avatarId: string;
  avatarName: string;
  dirty: boolean;
}) {
  const [busy, setBusy] = React.useState<string | null>(null);

  async function download(format: string) {
    setBusy(format);

    try {
      const response = await fetch("/api/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ avatarId, format }),
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        toast.error(body?.error ?? "That export failed. Please try again.");
        return;
      }

      const blob = await response.blob();
      const filename =
        response.headers
          .get("Content-Disposition")
          ?.match(/filename="([^"]+)"/)?.[1] ?? `${avatarName}.${format}`;

      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.append(link);
      link.click();
      link.remove();
      // Revoking immediately can cancel the download in some browsers; a tick
      // is enough for the click to have been handled.
      setTimeout(() => URL.revokeObjectURL(url), 1000);

      toast.success(`Downloaded ${filename}.`);
    } catch {
      toast.error("That export failed. Check your connection and try again.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <Panel>
      <PanelHeader label="Download" />

      <div className="space-y-3 p-3">
        {dirty && (
          <p className="rounded-[3px] border border-warn/40 bg-warn/[0.08] px-3 py-2 text-[0.8125rem] text-warn">
            You have unsaved changes. Exports use the last saved version, so save
            first if you want these edits in the file.
          </p>
        )}

        {EXPORT_FORMATS.map((format) => (
          <div
            key={format.id}
            className="rounded-[3px] border border-line p-3"
          >
            <div className="mb-1.5 flex items-center gap-2">
              <h3 className="text-[0.9rem] font-medium text-chalk">{format.label}</h3>
              <Badge tone={format.enabled ? "accent" : "neutral"}>.{format.extension}</Badge>
              {format.rigged && <Badge tone="good">rigged</Badge>}
            </div>

            <p className="mb-3 text-[0.75rem] leading-relaxed text-mute">
              {format.enabled ? format.description : format.unavailableReason}
            </p>

            <Button
              variant={format.id === "glb" ? "primary" : "outline"}
              size="sm"
              className="w-full"
              disabled={!format.enabled}
              loading={busy === format.id}
              onClick={() => download(format.id)}
            >
              {format.enabled ? (
                <>
                  <Download aria-hidden />
                  Download {format.extension.toUpperCase()}
                </>
              ) : (
                "Coming in Phase 2"
              )}
            </Button>
          </div>
        ))}
      </div>
    </Panel>
  );
}
