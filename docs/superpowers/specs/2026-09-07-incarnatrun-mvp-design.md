# Incarnatrun — Phase 1 (MVP) Design

**Date**: 2026-09-07
**Source of truth**: `PLAN/idea.md` — product scope was fixed with the user there.

This document turns that scope into an implementable technical design. Where `PLAN/idea.md`
left a decision open, this document closes it and says why.

---

## 1. Goal

Ship the Phase 1 MVP from `PLAN/idea.md` §13: a user signs in, uploads a photo, gets a rigged
3D avatar, edits face/body/clothes in the browser, and downloads a Blender-ready file.

Explicitly out of scope: cartoon style mode, 3D-print export, the Blender add-on, AI
garment reconstruction, and billing. Each is Phase 2 in `PLAN/idea.md` §7 and §13.

---

## 2. The blocking decision, and how we unblock it

`PLAN/idea.md` §4 and §12 flag one blocker: **no avatar-generation vendor has been chosen**.
Vendor choice depends on cost, license, export rights and embeddability. That is a
business decision, not an engineering one.

**Resolution: the vendor is a plugged-in adapter, and the MVP ships with a working
built-in provider so nothing waits on the decision.**

```
AvatarEngineProvider (interface)
├── builtin        implemented here, fully functional, no API key
├── metaperson     adapter stub (Avatar SDK / MetaPerson Creator)
├── readyplayerme  adapter stub
└── avaturn        adapter stub
```

Selected by the `AVATAR_ENGINE_PROVIDER` environment variable. Every provider returns the
same `GeneratedAvatar` shape, so choosing a vendor later is a config change plus filling
in one adapter file. No calling code changes.

The `builtin` provider is not a mock that returns a canned file. It does real work.

1. Analyses the uploaded photo to locate the face region and sample skin and hair tone.
2. Builds a parametric humanoid mesh from body parameters.
3. Rigs it with a **Mixamo-compatible skeleton** (`mixamorig:Hips`, `mixamorig:Spine`, …).
4. Computes skin weights binding every vertex to bones.
5. UV-unwraps so the face texture lands on the head.
6. Writes a valid **glTF 2.0 / GLB** binary.

The full MVP is therefore demonstrable end to end with zero vendor credentials, and we get
a reference implementation that defines exactly what a vendor adapter must return.

---

## 3. Architecture

Follows `PLAN/idea.md` §5, with module boundaries made explicit.

```
app/
  (marketing)/            landing, pricing, public
  (auth)/                 sign in, sign up
  dashboard/              saved avatars
  create/                 Path A and Path B creation flow
  editor/[avatarId]/      3D viewer plus face, body and clothes editor
  api/
    avatar-engine/        generation and job status
    clothing-upload/      texture processing, 3D garment validation
    export/               signed download links
    storage/              local-driver file serving, dev only
components/
  three/                  R3F canvas, camera rig, lighting presets
  editor/                 sliders, tabs, wardrobe, style switcher
  ui/                     shadcn primitives, theme toggle
lib/
  avatar-engine/          provider interface and builtin generator
    geometry/             parametric humanoid, skeleton, skinning, UV
    gltf/                 glTF 2.0 and GLB writer
    providers/            builtin plus vendor adapters
  clothing/               garment model, texture pipeline, mesh fitting
  export/                 exportAs() registry: glb, fbx, plus an stl slot
  storage/                driver interface: local, vercel-blob, s3
  db/                     Prisma client and queries
  auth/                   Auth.js config
server-actions/           mutations
```

### Unit boundaries

Each unit below can be understood, changed and tested without reading the others.

| Unit | Does | Depends on |
|---|---|---|
| `lib/avatar-engine/gltf` | Writes glTF 2.0 and GLB bytes from plain mesh and skeleton structs | nothing |
| `lib/avatar-engine/geometry` | Turns body params into mesh, skeleton and weights | nothing |
| `lib/avatar-engine/providers/builtin` | Photo plus params to GLB | geometry, gltf, sharp |
| `lib/export` | `exportAs(format, opts)` to bytes, filename and mime | format modules |
| `lib/storage` | put, get, delete, signed URL | driver env config |
| `lib/clothing` | Photo to garment texture; 3D file to validated garment | sharp, storage |

The two hardest units, `gltf` and `geometry`, are pure functions over plain data with no
I/O. They are unit-testable and are built test-first.

