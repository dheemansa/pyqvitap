import { getCloudflareContext } from "@opennextjs/cloudflare";
import type { StorageService, StorageUploadResult, StorageObjectResult } from "./types";

export class R2Storage implements StorageService {
  readonly providerName = "r2";

  private async getBucket(): Promise<R2Bucket | null> {
    try {
      const ctx = getCloudflareContext();
      if (ctx?.env?.R2_MEDIA) return ctx.env.R2_MEDIA;
    } catch {
      // In Node.js development without pre-bound worker global, resolve asynchronously via wrangler
    }

    try {
      if (!process.env.NEXT_RUNTIME && typeof window === "undefined") {
        process.env.NEXT_RUNTIME = "nodejs";
      }
      const ctx = await getCloudflareContext({ async: true });
      return ctx?.env?.R2_MEDIA ?? null;
    } catch {
      return null;
    }
  }

  async uploadPDF(folderOrKey: string, buffer: Buffer | Uint8Array): Promise<StorageUploadResult> {
    const bucket = await this.getBucket();
    if (!bucket) {
      throw new Error("R2_MEDIA bucket binding is not available in the current context");
    }
    const filename = `${Date.now()}-${Math.random().toString(36).substring(2)}.pdf`;
    const key = folderOrKey.includes("/") && folderOrKey.endsWith(".pdf")
      ? folderOrKey
      : `papers/${folderOrKey}/${filename}`;

    await bucket.put(key, buffer, {
      httpMetadata: {
        contentType: "application/pdf",
      },
    });

    return {
      key,
      url: `/api/media/${key}`,
      provider: "r2",
    };
  }

  async uploadThumbnail(buffer: Buffer | Uint8Array, keyOrFolder?: string): Promise<StorageUploadResult> {
    const bucket = await this.getBucket();
    if (!bucket) {
      throw new Error("R2_MEDIA bucket binding is not available in the current context");
    }
    const filename = `${Date.now()}-${Math.random().toString(36).substring(2)}_thumb.webp`;
    const key = keyOrFolder?.endsWith(".webp")
      ? keyOrFolder
      : `papers/thumbnails/${filename}`;

    await bucket.put(key, buffer, {
      httpMetadata: {
        contentType: "image/webp",
      },
    });

    return {
      key,
      url: `/api/media/${key}`,
      provider: "r2",
    };
  }

  async getObject(key: string): Promise<StorageObjectResult | null> {
    const bucket = await this.getBucket();
    if (!bucket) return null;
    const obj = await bucket.get(key);
    if (!obj) return null;

    return {
      body: obj.body,
      contentType: obj.httpMetadata?.contentType ?? (key.endsWith(".pdf") ? "application/pdf" : "image/webp"),
      contentLength: obj.size,
      etag: obj.httpEtag,
      lastModified: obj.uploaded,
    };
  }

  async hasObject(key: string): Promise<boolean> {
    const bucket = await this.getBucket();
    if (!bucket) return false;
    const head = await bucket.head(key);
    return head !== null;
  }
}
