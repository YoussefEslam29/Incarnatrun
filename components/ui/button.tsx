"use client";

import * as React from "react";
import { Slot } from "radix-ui";
import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

/*
  Buttons follow the viewport-chrome vocabulary: square-ish corners, hairline
  borders, and a mono label on the quieter variants. The one gradient button is
  the page's primary action and appears at most once per view, so the blue-to-
  violet pair keeps meaning something.
*/
const buttonVariants = cva(
  "relative inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[3px] font-medium transition-[background,border-color,color,opacity] disabled:pointer-events-none disabled:opacity-45 [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary:
          "bg-gradient-to-r from-beam to-flare text-white shadow-[0_1px_0_rgba(255,255,255,0.14)_inset] hover:brightness-110",
        solid: "bg-chalk text-void hover:bg-chalk/90",
        outline:
          "border border-line-bright bg-panel/60 text-chalk hover:border-beam hover:bg-panel-raised",
        ghost: "text-mute hover:bg-panel-raised hover:text-chalk",
        danger: "border border-bad/40 bg-bad/10 text-bad hover:bg-bad/20",
      },
      size: {
        sm: "h-8 px-3 text-[0.8125rem]",
        md: "h-10 px-4 text-sm",
        lg: "h-12 px-6 text-[0.95rem]",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: { variant: "outline", size: "md" },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  /** Shows a spinner and blocks input. The label stays, so width does not jump. */
  loading?: boolean;
}

export function Button({
  className,
  variant,
  size,
  asChild = false,
  loading = false,
  disabled,
  children,
  ...props
}: ButtonProps) {
  const Comp = asChild ? Slot.Root : "button";

  return (
    <Comp
      className={cn(buttonVariants({ variant, size }), className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? (
        <>
          <Loader2 className="animate-spin" aria-hidden />
          {children}
        </>
      ) : (
        children
      )}
    </Comp>
  );
}

export { buttonVariants };
