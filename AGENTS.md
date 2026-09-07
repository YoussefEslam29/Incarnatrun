<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Incarnatrun

## Where the specs live

**`PLAN/` holds the product specs. Read it before starting a feature.**

`PLAN/idea.md` is the original scope for Phase 1. New features get their own
file in `PLAN/`. Treat those files as the requirements, and the technical design
in `docs/superpowers/specs/` as how the current ones were resolved.

When a spec leaves a decision open, say so in the code at the point it matters
rather than guessing silently.

## Conventions this codebase already commits to

- **Server Actions always return `{ success, message, data? }`.** Wrap the body
  in `action()` from `lib/actions/result.ts`, and wire the result to a toast with
  `notify()`. No action may throw to the client.
- **The avatar engine is behind `AvatarEngineProvider`.** Nothing outside
  `lib/avatar-engine/providers/` may import a vendor SDK.
- **Export formats are registry entries**, not switch cases. Add one to
  `EXPORT_FORMATS` in `lib/export/index.ts`.
- **Garments are always `{ meshRef, textureRef }`**, whatever their source.
- **Editing appends an `AvatarVersion`.** Never mutate one in place.
- **Database reads are scoped by `userId` in the query**, not by a check at the
  call site.
- **Storage keys come from `storageKeys` helpers**, never built inline.

## Verifying work

```bash
npm test           # unit tests, including Khronos glTF validation
npm run verify     # end-to-end against a real database
npm run lint
npm run typecheck
npm run preview    # renders a sample avatar to .data/preview to look at
```

Geometry and file-format changes need `npm test`. Anything touching generation,
persistence or export needs `npm run verify`, which requires Postgres to be up
(`docker compose up -d`).

Note that `prisma generate` cannot replace the query engine while `next dev` is
running on Windows; stop the dev server before building.

## Things that have already bitten

- **glTF's V axis runs down the image.** A texture that looks right in the atlas
  renders upside down if this is missed.
- **`librsvg` ignores CSS custom properties.** Colours in SVG that sharp will
  rasterise must be literal hex, or they silently become black.
- **Opacity is not a way to show something is disabled.** It drags text under
  the contrast floor. Use a border or a badge.
- **Tube rings must be stacked along the axis the part runs.** Arms run along X
  and feet along Z; stacking either along Y collapses it into a flat sliver.
