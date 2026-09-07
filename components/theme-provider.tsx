"use client";

import { ThemeProvider as NextThemes } from "next-themes";

/**
 * Dark is the default and light is the toggle, per PLAN/idea.md section 10.
 *
 * `enableSystem` is off deliberately: honouring the system preference would
 * make the product's own default depend on the visitor's operating system, and
 * the brief chose dark. The toggle is still there for anyone who wants light.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemes
      attribute="class"
      defaultTheme="dark"
      enableSystem={false}
      disableTransitionOnChange
      themes={["dark", "light"]}
    >
      {children}
    </NextThemes>
  );
}
