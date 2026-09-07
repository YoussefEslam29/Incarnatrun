import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/primitives";
import { LogoMark } from "@/components/brand/logo";

export default function NotFound() {
  return (
    <div className="mx-auto grid min-h-dvh max-w-xl place-items-center px-4">
      <Panel className="w-full p-8 text-center">
        <LogoMark className="mx-auto mb-5 h-10 w-10" title="Incarnatrun" />
        <h1 className="type-display mb-2 text-2xl text-chalk">Nothing here</h1>
        <p className="mb-6 leading-relaxed text-mute">
          That page does not exist, or the avatar belongs to someone else.
        </p>
        <div className="flex flex-wrap justify-center gap-2">
          <Button asChild variant="primary">
            <Link href="/dashboard">Your avatars</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/">Home</Link>
          </Button>
        </div>
      </Panel>
    </div>
  );
}
