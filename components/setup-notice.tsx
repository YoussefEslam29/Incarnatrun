import { Panel } from "@/components/ui/primitives";
import { Database } from "lucide-react";

/**
 * Shown when the database is not reachable.
 *
 * A fresh clone has no DATABASE_URL, and the first thing that happens is a
 * Prisma connection error. Turning that into the three commands that fix it is
 * the difference between a project someone can run and one they abandon.
 */
export function SetupNotice({ message }: { message: string }) {
  return (
    <Panel className="p-6">
      <div className="flex gap-4">
        <span className="grid size-9 shrink-0 place-items-center rounded-[4px] border border-warn/40 text-warn">
          <Database className="size-4" aria-hidden />
        </span>

        <div className="min-w-0 space-y-4">
          <div className="space-y-1.5">
            <h2 className="type-display text-lg text-chalk">Finish setting up</h2>
            <p className="text-[0.875rem] leading-relaxed text-mute">{message}</p>
          </div>

          <pre className="overflow-x-auto rounded-[3px] border border-line bg-void p-3 font-mono text-[0.75rem] leading-relaxed text-mute">
            <code>{`cp .env.example .env
docker compose up -d
npm run db:push`}</code>
          </pre>

          <p className="text-[0.8125rem] text-faint">
            Then reload this page. Any Postgres works; the bundled compose file is
            only there so you do not have to find one.
          </p>
        </div>
      </div>
    </Panel>
  );
}
