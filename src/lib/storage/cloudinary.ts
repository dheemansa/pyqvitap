import { v2 as cloudinary } from "cloudinary";
import type { StorageService, StorageUploadResult, StorageObjectResult } from "./types";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
});

export async function uploadPDFToCloudinary(folder: string, buffer: Buffer): Promise<string> {
  return new Promise((resolve, reject) => {
    const filename = `${Date.now()}-${Math.random().toString(36).substring(2)}`;
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: `papers/${folder}`,
        public_id: filename,
        resource_type: "raw",
        format: "pdf",
      },
      (error, result) => {
        if (error || !result) {
          return reject(error || new Error("Cloudinary upload failed"));
        }
        resolve(result.secure_url);
      }
    );
    uploadStream.end(buffer);
  });
}

export async function uploadThumbnailToCloudinary(buffer: Buffer): Promise<string> {
  return new Promise((resolve, reject) => {
    const filename = `${Date.now()}-${Math.random().toString(36).substring(2)}_thumb`;
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: "papers/thumbnails",
        public_id: filename,
        resource_type: "image",
        format: "png",
      },
      (error, result) => {
        if (error || !result) {
          return reject(error || new Error("Cloudinary thumbnail upload failed"));
        }
        resolve(result.secure_url);
      }
    );
    uploadStream.end(buffer);
  });
}

export class CloudinaryStorage implements StorageService {
  readonly providerName = "cloudinary";

  async uploadPDF(folder: string, buffer: Buffer | Uint8Array): Promise<StorageUploadResult> {
    const buf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
    const url = await uploadPDFToCloudinary(folder, buf);
    // Extract key relative to root
    const key = url.split(/\/upload\/(?:v\d+\/)?/)[1] || `papers/${folder}/${Date.now()}.pdf`;
    return {
      url,
      key,
      provider: "cloudinary",
    };
  }

  async uploadThumbnail(buffer: Buffer | Uint8Array): Promise<StorageUploadResult> {
    const buf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
    const url = await uploadThumbnailToCloudinary(buf);
    const key = url.split(/\/upload\/(?:v\d+\/)?/)[1] || `papers/thumbnails/${Date.now()}_thumb.png`;
    return {
      url,
      key,
      provider: "cloudinary",
    };
  }

  async getObject(key: string): Promise<StorageObjectResult | null> {
    const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
    if (!cloudName) return null;

    const isRaw = key.endsWith(".pdf") || key.startsWith("papers/pdfs/") || key.startsWith("papers/unapproved/");
    const url = `https://res.cloudinary.com/${cloudName}/${isRaw ? "raw" : "image"}/upload/${key}`;

    try {
      const res = await fetch(url);
      if (!res.ok || !res.body) return null;

      const contentType = res.headers.get("content-type") || (isRaw ? "application/pdf" : "image/webp");
      const contentLengthHeader = res.headers.get("content-length");
      const contentLength = contentLengthHeader ? parseInt(contentLengthHeader, 10) : undefined;
      const etag = res.headers.get("etag") || undefined;
      const lastModifiedHeader = res.headers.get("last-modified");
      const lastModified = lastModifiedHeader ? new Date(lastModifiedHeader) : undefined;

      return {
        body: res.body,
        contentType,
        contentLength,
        etag,
        lastModified,
      };
    } catch {
      return null;
    }
  }

  async hasObject(key: string): Promise<boolean> {
    const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
    if (!cloudName) return false;

    const isRaw = key.endsWith(".pdf") || key.startsWith("papers/pdfs/") || key.startsWith("papers/unapproved/");
    const url = `https://res.cloudinary.com/${cloudName}/${isRaw ? "raw" : "image"}/upload/${key}`;

    try {
      const res = await fetch(url, { method: "HEAD" });
      return res.ok;
    } catch {
      return false;
    }
  }
}
