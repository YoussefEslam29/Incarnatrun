/**
 * Object storage behind one interface, with three interchangeable drivers.
 *
 * `local` writes under ./.data/storage and needs no credentials, so the whole
 * app runs on a fresh clone with nothing configured. `vercel-blob` and `s3`
 * are the deployment options from idea.md section 4. Callers never learn which
 * is active.
 *
 * Keys look like `avatars/<avatarId>/v3/model.glb`. They are built by the
 * helpers at the bottom of this file rather than by hand at call sites, so the
 * layout stays consistent and is changed in one place.
 */

export type StorageDriverId = "local" | "vercel-blob" | "s3";

export interface PutOptions {
  contentType: string;
  /**
   * Whether the object may be served publicly. Generated models and thumbnails
   * are; original uploaded photos are not, since they are pictures of the user.
   */
  access?: "public" | "private";
}

export interface StoredObject {
  key: string;
  size: number;
  contentType: string;
}

export interface StorageDriver {
  readonly id: StorageDriverId;
  put(key: string, data: Uint8Array, options: PutOptions): Promise<StoredObject>;
  get(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
  /**
   * A URL the browser can fetch. `expiresInSeconds` is honoured by drivers that
   * support signing; the local driver serves through an app route instead.
   */
  url(key: string, expiresInSeconds?: number): Promise<string>;
}

export class StorageError extends Error {
  constructor(
    message: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = "StorageError";
  }
}

export class ObjectNotFoundError extends StorageError {
  constructor(key: string) {
    super(`No stored object with key "${key}".`);
    this.name = "ObjectNotFoundError";
  }
}

/**
 * Rejects keys that could escape the storage root.
 *
 * The local driver maps keys straight onto file paths, so a key containing
 * `..` would read and write anywhere on disk. Keys are built from database ids
 * rather than user input today, but this is the kind of assumption that quietly
 * stops being true.
 */
export function assertSafeKey(key: string): void {
  if (
    !key ||
    key.startsWith("/") ||
    key.includes("..") ||
    key.includes("\\") ||
    key.includes("\0") ||
    /^[a-zA-Z]:/.test(key)
  ) {
    throw new StorageError(`Unsafe storage key: "${key}".`);
  }
}

let cached: StorageDriver | null = null;

export function getStorage(): StorageDriver {
  if (cached) return cached;

  const requested = (process.env.STORAGE_DRIVER ?? "local") as StorageDriverId;

  switch (requested) {
    case "vercel-blob":
      cached = createVercelBlobDriver();
      break;
    case "s3":
      cached = createS3Driver();
      break;
    case "local":
      cached = createLocalDriver();
      break;
    default:
      console.warn(`Unknown STORAGE_DRIVER "${requested}". Falling back to "local".`);
      cached = createLocalDriver();
  }

  return cached;
}

/** Test seam: drops the memoised driver so env changes take effect. */
export function resetStorage(): void {
  cached = null;
}

// ---------------------------------------------------------------------------
// Drivers
// ---------------------------------------------------------------------------

function createLocalDriver(): StorageDriver {
  // Imported lazily so the bundler never pulls node:fs into an edge runtime.
  const load = async () => {
    const [{ mkdir, readFile, writeFile, unlink, access }, path] = await Promise.all([
      import("node:fs/promises"),
      import("node:path"),
    ]);
    const root = path.resolve(process.cwd(), ".data", "storage");
    return { mkdir, readFile, writeFile, unlink, access, path, root };
  };

  return {
    id: "local",

    async put(key, data, options) {
      assertSafeKey(key);
      const { mkdir, writeFile, path, root } = await load();
      const file = path.join(root, key);
      await mkdir(path.dirname(file), { recursive: true });
      await writeFile(file, data);
      return { key, size: data.byteLength, contentType: options.contentType };
    },

    async get(key) {
      assertSafeKey(key);
      const { readFile, path, root } = await load();
      try {
        return await readFile(path.join(root, key));
      } catch {
        throw new ObjectNotFoundError(key);
      }
    },

    async delete(key) {
      assertSafeKey(key);
      const { unlink, path, root } = await load();
      try {
        await unlink(path.join(root, key));
      } catch {
        // Deleting something already gone is the desired end state.
      }
    },

    async exists(key) {
      assertSafeKey(key);
      const { access, path, root } = await load();
      try {
        await access(path.join(root, key));
        return true;
      } catch {
        return false;
      }
    },

    async url(key) {
      assertSafeKey(key);
      // Served by app/api/storage/[...key]/route.ts, which checks ownership.
      return `/api/storage/${key.split("/").map(encodeURIComponent).join("/")}`;
    },
  };
}

function createVercelBlobDriver(): StorageDriver {
  const load = async () => {
    try {
      return await import("@vercel/blob");
    } catch {
      throw new StorageError(
        'STORAGE_DRIVER is "vercel-blob" but @vercel/blob is not installed. Run: npm install @vercel/blob',
      );
    }
  };

  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    throw new StorageError(
      'STORAGE_DRIVER is "vercel-blob" but BLOB_READ_WRITE_TOKEN is not set.',
    );
  }

