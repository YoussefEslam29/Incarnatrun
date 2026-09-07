"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { MoreHorizontal, Pencil, Sliders, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Field,
  Input,
  Menu,
  MenuContent,
  MenuItem,
  MenuSeparator,
  MenuTrigger,
  Modal,
  ModalContent,
} from "@/components/ui/primitives";
import { notify } from "@/components/ui/toaster";
import { deleteAvatarAction, renameAvatarAction } from "@/server-actions/avatars";

export function AvatarCardMenu({ id, name }: { id: string; name: string }) {
  const router = useRouter();
  const [renaming, setRenaming] = React.useState(false);
  const [confirming, setConfirming] = React.useState(false);
  const [draft, setDraft] = React.useState(name);
  const [pending, startTransition] = React.useTransition();

  function rename() {
    startTransition(async () => {
      if (notify(await renameAvatarAction(id, draft))) {
        setRenaming(false);
        router.refresh();
      }
    });
  }

  function remove() {
    startTransition(async () => {
      if (notify(await deleteAvatarAction(id))) {
        setConfirming(false);
        router.refresh();
      }
    });
  }

  return (
    <>
      <Menu>
        <MenuTrigger
          className="shrink-0 rounded-[3px] p-1 text-faint transition-colors hover:bg-panel-raised hover:text-chalk"
          aria-label={`Actions for ${name}`}
        >
          <MoreHorizontal className="size-4" aria-hidden />
        </MenuTrigger>

        <MenuContent>
          <MenuItem asChild>
            <Link href={`/editor/${id}`}>
              <Sliders className="size-4" aria-hidden />
              Open editor
            </Link>
          </MenuItem>
          <MenuItem
            onSelect={(event) => {
              event.preventDefault();
              setDraft(name);
              setRenaming(true);
            }}
          >
            <Pencil className="size-4" aria-hidden />
            Rename
          </MenuItem>
          <MenuSeparator />
          <MenuItem
            className="text-bad data-[highlighted]:text-bad"
            onSelect={(event) => {
              event.preventDefault();
              setConfirming(true);
            }}
          >
            <Trash2 className="size-4" aria-hidden />
            Delete
          </MenuItem>
        </MenuContent>
      </Menu>

      <Modal open={renaming} onOpenChange={setRenaming}>
        <ModalContent title="Rename avatar">
          <form
            onSubmit={(event) => {
              event.preventDefault();
              rename();
            }}
            className="space-y-4"
          >
            <Field label="Name" htmlFor={`rename-${id}`}>
              <Input
                id={`rename-${id}`}
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                maxLength={60}
                autoFocus
              />
            </Field>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setRenaming(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" loading={pending}>
                Rename
              </Button>
            </div>
          </form>
        </ModalContent>
      </Modal>

      <Modal open={confirming} onOpenChange={setConfirming}>
        <ModalContent
          title={`Delete "${name}"?`}
          description="This removes the avatar, every saved version and its files. It cannot be undone."
        >
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setConfirming(false)}>
              Keep it
            </Button>
            <Button variant="danger" onClick={remove} loading={pending}>
              Delete avatar
            </Button>
          </div>
        </ModalContent>
      </Modal>
    </>
  );
}
