import Link from "next/link";
import { auth } from "@/lib/auth";
import { Wordmark } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { UserMenu } from "@/components/user-menu";

/**
 * The top bar, framed as application chrome rather than a marketing nav: full
 * width, hairline underneath, no rounded pill buttons.
 */
export async function SiteHeader() {
  const session = await auth();

  return (
    <header className="sticky top-0 z-30 border-b border-line bg-void/85 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-[1400px] items-center gap-6 px-4 sm:px-6">
        <Link href="/" className="rounded-[3px]" aria-label="Incarnatrun home">
          <Wordmark />
        </Link>

        <nav className="ml-2 hidden items-center gap-1 md:flex" aria-label="Main">
          <NavLink href="/#how">How it works</NavLink>
          <NavLink href="/#export">Export</NavLink>
          <NavLink href="/pricing">Pricing</NavLink>
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <ThemeToggle />

          {session?.user ? (
            <>
              <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex">
                <Link href="/dashboard">Avatars</Link>
              </Button>
              <Button asChild variant="primary" size="sm">
                <Link href="/create">New avatar</Link>
              </Button>
              <UserMenu name={session.user.name} email={session.user.email} />
            </>
          ) : (
            <>
              <Button asChild variant="ghost" size="sm">
                <Link href="/sign-in">Sign in</Link>
              </Button>
              <Button asChild variant="primary" size="sm">
                <Link href="/sign-up">Start free</Link>
              </Button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="rounded-[3px] px-2.5 py-1.5 text-[0.8125rem] text-mute transition-colors hover:text-chalk"
    >
      {children}
    </Link>
  );
}