  // Blob URLs are opaque and unrelated to the key, so the mapping has to be
  // remembered. A process-local map is enough for a single deployment; a
  // multi-instance deployment should persist the URL on the row instead.
  const urls = new Map<string, string>();

  return {
    id: "vercel-blob",

    async put(key, data, options) {
      assertSafeKey(key);
      const { put } = await load();
      const result = await put(key, Buffer.from(data), {
        access: "public",
        contentType: options.contentType,
        addRandomSuffix: false,
        allowOverwrite: true,
      });
      urls.set(key, result.url);
      return { key, size: data.byteLength, contentType: options.contentType };
    },

    async get(key) {
      const href = await this.url(key);
      const response = await fetch(href);
      if (!response.ok) throw new ObjectNotFoundError(key);
      return Buffer.from(await response.arrayBuffer());
    },

    async delete(key) {
      const { del } = await load();
      const href = urls.get(key);
      if (href) {
        await del(href);
        urls.delete(key);
      }
    },

    async exists(key) {
      try {
        const response = await fetch(await this.url(key), { method: "HEAD" });
        return response.ok;
      } catch {
        return false;
      }
    },

    async url(key) {
      assertSafeKey(key);
      const known = urls.get(key);
      if (known) return known;

      const { head } = await load();
      try {
        const result = await head(key);
        urls.set(key, result.url);
        return result.url;
      } catch {
        throw new ObjectNotFoundError(key);
      }
    },
  };
}

function createS3Driver(): StorageDriver {
  const bucket = process.env.S3_BUCKET_NAME;
  const region = process.env.S3_REGION;

  if (!bucket || !region) {
    throw new StorageError(
      'STORAGE_DRIVER is "s3" but S3_BUCKET_NAME and S3_REGION are not both set.',
    );
  }

  const load = async () => {
    try {
      const [client, presigner] = await Promise.all([
        import("@aws-sdk/client-s3"),
        import("@aws-sdk/s3-request-presigner"),
      ]);
      return { ...client, ...presigner };
    } catch {
      throw new StorageError(
        'STORAGE_DRIVER is "s3" but the AWS SDK is not installed. Run: npm install @aws-sdk/client-s3 @aws-sdk/s3-request-presigner',
      );
    }
  };

  const makeClient = async () => {
    const { S3Client } = await load();
    return new S3Client({
      region,
      ...(process.env.S3_ENDPOINT
        ? { endpoint: process.env.S3_ENDPOINT, forcePathStyle: true }
        : {}),
      ...(process.env.S3_ACCESS_KEY_ID && process.env.S3_SECRET_ACCESS_KEY
        ? {
            credentials: {
              accessKeyId: process.env.S3_ACCESS_KEY_ID,
              secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
            },
          }
        : {}),
    });
  };

  return {
    id: "s3",

    async put(key, data, options) {
      assertSafeKey(key);
      const { PutObjectCommand } = await load();
      const client = await makeClient();
      await client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: Buffer.from(data),
          ContentType: options.contentType,
        }),
      );
      return { key, size: data.byteLength, contentType: options.contentType };
    },

    async get(key) {
      assertSafeKey(key);
      const { GetObjectCommand } = await load();
      const client = await makeClient();
      try {
        const result = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
        return Buffer.from(await result.Body!.transformToByteArray());
      } catch {
        throw new ObjectNotFoundError(key);
      }
    },

    async delete(key) {
      assertSafeKey(key);
      const { DeleteObjectCommand } = await load();
      const client = await makeClient();
      await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
    },

    async exists(key) {
      assertSafeKey(key);
      const { HeadObjectCommand } = await load();
      const client = await makeClient();
      try {
        await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
        return true;
      } catch {
        return false;
      }
    },

    async url(key, expiresInSeconds = 3600) {
      assertSafeKey(key);
      const { GetObjectCommand, getSignedUrl } = await load();
      const client = await makeClient();
      return getSignedUrl(client, new GetObjectCommand({ Bucket: bucket, Key: key }), {
        expiresIn: expiresInSeconds,
      });
    },
  };
}

// ---------------------------------------------------------------------------
// Key layout
// ---------------------------------------------------------------------------

export const storageKeys = {
  sourcePhoto: (avatarId: string, extension: string) =>
    `avatars/${avatarId}/source.${extension}`,
  faceCrop: (avatarId: string) => `avatars/${avatarId}/face.png`,
  model: (avatarId: string, version: number) => `avatars/${avatarId}/v${version}/model.glb`,
  texture: (avatarId: string, version: number) => `avatars/${avatarId}/v${version}/atlas.png`,
  thumbnail: (avatarId: string, version: number) => `avatars/${avatarId}/v${version}/thumb.png`,
  exportFile: (avatarId: string, version: number, format: string) =>
    `avatars/${avatarId}/v${version}/export.${format}`,
  garmentTexture: (garmentId: string) => `garments/${garmentId}/texture.png`,
  garmentMesh: (garmentId: string, extension: string) => `garments/${garmentId}/mesh.${extension}`,
};
