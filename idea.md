# INCARNATRUN

**Repo**: https://github.com/YoussefEslam29/Incarnatrun

## 1. Project Overview

A web app where a user uploads a photo of themselves and gets back an editable
3D avatar of "themselves." Two creation paths:

- **Path A — Full body from photo**: user uploads a full-body (or face+body)
  photo → system generates a full 3D avatar directly.
- **Path B — Face only**: user uploads just a selfie → system reconstructs
  the 3D face and attaches a random pre-made body template → user then edits
  the body to their liking (height, weight, proportions, etc.).

After generation, the avatar is fully editable (face, body, clothes) and can
be exported for different real-world uses: casual sharing/chat stickers,
Blender/3D work, and (future) 3D printing.

This is a **planning document for Claude Code**. It intentionally mixes
product intent with technical direction so an AI coding agent can start
building without needing a separate back-and-forth to infer the stack.

> **Repo state**: as of writing, the repo contains only a placeholder
> `README.md` — no scaffolding yet. Claude Code is starting from a clean
> slate and should begin with Phase 1, Step 1 in the checklist (§13).

---

## 2. Who This Is For

- Casual users who want a fun, personalized avatar (profile picture, sticker
  pack style, similar to Bitmoji) — **Phase 2**.
- Creators/hobbyists who want a rigged, animation-ready model to bring into
  Blender — **Phase 1 (MVP)**.
- Hobbyists who eventually want a 3D-printable figurine of themselves —
  **Phase 2, but the pipeline should be built so this can be added without a
  rewrite.**

---

## 3. Feature List (as scoped with the user)

1. **3D avatar generation from a photo**, with the two paths (A/B) above.
2. **Full editor**: face, body, clothes, hair, accessories — all adjustable
   after generation, and re-editable later (not a one-shot export).
3. **Blender availability**:
   - Phase 1: downloadable, Blender-ready export file (`.fbx` / `.glb`,
     rigged, Mixamo-compatible skeleton).
   - Phase 2: a dedicated Blender add-on that can pull/sync a user's avatar
     directly into Blender via API (no manual download/import step).
4. **Multiple output styles** — realistic vs. stylized/"Bitmoji-like" vs.
   3D-print-ready are genuinely different output requirements (see §7).
   MVP ships **realistic style + Blender export only**. Cartoon/bitmoji style
   and print-ready export are **Phase 2** additions to the same pipeline.
5. **Custom clothing upload** (user's own real clothes, not just the
   built-in wardrobe) — see §6 for the full spec and the reasoning behind the
   chosen approach.
