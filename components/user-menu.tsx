"use client";

import Link from "next/link";
import { LayoutGrid, LogOut, Plus } from "lucide-react";
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from "@/components/ui/primitives";
import { signOutAction } from "@/server-actions/auth";

export function UserMenu({ name, email }: { name?: string | null; email?: string | null }) {
  const label = name?.trim() || email?.split("@")[0] || "Account";
  const initial = label.charAt(0).toUpperCase();

  return (
    <Menu>
      <MenuTrigger
        className="grid size-8 shrink-0 place-items-center rounded-full border border-line-bright bg-panel text-[0.8125rem] font-medium text-chalk transition-colors hover:border-beam"
        aria-label={`Account menu for ${label}`}
      >
        {initial}
      </MenuTrigger>

      <MenuContent>
        <div className="px-2 py-1.5">
          <p className="truncate text-[0.8125rem] font-medium text-chalk">{label}</p>
          {email && <p className="truncate font-mono text-[0.6875rem] text-faint">{email}</p>}
        </div>
        <MenuSeparator />
        <MenuItem asChild>
          <Link href="/dashboard">
            <LayoutGrid className="size-4" aria-hidden />
            Your avatars
          </Link>
        </MenuItem>
        <MenuItem asChild>
          <Link href="/create">
            <Plus className="size-4" aria-hidden />
            New avatar
          </Link>
        </MenuItem>
        <MenuSeparator />
        <MenuItem asChild>
          <form action={signOutAction}>
            <button type="submit" className="flex w-full items-center gap-2">
              <LogOut className="size-4" aria-hidden />
              Sign out
            </button>
          </form>
        </MenuItem>
      </MenuContent>
    </Menu>
  );
}