---

## 4. Data model

```
User        1-n Avatar      1-n AvatarVersion
User        1-n Garment
Avatar      n-1 AvatarVersion (currentVersion)
```

- `Avatar` holds identity and the pointer to the current version.
- `AvatarVersion` holds an immutable snapshot: body params, face params, garment
  assignments, and the generated asset keys. Editing creates a new version. This is what
  makes avatars re-editable rather than one-shot per `PLAN/idea.md` §3.2, and it gives history
  for free.
- `Garment` is always `{ meshRef, textureRef }` per the explicit note in `PLAN/idea.md` §6, so
  Phase 2 AI reconstruction only has to supply a different `meshRef`.

Auth.js tables (`Account`, `Session`, `VerificationToken`) come from the Prisma adapter.

---

## 5. Data flow

**Creation, Path A and Path B**

```
upload photo -> validate type, size, dimensions
             -> store original                 [lib/storage]
             -> analyse photo                  [builtin provider]
             -> Path A: derive body params from photo
                Path B: pick a random body template, keep the face only
             -> generate rigged GLB            [geometry + gltf]
             -> store GLB                      [lib/storage]
             -> create Avatar and version 1    [lib/db]
             -> redirect to /editor/[id]
```

**Editing**

Slider changes update client state and re-render the R3F preview immediately by mutating
the loaded model. Nothing regenerates on the server per keystroke. Save is a Server Action
that regenerates the GLB from the final parameters and writes a new `AvatarVersion`. This
keeps the editor responsive and the server cheap.

**Export**

```
POST /api/export -> load current version -> exportAs(format) -> store -> signed URL
```

`exportAs` is a registry keyed by format. Adding `print-ready` later means registering one
more formatter. Nothing else is touched, per the `PLAN/idea.md` §7 note.

---

## 6. Export formats

| Format | How | Phase |
|---|---|---|
| `glb` | The generated asset, repacked with export metadata | 1 |
| `fbx` | ASCII FBX 7.4 writer: mesh, normals, UVs, material, texture, skeleton, skin deformer. Blender imports ASCII FBX. | 1 |
| `stl` | Registered but gated off. Requires manifold repair and wall-thickness checks. | 2 |

Both Phase 1 formats carry the Mixamo-compatible skeleton, so a downloaded file drops
straight into Mixamo or Blender.

---

## 7. Error handling

Per `PLAN/idea.md` §15, without exception.

- Every Server Action returns `{ success: boolean; message: string; data?: T }`. A shared
  `ActionResult<T>` type and an `action()` wrapper enforce this and convert thrown errors
  into that shape, so an unhandled exception can never reach the client.
- Every action result is wired to a toast.
- `error.tsx` boundaries per route segment, and specifically around the 3D viewer, which
  has the most failure modes: vendor API down, malformed upload, unsupported garment file,
  and a GLB that fails to parse.
- Uploads are validated server-side for MIME type, byte size and image dimensions before
  anything touches the generation pipeline.

---

## 8. Testing

- **Vitest unit tests, written first**, for the pure units: glTF and GLB byte layout,
  humanoid geometry, skeleton and skin weights, UV mapping, the export registry, FBX
  output structure, and validation rules. Correctness lives here, and bugs here are
  invisible without a test.
- Generated GLB files are asserted to parse back and to satisfy glTF 2.0 structural
  invariants: magic bytes, chunk alignment, accessor bounds, joint and weight counts.
- UI is verified by typecheck, lint, production build, and running the app.

---

## 9. Theming, branding, language

- Dark is the **default**, light is the toggle per `PLAN/idea.md` §10. `next-themes` with
  `defaultTheme="dark"`, plus shadcn CSS variable tokens so both palettes stay in step.
- Logo is **hand-coded SVG** per `PLAN/idea.md` §9: a head silhouette resolving into a wireframe
  polygon mesh, blue to purple gradient, dark-first. Ships as a React component, a favicon,
  and a header wordmark lockup.
- English only. No i18n scaffolding, per `PLAN/idea.md` §11.

---

## 10. Deliberate non-goals

- No i18n, no RTL.
- No billing or credits.
- No AI garment reconstruction.
- No vendor lock-in. Nothing outside `lib/avatar-engine/providers/` may import a vendor SDK.