6. **Logo** for the site/brand — see §9.
7. **Dark mode (default) + light mode toggle.**
8. **English only** — no i18n/RTL needed for v1. (Note: this deliberately
   supersedes any earlier Arabic/RTL direction from a prior prompt — this
   project is English-only per the user's explicit instruction.)

---

## 4. Recommended Tech Stack

| Layer | Choice | Why |
|---|---|---|
| Framework | Next.js (App Router) | Server actions, easy Vercel deploy, good fit for a mixed marketing+app site |
| Styling / UI kit | Tailwind CSS + shadcn/ui | Fast, consistent, themeable (dark/light) |
| Animation | Framer Motion | Page transitions, editor micro-interactions |
| 3D rendering (in-browser) | Three.js via **React Three Fiber** (`@react-three/fiber`, `@react-three/drei`) | Standard for rendering GLB avatars + live editor preview in the browser |
| Avatar generation engine | Third-party avatar SDK (e.g. Avatar SDK / MetaPerson Creator, or Avaturn / Ready Player Me as alternatives) integrated via embeddable iframe + JS API, or their cloud API from your backend | Photo→3D reconstruction, rigging, and a face/body/clothing editor are extremely hard to build from scratch; these vendors already solve it and export standard GLB/FBX with Mixamo-compatible rigs |
| Auth | NextAuth.js (Auth.js) | Save/re-edit avatars across sessions |
| Database | PostgreSQL (e.g. via Supabase or Neon) | Relational fits well: users, avatars, avatar versions, credits/billing, orders — all clearly relational entities |
| File/asset storage | S3-compatible storage or Vercel Blob | Store generated GLB/FBX files and uploaded photos/clothing textures |
| Hosting | Vercel | Matches Next.js, easy preview deploys |
| Version control | GitHub — [YoussefEslam29/Incarnatrun](https://github.com/YoussefEslam29/Incarnatrun) | Standard, clean commit history per feature |

> **Decision needed from the vendor evaluation**: pick one avatar-generation
> vendor before Phase 1 coding starts (cost per generation, license terms,
> export rights, and whether their editor SDK is embeddable in your own UI
> vs. only usable as their own hosted widget). This blocks real integration
> work but does **not** block scaffolding the rest of the app.

---

## 5. Architecture Strategy

Use a **modular structure** — this project has several independent domains
(auth, avatar-engine integration, 3D viewer/editor, clothing upload,
export pipeline, billing/credits) that will each grow independently.

```
/app
  /(marketing)          → landing page, logo, pricing (public)
  /(auth)                → sign in / sign up
  /dashboard             → user's saved avatars
  /create                → the avatar creation flow (Path A / Path B)
  /editor/[avatarId]      → face/body/clothes editor + 3D viewer
  /api
    /avatar-engine        → server routes that call the vendor API
    /clothing-upload       → texture processing / 3D file validation
    /export                → generates download links (glb/fbx)
/components
  /three                 → R3F viewer, camera rig, lighting presets
  /editor                → sliders, tabs, style switcher
  /ui                    → shadcn components, theme toggle
/lib
  /avatar-sdk             → vendor API client wrapper
  /db                     → Prisma/Drizzle schema + queries
  /storage                → upload/download helpers
/server-actions           → mutations (save avatar, update config, delete)
```

- **Data mutations** → Next.js Server Actions.
- **Data fetching** → native `fetch` with caching where possible.
- **Every Server Action returns** `{ success, message, data }` and is wired
  to a toast notification on the frontend.
- **Protected routes** (`/dashboard`, `/create`, `/editor/*`) gated via
  middleware checking the NextAuth session.

---

## 6. Custom Clothing Upload — Spec

The user wants to be able to put **their own real clothes** (their actual
t-shirt, pants, shoes) on the avatar, not just the built-in wardrobe. Three
approaches were discussed; here's the chosen scope:

**✅ Included in MVP — Option A: Photo-as-texture on a template garment**
- User picks a garment *shape* from a built-in library (crew tee, hoodie,
  jeans, sneakers, etc.).
- User uploads a photo of their actual item (front-on, flat-lay or worn).
- Backend crops/cleans the image and UV-maps it onto the template mesh as a
  texture, so the color/print/logo/pattern is theirs even though the
  silhouette is the template's.
- Technically: this is straightforward image processing + existing UV maps
  on your garment templates — no ML reconstruction needed.

**✅ Included in MVP — Option C: Upload your own 3D garment file**
- For technical/Blender users who already have a 3D clothing model
  (`.obj`/`.glb`/`.fbx`), let them upload it directly.
- Backend runs a garment-fitting/retargeting step to drape and skin the
  uploaded mesh onto the avatar's body (a solved, if nontrivial, problem —
  distinct from generating a 3D garment out of thin air).

**❌ Explicitly NOT in MVP — Option B: AI reconstructs a 3D garment from photos**
- Flagged as a **Phase 2+ research goal**, not a launch feature.
- Reconstructing an arbitrary garment's true 3D shape from a phone photo is
  still an unsolved problem at consumer quality — there is no reliable
  off-the-shelf API for this today. Don't spend MVP engineering budget here.

**Claude Code note**: build the clothing pipeline so a garment is always
represented as `{ meshRef, textureRef }` internally — this keeps the door
open for Option B later (it would just supply a generated `meshRef` instead
of a template one) without refactoring the rest of the system.

---

## 7. Style Modes & Export Targets — Roadmap

Different intended uses require genuinely different outputs. Don't treat
these as reskins of the same asset — they have different technical
requirements:

| Style/target | Requirements | Phase |
|---|---|---|
| **Realistic + Blender-ready** | Rigged GLB/FBX, Mixamo-compatible skeleton, textures included | **Phase 1 (MVP)** |
| **Bitmoji/cartoon-style** | Stylized proportions/shading; may come "free" if the chosen avatar vendor supports a cartoon style toggle — verify during vendor evaluation | Phase 2 |
| **3D-print-ready** | Single merged **manifold/watertight** mesh, minimum wall thickness (typically 2–3mm depending on printer/material), no floating/disconnected geometry, no thin unsupported protrusions, exported as STL or printable OBJ, rig/textures not required | Phase 2 |

**Claude Code note on 3D printing**: even though this is Phase 2, design the
export module as a pluggable step (`exportAs(format, options)`) from day
one, so a `print-ready` formatter can be added later without touching the
avatar-generation or editor code.

---

## 8. Blender Integration Plan

- **Phase 1**: "Export for Blender" button → downloads a rigged `.fbx` or
  `.glb` with a Mixamo-compatible skeleton, ready to import directly into
  Blender.
- **Phase 2**: a real Blender add-on (Python, using Blender's `bpy` API)
  that authenticates the user and pulls their avatar (and future edits)
  directly into a Blender scene via your API, instead of manual
  export/import.

---

## 9. Logo & Branding

Recommendation: **generate the logo as hand-coded SVG**, not a raster AI
image — this is fully doable by a coding agent with no external
image-generation API needed, and scales perfectly for favicons, headers, and
social previews.

- **Direction**: modern, dark-mode-first, tech/SaaS feel.
- **Concept**: a simple face-outline or head silhouette that resolves into a
  wireframe cube/polygon mesh (literal nod to "you → 3D model"), in a
  blue-to-purple gradient that reads well on a dark background.
- **Deliverables needed**: SVG source, favicon (32x32, 180x180 apple-touch),
  and a wordmark lockup (icon + site name) for the header.

---

## 10. Theming

- Dark mode is the **default**; light mode is a toggle (not the other way
  around).
- Implement with `next-themes` + Tailwind's `dark:` variants + shadcn/ui's
  theming tokens (CSS variables), so both palettes stay consistent.

---

## 11. Language

English only for v1. No i18n scaffolding needed yet — don't over-engineer
for future localization at this stage.

---

## 12. Open Business Questions (not blocking Claude Code, but flag for the user)

- **Monetization/credits**: most avatar-generation vendors charge per
  generation after a free first avatar. Decide: free tier limits, whether to
  pass vendor cost through as credits, or a flat subscription.
- **Expected scale**: personal project vs. real public launch changes
  infra choices (e.g., managed Postgres tier, storage limits).
- **Final avatar-vendor choice**: pick after comparing embeddability, cost,
  and license terms (see §4 note).

---

## 13. Implementation Checklist

**Phase 1 — MVP**
- [ ] Scaffold Next.js app (App Router, Tailwind, shadcn/ui, dark/light theme)
- [ ] Set up auth (NextAuth.js) + protected routes middleware
- [ ] Set up Postgres schema: `users`, `avatars`, `avatar_versions`
- [ ] Integrate chosen avatar-generation vendor API (photo upload → GLB)
- [ ] Build Path A (full body from photo) and Path B (face + random body)
      creation flows
- [ ] Build the R3F 3D viewer (load/display GLB, orbit camera, lighting)
- [ ] Build the editor UI: face/body sliders, clothing tab (built-in wardrobe)
- [ ] Build clothing Option A: upload photo → texture onto template garment
- [ ] Build clothing Option C: upload own 3D garment file → auto-fit
- [ ] Build "Export for Blender" (rigged FBX/GLB download)
- [ ] Design + implement SVG logo, favicon, header lockup
- [ ] Save/reload avatars from dashboard
- [ ] Deploy to Vercel, set up `.env` per below

**Phase 2 — Later**
- [ ] Bitmoji/cartoon style mode
- [ ] 3D-print-ready export module (manifold mesh, STL export)
- [ ] Blender add-on (direct pull via API)
- [ ] AI-based 3D garment reconstruction (Option B)
- [ ] Credits/billing system

---

## 14. Environment Variables (`.env.example`)

```
# Auth
NEXTAUTH_SECRET=
NEXTAUTH_URL=

# Database
DATABASE_URL=

# Storage (pick one)
BLOB_READ_WRITE_TOKEN=
# or
S3_ACCESS_KEY_ID=
S3_SECRET_ACCESS_KEY=
S3_BUCKET_NAME=
S3_REGION=

# Avatar generation vendor
AVATAR_SDK_API_KEY=
AVATAR_SDK_API_URL=
```

---

## 15. Error Handling Standard

- Every Server Action returns `{ success: boolean, message: string, data?: any }`.
- Wire all Server Action results to toast notifications on the frontend.
- Implement `error.tsx` boundaries per route segment, especially around the
  3D viewer/editor (avatar loading can fail — vendor API down, malformed
  upload, unsupported file type for custom clothing uploads).
