import type { Metadata, Viewport } from "next";
import { Anybody, IBM_Plex_Mono, Instrument_Sans } from "next/font/google";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/toaster";
import "./globals.css";

/*
  Three faces, three jobs.

  Anybody is a variable-width technical grotesque; the width axis is the point
  of choosing it, so headings use it rather than leaving the axis at default.
  Instrument Sans stays quiet under long text. IBM Plex Mono carries anything
  that is data: bone names, counts, formats, file sizes.
*/
const anybody = Anybody({
  subsets: ["latin"],
  variable: "--font-anybody",
  axes: ["wdth"],
  display: "swap",
});

const instrument = Instrument_Sans({
  subsets: ["latin"],
  variable: "--font-instrument",
  display: "swap",
});

const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  variable: "--font-plex-mono",
  weight: ["400", "500"],
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXTAUTH_URL ?? "http://localhost:3000"),
  title: {
    default: "Incarnatrun — your photo, rigged and ready for Blender",
    template: "%s — Incarnatrun",
  },
  description:
    "Upload one photo and get a rigged 3D avatar with a Mixamo-compatible skeleton. Edit the face, body and clothes in the browser, then export GLB or FBX.",
  keywords: ["3D avatar", "photo to 3D", "Blender", "Mixamo", "rigged character", "GLB", "FBX"],
  openGraph: {
    title: "Incarnatrun",
    description:
      "Upload one photo and get a rigged 3D avatar with a Mixamo-compatible skeleton.",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#0a0c11" },
    { media: "(prefers-color-scheme: light)", color: "#f6f7fa" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${anybody.variable} ${instrument.variable} ${plexMono.variable}`}
    >
      <body className="min-h-dvh antialiased">
        <ThemeProvider>
          {/* Lets a keyboard user get past the header without tabbing the nav. */}
          <a
            href="#main"
            className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded focus:bg-beam focus:px-4 focus:py-2 focus:text-white"
          >
            Skip to content
          </a>
          {children}
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
