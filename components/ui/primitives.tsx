"use client";

/**
 * The small shared pieces: panels, fields, labels, badges, tabs, sliders.
 *
 * These are shadcn/ui components in the sense that matters, which is that they
 * are Radix primitives styled in this project's own tokens and owned here
 * rather than pulled from a package. They follow the viewport-chrome language:
 * hairline borders, near-square corners, mono for anything that is data.
 */

import * as React from "react";
import {
  Dialog,
  DropdownMenu,
  Label as RLabel,
  Progress as RProgress,
  Separator,
  Slider as RSlider,
  Switch as RSwitch,
  Tabs as RTabs,
  Tooltip as RTooltip,
} from "radix-ui";
import { Check, X } from "lucide-react";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Surfaces
// ---------------------------------------------------------------------------

export function Panel({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("rounded-[4px] border border-line bg-panel", className)}
      {...props}
    >
      {children}
    </div>
  );
}

/**
 * A panel header in the properties-panel idiom: a mono field label on the left,
 * optional value or control on the right, hairline underneath.
 */
export function PanelHeader({
  label,
  children,
  className,
}: {
  label: string;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex h-10 items-center justify-between gap-3 border-b border-line px-3",
        className,
      )}
    >
      <span className="type-data">{label}</span>
      {children}
    </div>
  );
}

/**
 * A key and its value, set as a properties row.
 *
 * Used instead of decorative numbering: the label says what the field is, and
 * the value is real data from the product, so the structure carries meaning
 * rather than sequence.
 */
export function DataRow({
  label,
  value,
  className,
}: {
  label: string;
  value: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-baseline justify-between gap-4 py-1.5", className)}>
      <span className="type-data shrink-0">{label}</span>
      <span className="truncate font-mono text-[0.8125rem] text-chalk">{value}</span>
    </div>
  );
}

export function Divider({ className }: { className?: string }) {
  return <Separator.Root className={cn("h-px w-full bg-line", className)} />;
}

// ---------------------------------------------------------------------------
// Text
// ---------------------------------------------------------------------------

export function Eyebrow({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <p className={cn("type-data flex items-center gap-2", className)}>
      <span className="inline-block h-px w-6 bg-line-bright" aria-hidden />
      {children}
    </p>
  );
}

