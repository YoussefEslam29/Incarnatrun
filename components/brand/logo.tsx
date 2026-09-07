/**
 * The Incarnatrun mark.
 *
 * PLAN/idea.md section 9 asks for hand-coded SVG rather than a raster image, and for
 * a head silhouette that resolves into a wireframe mesh, in a blue-to-purple
 * gradient that reads on a dark ground. That is exactly what this draws: the
 * left half of the head is a solid profile, and it breaks into triangulated
 * wire toward the right, so the mark itself reads as "photo becomes model".
 *
 * The gradient id is suffixed per instance. Two SVGs on one page sharing a
 * gradient id means the second silently reuses the first, and if the first is
 * ever removed from the DOM the survivor loses its fill.
 */

import { useId } from "react";
import { cn } from "@/lib/utils";

export interface LogoProps {
  className?: string;
  /** Draw the wireframe half. Off for very small sizes, like a favicon. */
  detailed?: boolean;
  title?: string;
}

export function LogoMark({ className, detailed = true, title }: LogoProps) {
  const id = useId().replace(/:/g, "");
  const gradient = `mark-${id}`;
  const wire = `wire-${id}`;

  return (
    <svg
      viewBox="0 0 48 48"
      fill="none"
      className={cn("h-8 w-8", className)}
      role={title ? "img" : "presentation"}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      <defs>
        <linearGradient id={gradient} x1="6" y1="42" x2="42" y2="6" gradientUnits="userSpaceOnUse">
          <stop stopColor="#6a78ff" />
          <stop offset="1" stopColor="#c063ff" />
        </linearGradient>
        <linearGradient id={wire} x1="20" y1="24" x2="44" y2="24" gradientUnits="userSpaceOnUse">
          <stop stopColor="#6a78ff" stopOpacity="0.95" />
          <stop offset="1" stopColor="#c063ff" stopOpacity="0.35" />
        </linearGradient>
      </defs>

      {/*
        Solid half: a head in profile facing right, cut off at the centre line.
        Cranium, brow, nose, lips, chin, jaw, neck.
      */}
      <path
        d="M24 4.4c-5.6 0-10.2 3.1-12.3 7.8-1.5 3.3-1.3 6.4-.6 9.2.3 1.2-.1 1.9-.8 2.9l-1.7 2.4c-.6.9-.3 1.8.7 2.1l2 .7c.5.2.7.5.7 1v3.1c0 2.3 1.6 4.1 3.9 4.4l3.6.5c.7.1 1 .4 1 1.1v4.0h3.5V24z"
        fill={`url(#${gradient})`}
      />

      {detailed && (
        <g stroke={`url(#${wire})`} strokeWidth="1.1" strokeLinejoin="round">
          {/*
            Right half: the same head, but as a triangulated shell. The vertices
            sit where the solid half's landmarks are, so the two halves line up
            along the centre line.
          */}
          <path d="M24 4.4 36.2 12.2 33 24 24 24Z" />
          <path d="M36.2 12.2 41 22.4 33 24Z" />
          <path d="M33 24 36.4 33.2 24 43.6 24 24Z" />
          <path d="M41 22.4 36.4 33.2 33 24Z" />
          <path d="M24 4.4 33 24 24 24Z" opacity="0.55" />
          <path d="M36.2 12.2 33 24 41 22.4Z" opacity="0.4" />

          <g fill="#c063ff" stroke="none">
            <circle cx="36.2" cy="12.2" r="1.5" />
            <circle cx="41" cy="22.4" r="1.5" />
            <circle cx="36.4" cy="33.2" r="1.5" />
            <circle cx="33" cy="24" r="1.5" />
          </g>
        </g>
      )}
    </svg>
  );
}

export interface WordmarkProps {
  className?: string;
  /** Hide the word, leaving only the mark. Used on narrow screens. */
  markOnly?: boolean;
}

/** Mark plus name, for the header. */
export function Wordmark({ className, markOnly = false }: WordmarkProps) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <LogoMark className="h-7 w-7 shrink-0" title="Incarnatrun" />
      {!markOnly && (
        <span
          className="type-display text-[1.15rem] leading-none text-chalk"
          style={{ fontVariationSettings: '"wdth" 108', letterSpacing: "-0.02em" }}
        >
          Incarnat<span className="text-gradient">run</span>
        </span>
      )}
    </span>
  );
}
