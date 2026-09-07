import Link from "next/link";
import { Wordmark } from "@/components/brand/logo";
import { ThemeToggle } from "@/components/theme-toggle";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-dvh flex-col">
      <div className="bg-grid absolute inset-0 [mask-image:radial-gradient(ellipse_at_50%_20%,black,transparent_70%)]" />

      <header className="relative flex h-14 items-center justify-between px-4 sm:px-6">
        <Link href="/" className="rounded-[3px]" aria-label="Incarnatrun home">
          <Wordmark />
        </Link>
        <ThemeToggle />
      </header>

      <main id="main" className="relative flex flex-1 items-center justify-center px-4 py-10">
        <div className="w-full max-w-[26rem]">{children}</div>
      </main>
    </div>
  );
}
