"use client";

import { useTheme } from "next-themes";
import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Dark and light, with dark as the product's default.
 *
 * Which icon shows is decided by CSS, not by React state. The obvious
 * alternative, a `mounted` flag set in an effect, cannot know the theme during
 * server rendering and so guarantees either a hydration mismatch or a visible
 * flash of the wrong icon on first paint. Letting the `light` variant pick
 * between two icons that are both in the markup avoids the problem entirely.
 */
export function ThemeToggle() {
  const { theme, setTheme } = useTheme();

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={() => setTheme(theme === "light" ? "dark" : "light")}
      aria-label="Switch between the dark and light theme"
    >
      <Sun className="light:hidden" aria-hidden />
      <Moon className="hidden light:block" aria-hidden />
    </Button>
  );
}
