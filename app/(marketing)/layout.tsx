import Link from "next/link";
import { SiteHeader } from "@/components/site-header";
import { LogoMark } from "@/components/brand/logo";

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />
      <main id="main" className="flex-1">
        {children}
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto grid max-w-[1400px] gap-8 px-4 py-10 sm:px-6 md:grid-cols-[1.4fr_1fr_1fr]">
          <div className="space-y-3">
            <LogoMark className="h-7 w-7" title="Incarnatrun" />
            <p className="max-w-xs text-[0.8125rem] leading-relaxed text-mute">
              Turn a photo into a rigged 3D avatar you can edit, animate and take
              into Blender.
            </p>
          </div>

          <FooterColumn
            title="Product"
            links={[
              { href: "/#how", label: "How it works" },
              { href: "/#editor", label: "Editor" },
              { href: "/#export", label: "Export formats" },
              { href: "/pricing", label: "Pricing" },
            ]}
          />

          <FooterColumn
            title="Account"
            links={[
              { href: "/sign-in", label: "Sign in" },
              { href: "/sign-up", label: "Create an account" },
              { href: "/dashboard", label: "Your avatars" },
            ]}
          />
        </div>

        <div className="border-t border-line">
          <div className="mx-auto flex max-w-[1400px] flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-6">
            <p className="type-data">Incarnatrun</p>
            <p className="type-data">Rigs are Mixamo-compatible</p>
          </div>
        </div>
      </footer>
    </div>
  );
}

function FooterColumn({
  title,
  links,
}: {
  title: string;
  links: { href: string; label: string }[];
}) {
  return (
    <div className="space-y-3">
      <h2 className="type-data">{title}</h2>
      <ul className="space-y-2">
        {links.map((link) => (
          <li key={link.href + link.label}>
            <Link
              href={link.href}
              className="rounded-[3px] text-[0.8125rem] text-mute transition-colors hover:text-chalk"
            >
              {link.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