export function Badge({
  children,
  tone = "neutral",
  className,
}: {
  children: React.ReactNode;
  tone?: "neutral" | "accent" | "good" | "warn" | "bad";
  className?: string;
}) {
  const tones = {
    neutral: "border-line-bright text-mute",
    accent: "border-beam/50 text-beam",
    good: "border-good/40 text-good",
    warn: "border-warn/40 text-warn",
    bad: "border-bad/40 text-bad",
  } as const;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-[3px] border px-2 py-0.5 font-mono text-[0.6875rem] uppercase tracking-[0.1em]",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Form fields
// ---------------------------------------------------------------------------

export function Label({
  className,
  ...props
}: React.ComponentProps<typeof RLabel.Root>) {
  return (
    <RLabel.Root
      className={cn("text-[0.8125rem] font-medium text-chalk", className)}
      {...props}
    />
  );
}

export interface FieldProps {
  label: string;
  htmlFor: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
  className?: string;
}

/** Label, control, and either a hint or an error, never both. */
export function Field({ label, htmlFor, hint, error, children, className }: FieldProps) {
  const describedBy = error ? `${htmlFor}-error` : hint ? `${htmlFor}-hint` : undefined;

  return (
    <div className={cn("space-y-1.5", className)}>
      <Label htmlFor={htmlFor}>{label}</Label>
      {React.isValidElement(children)
        ? React.cloneElement(children as React.ReactElement<Record<string, unknown>>, {
            "aria-describedby": describedBy,
            "aria-invalid": error ? true : undefined,
          })
        : children}
      {error ? (
        <p id={`${htmlFor}-error`} className="text-[0.8125rem] text-bad" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p id={`${htmlFor}-hint`} className="text-[0.8125rem] text-faint">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export function Input({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "h-10 w-full rounded-[3px] border border-line bg-void px-3 text-sm text-chalk placeholder:text-faint",
        "transition-colors focus:border-beam focus:outline-none focus-visible:outline-none",
        "aria-[invalid=true]:border-bad",
        className,
      )}
      {...props}
    />
  );
}

// ---------------------------------------------------------------------------
// Slider
// ---------------------------------------------------------------------------

export interface SliderProps {
  id: string;
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  /** Rendered to the right of the label, e.g. "175 cm". */
  display?: string;
  /** Words for the two ends, e.g. "slim" and "heavy". */
  ends?: [string, string];
}

/**
 * A labelled slider.
 *
 * The end labels matter: a body slider called "Build" running 0 to 1 tells the
 * user nothing about which way to drag. Naming both ends does.
 */
export function Slider({
  id,
  label,
  value,
  onChange,
  min = 0,
  max = 1,
  step = 0.01,
  display,
  ends,
}: SliderProps) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <Label htmlFor={id} className="text-[0.8125rem] text-mute">
          {label}
        </Label>
        <span className="font-mono text-[0.75rem] tabular-nums text-chalk">
          {display ?? value.toFixed(2)}
        </span>
      </div>

      <RSlider.Root
        id={id}
        className="relative flex h-5 w-full touch-none select-none items-center"
        value={[value]}
        min={min}
        max={max}
        step={step}
        onValueChange={([next]) => onChange(next)}
        aria-label={label}
      >
        <RSlider.Track className="relative h-[3px] w-full grow rounded-full bg-line">
          <RSlider.Range className="absolute h-full rounded-full bg-gradient-to-r from-beam to-flare" />
        </RSlider.Track>
        <RSlider.Thumb
          className="block h-4 w-4 rounded-full border-2 border-void bg-chalk shadow-sm transition-transform hover:scale-110 focus-visible:outline-2 focus-visible:outline-beam"
          aria-label={label}
        />
      </RSlider.Root>

      {ends && (
        <div className="flex justify-between font-mono text-[0.6875rem] text-faint">
          <span>{ends[0]}</span>
          <span>{ends[1]}</span>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tabs
// ---------------------------------------------------------------------------

export const Tabs = RTabs.Root;

export function TabsList({
  className,
  ...props
}: React.ComponentProps<typeof RTabs.List>) {
  return (
    <RTabs.List
      className={cn("flex items-stretch gap-0 border-b border-line", className)}
      {...props}
    />
  );
}

export function TabsTrigger({
  className,
  ...props
}: React.ComponentProps<typeof RTabs.Trigger>) {
  return (
    <RTabs.Trigger
      className={cn(
        "relative -mb-px border-b-2 border-transparent px-3 py-2 font-mono text-[0.6875rem] uppercase tracking-[0.12em] text-faint transition-colors",
        "hover:text-mute data-[state=active]:border-beam data-[state=active]:text-chalk",
        className,
      )}
      {...props}
    />
  );
}

export function TabsContent({
  className,
  ...props
}: React.ComponentProps<typeof RTabs.Content>) {
  return <RTabs.Content className={cn("focus-visible:outline-none", className)} {...props} />;
}

// ---------------------------------------------------------------------------
// Switch
// ---------------------------------------------------------------------------

export function Switch({
  className,
  ...props
}: React.ComponentProps<typeof RSwitch.Root>) {
  return (
    <RSwitch.Root
      className={cn(
        "relative h-5 w-9 shrink-0 rounded-full border border-line bg-void transition-colors data-[state=checked]:border-beam data-[state=checked]:bg-beam",
        className,
      )}
      {...props}
    >
      <RSwitch.Thumb className="block h-3.5 w-3.5 translate-x-0.5 rounded-full bg-mute transition-transform data-[state=checked]:translate-x-[18px] data-[state=checked]:bg-white" />
    </RSwitch.Root>
  );
}

// ---------------------------------------------------------------------------
// Progress
// ---------------------------------------------------------------------------

export function Progress({ value, label }: { value: number; label?: string }) {
  return (
    <div className="space-y-1.5">
      {label && <p className="type-data">{label}</p>}
      <RProgress.Root
        value={value}
        className="relative h-1 w-full overflow-hidden rounded-full bg-line"
      >
        <RProgress.Indicator
          className="h-full bg-gradient-to-r from-beam to-flare transition-transform duration-500"
          style={{ transform: `translateX(-${100 - value}%)` }}
        />
      </RProgress.Root>
    </div>
  );
}

/**
 * An indeterminate bar for work with no measurable progress.
 *
 * Avatar generation takes a second or two and has no meaningful percentage, so
 * inventing one would be a lie the user can see through.
 */
export function IndeterminateBar({ className }: { className?: string }) {
  return (
    <div
      className={cn("relative h-1 w-full overflow-hidden rounded-full bg-line", className)}
      role="progressbar"
      aria-label="Working"
    >
      <span
        className="absolute inset-y-0 w-1/3 bg-gradient-to-r from-transparent via-beam to-transparent"
        style={{ animation: "sweep 1.15s linear infinite" }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tooltip, dialog, dropdown
// ---------------------------------------------------------------------------

export function TooltipProvider({ children }: { children: React.ReactNode }) {
  return <RTooltip.Provider delayDuration={250}>{children}</RTooltip.Provider>;
}

export function Tooltip({
  content,
  children,
}: {
  content: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <RTooltip.Root>
      <RTooltip.Trigger asChild>{children}</RTooltip.Trigger>
      <RTooltip.Portal>
        <RTooltip.Content
          sideOffset={6}
          className="z-50 max-w-56 rounded-[3px] border border-line-bright bg-panel-raised px-2.5 py-1.5 text-[0.8125rem] text-chalk shadow-xl"
        >
          {content}
          <RTooltip.Arrow className="fill-panel-raised" />
        </RTooltip.Content>
      </RTooltip.Portal>
    </RTooltip.Root>
  );
}

export const Modal = Dialog.Root;
export const ModalTrigger = Dialog.Trigger;
export const ModalClose = Dialog.Close;

export function ModalContent({
  title,
  description,
  children,
  className,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Dialog.Portal>
      <Dialog.Overlay className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm" />
      <Dialog.Content
        className={cn(
          "fixed left-1/2 top-1/2 z-50 w-[min(28rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2",
          "rounded-[4px] border border-line-bright bg-panel p-5 shadow-2xl",
          className,
        )}
      >
        <div className="mb-4 space-y-1">
          <Dialog.Title className="type-display text-lg text-chalk">{title}</Dialog.Title>
          {description && (
            <Dialog.Description className="text-[0.8125rem] text-mute">
              {description}
            </Dialog.Description>
          )}
        </div>
        {children}
        <Dialog.Close
          className="absolute right-3 top-3 rounded-[3px] p-1 text-faint hover:bg-panel-raised hover:text-chalk"
          aria-label="Close"
        >
          <X className="size-4" />
        </Dialog.Close>
      </Dialog.Content>
    </Dialog.Portal>
  );
}

export const Menu = DropdownMenu.Root;
export const MenuTrigger = DropdownMenu.Trigger;

export function MenuContent({
  children,
  align = "end",
}: {
  children: React.ReactNode;
  align?: "start" | "center" | "end";
}) {
  return (
    <DropdownMenu.Portal>
      <DropdownMenu.Content
        align={align}
        sideOffset={6}
        className="z-50 min-w-44 rounded-[4px] border border-line-bright bg-panel p-1 shadow-2xl"
      >
        {children}
      </DropdownMenu.Content>
    </DropdownMenu.Portal>
  );
}

export function MenuItem({
  className,
  ...props
}: React.ComponentProps<typeof DropdownMenu.Item>) {
  return (
    <DropdownMenu.Item
      className={cn(
        "flex cursor-pointer select-none items-center gap-2 rounded-[3px] px-2 py-1.5 text-[0.8125rem] text-mute outline-none",
        "data-[highlighted]:bg-panel-raised data-[highlighted]:text-chalk",
        className,
      )}
      {...props}
    />
  );
}

export const MenuSeparator = () => (
  <DropdownMenu.Separator className="my-1 h-px bg-line" />
);

// ---------------------------------------------------------------------------
// Swatch
// ---------------------------------------------------------------------------

export function ColorSwatch({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (hex: string) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <Label htmlFor={id} className="text-[0.8125rem] text-mute">
        {label}
      </Label>
      <div className="flex items-center gap-2">
        <span className="font-mono text-[0.75rem] uppercase text-faint">{value}</span>
        <label
          className="relative size-7 cursor-pointer overflow-hidden rounded-[3px] border border-line-bright"
          style={{ background: value }}
        >
          <input
            id={id}
            type="color"
            value={value}
            onChange={(event) => onChange(event.target.value)}
            className="absolute inset-0 cursor-pointer opacity-0"
            aria-label={label}
          />
        </label>
      </div>
    </div>
  );
}

/** A selectable card, used for creation paths and wardrobe items. */
export function SelectCard({
  selected,
  onSelect,
  children,
  className,
  disabled,
}: {
  selected: boolean;
  onSelect: () => void;
  children: React.ReactNode;
  className?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={disabled}
      aria-pressed={selected}
      className={cn(
        "group relative rounded-[4px] border p-3 text-left transition-colors disabled:opacity-40",
        selected
          ? "border-beam bg-beam/[0.07]"
          : "border-line bg-panel hover:border-line-bright hover:bg-panel-raised",
        className,
      )}
    >
      {selected && (
        <span className="absolute right-2 top-2 grid size-4 place-items-center rounded-full bg-beam text-white">
          <Check className="size-3" strokeWidth={3} />
        </span>
      )}
      {children}
    </button>
  );
}
