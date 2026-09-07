# Incarnatrun

Turn a photo into a rigged 3D avatar you can edit in the browser and take into
Blender.

Upload one photo and get back a humanoid with clean topology, UVs, skin weights
and a **Mixamo-compatible skeleton**. Adjust the face, body and clothes, then
export GLB or FBX.

The product spec lives in [`PLAN/idea.md`](PLAN/idea.md); the technical design
derived from it is in
[`docs/superpowers/specs/`](docs/superpowers/specs/2026-09-07-incarnatrun-mvp-design.md).

---

## Running it

You need Node 20 or newer and a PostgreSQL database. A compose file is included
so you do not have to find one.

```bash
npm install
cp .env.example .env          # then set AUTH_SECRET (npx auth secret)
docker compose up -d          # Postgres on :5432
npm run db:push               # create the tables
npm run dev
```

Open http://localhost:3000, create an account, and upload a photo.

If you would rather not fill in a form:

```bash
npm run db:seed     # demo@incarnatrun.local / incarnatrun-demo
```

Nothing else needs configuring. Storage defaults to the local filesystem under
`.data/storage`, and the avatar engine defaults to the built-in one, which needs
no API key.

### Checking it works

```bash
npm test              # 252 unit tests: geometry, glTF, FBX, clothing, validation
npm run verify        # end-to-end against the real database and filesystem
npm run preview       # writes a sample avatar, atlas and turntable to .data/preview
```

`npm test` includes conformance runs against the official **Khronos glTF
validator**, so a generated avatar is checked against the specification rather
than only against this codebase's own expectations.

---

## How it is put together

```
app/                    Next.js App Router: marketing, auth, dashboard, create, editor
components/
  three/                the R3F viewer, shared by the editor and the landing hero
  editor/               body, face, wardrobe and export panels
  ui/                   Radix primitives styled in this project's tokens
lib/
  avatar-engine/        generation
    geometry/           parametric humanoid, Mixamo skeleton, skinning
    gltf/               glTF 2.0 and GLB writer
    photo/              face location, skin and hair sampling
    texture/            the face and skin atlas
    providers/          builtin engine plus vendor adapters
  clothing/             wardrobe, photo-to-texture, 3D garment import and fitting
  export/               exportAs(format, options) registry: glb, fbx, stl slot
  storage/              local, Vercel Blob and S3 behind one interface
  db/                   Prisma client and queries
server-actions/         mutations, all returning { success, message, data }
```

### The avatar engine is pluggable

`PLAN/idea.md` leaves the avatar-generation vendor undecided, because the choice
turns on cost, licence terms and export rights rather than on engineering. That
decision blocks nothing here.

Everything talks to `AvatarEngineProvider`. The **built-in engine implements it
fully** and generates a rigged GLB locally with no credentials, so the product
works today. Choosing a vendor later means filling in one adapter in
`lib/avatar-engine/providers/` and setting `AVATAR_ENGINE_PROVIDER`. No calling
code changes, and nothing outside that directory may import a vendor SDK.

### Avatars are versioned, not overwritten

Editing appends an `AvatarVersion` and repoints the avatar at it. That is what
makes avatars re-editable rather than one-shot, and it gives edit history for
free. Nothing you have saved is ever replaced.

### Garments are always `{ meshRef, textureRef }`

Whether a garment is a built-in template, your photo mapped onto one, or your
own uploaded model, it has the same shape internally. Phase 2's AI garment
reconstruction only has to supply a different `meshRef`.

---

## What it produces

| | |
|---|---|
| Rig | `mixamorig:` naming, 25 bones, T-pose |
| Units | metres, Y-up, +Z forward |
| Formats | GLB, and FBX zipped with its texture |
| Typical size | ~420 KB GLB with clothes and a 2048² atlas |

Both export formats carry the rig, so a downloaded file can go straight to
Mixamo for auto-animation or into Blender.

---

## Configuration

Everything is documented in [`.env.example`](.env.example). The two switches
worth knowing:

- `STORAGE_DRIVER` — `local` (default, no credentials), `vercel-blob`, or `s3`.
- `AVATAR_ENGINE_PROVIDER` — `builtin` (default, no credentials), or one of the
  vendor adapters once implemented.

---

## Scope

Phase 1, as specified in `PLAN/idea.md`, is complete: both creation paths, the
full editor, both custom-clothing routes, rigged export, versioning, and the
logo and theming.

Deliberately **not** built yet, and tracked as Phase 2 there:

- Cartoon and stylised output modes
- Print-ready STL export, which needs a merged manifold mesh and wall-thickness
  checks. It is registered in the export module and reports why it is disabled.
- A Blender add-on that pulls avatars in over the API
- AI reconstruction of a 3D garment from photos
- Billing and credits

### Known limits

- **Body reconstruction is heuristic.** Height and build are estimated from the
  photo's proportions with classical vision, not a model. It lands close and
  every slider is then the user's. Precise reconstruction is what an avatar
  vendor is bought for.
- **FBX upload is not supported** for custom garments. Use OBJ or GLB; every
  tool that writes FBX writes one of those.
- **FBX export is written to the 7.4 ASCII specification** and its structure is
  covered by tests, but it has not been opened in Blender from this repository.
  GLB is the fully verified path and is validated against Khronos on every test
  run.
