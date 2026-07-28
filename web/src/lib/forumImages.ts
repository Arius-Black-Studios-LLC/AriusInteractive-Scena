import { loadLegacyScripts } from "../legacy/loadLegacy";

export const FORUM_IMAGE_MAX_COUNT = 4;
export const FORUM_IMAGE_MAX_BYTES = 5 * 1024 * 1024;

const ALLOWED_MIME = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);
const BUCKET = "series-assets";

type StorageClient = {
  storage: {
    from: (bucket: string) => {
      upload: (
        path: string,
        blob: Blob,
        opts: { upsert: boolean; contentType: string },
      ) => Promise<{ error: { message?: string } | null }>;
    };
  };
};

export function validateForumImageFile(file: File): string | null {
  if (!ALLOWED_MIME.has(file.type)) {
    return "Only PNG, JPG, WebP, and GIF images are allowed.";
  }
  if (file.size > FORUM_IMAGE_MAX_BYTES) {
    return "Each image must be 5 MB or smaller.";
  }
  return null;
}

function extFromMime(mime: string): string {
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
  if (mime === "image/gif") return "gif";
  return "jpg";
}

function publicStorageUrl(storagePath: string): string {
  const cfg = window.ARLECO_CONFIG || window.SCENA_CONFIG;
  const base = (cfg?.supabaseUrl || "").replace(/\/$/, "");
  return `${base}/storage/v1/object/public/${BUCKET}/${storagePath}`;
}

async function getStorageClient(): Promise<StorageClient | null> {
  await loadLegacyScripts(["scena-auth.js"]);
  const auth = window.ScenaAuth;
  if (!auth?.isConfigured?.() || !auth.getClient) return null;
  return auth.getClient() as StorageClient;
}

async function getUserId(): Promise<string | null> {
  await loadLegacyScripts(["scena-auth.js"]);
  const auth = window.ScenaAuth;
  const session = auth?.getSession ? await auth.getSession() : null;
  return session?.user?.id || null;
}

/** Upload forum images to `{userId}/forum/{contextKey}/{assetId}.ext` in series-assets. */
export async function uploadForumImages(
  files: File[],
  contextKey: string,
): Promise<string[]> {
  if (files.length === 0) return [];
  if (files.length > FORUM_IMAGE_MAX_COUNT) {
    throw new Error(`At most ${FORUM_IMAGE_MAX_COUNT} images per post.`);
  }

  for (const file of files) {
    const err = validateForumImageFile(file);
    if (err) throw new Error(err);
  }

  const userId = await getUserId();
  if (!userId) throw new Error("Sign in to attach images.");

  const sb = await getStorageClient();
  if (!sb) throw new Error("Cloud storage is not configured.");

  const safeKey = contextKey.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 64) || "draft";
  const urls: string[] = [];

  for (const file of files) {
    const assetId = crypto.randomUUID();
    const ext = extFromMime(file.type);
    const path = `${userId}/forum/${safeKey}/${assetId}.${ext}`;
    const result = await sb.storage.from(BUCKET).upload(path, file, {
      upsert: false,
      contentType: file.type,
    });
    if (result.error) {
      throw new Error(result.error.message || "Could not upload image.");
    }
    urls.push(publicStorageUrl(path));
  }

  return urls;
}

/** Local-only fallback: store small images as data URLs. */
export async function filesToDataUrls(files: File[]): Promise<string[]> {
  if (files.length === 0) return [];
  const urls: string[] = [];
  for (const file of files) {
    const err = validateForumImageFile(file);
    if (err) throw new Error(err);
    if (file.size > 1024 * 1024) {
      throw new Error("Offline mode supports images up to 1 MB each.");
    }
    urls.push(await readFileAsDataUrl(file));
  }
  return urls;
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Could not read image."));
    reader.readAsDataURL(file);
  });
}
