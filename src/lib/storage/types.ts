export interface StorageUploadResult {
  url: string;
  key: string;
  provider: "cloudinary" | "r2";
}

export interface StorageObjectResult {
  body: ReadableStream<Uint8Array> | null;
  contentType: string;
  contentLength?: number;
  etag?: string;
  lastModified?: Date;
}

export interface StorageService {
  readonly providerName: string;
  uploadPDF(
    folderOrKey: string,
    buffer: Buffer | Uint8Array,
  ): Promise<StorageUploadResult>;
  uploadThumbnail(
    buffer: Buffer | Uint8Array,
    keyOrFolder?: string,
  ): Promise<StorageUploadResult>;
  getObject(key: string): Promise<StorageObjectResult | null>;
  hasObject(key: string): Promise<boolean>;
}
