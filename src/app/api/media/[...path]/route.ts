import { getCloudflareContext } from "@opennextjs/cloudflare";
import { isAuthEnabled, isAuthorizedEmail } from "@/config/auth";
import { isCloudinaryFallbackEnabled } from "@/config/media";
import { auth, createClerkClient } from "@clerk/nextjs/server";

export const dynamic = "force-dynamic";

interface SessionClaimsWithEmail {
  email?: string;
  primaryEmail?: string;
  user_email?: string;
  primary_email_address?: string;
}

async function verifyMediaAuth(): Promise<Response | null> {
  const authEnabled = await isAuthEnabled();
  if (!authEnabled) {
    return null;
  }

  const publishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
  if (!publishableKey) {
    return new Response(
      JSON.stringify({
        error: "Unauthorized",
        message: "Authentication configuration missing",
      }),
      { status: 401, headers: { "Content-Type": "application/json" } },
    );
  }

  try {
    const session = await auth();
    if (!session || !session.userId) {
      return new Response(
        JSON.stringify({
          error: "Unauthorized",
          message: "Authentication required to access media",
        }),
        { status: 401, headers: { "Content-Type": "application/json" } },
      );
    }

    const claims = session.sessionClaims as
      | (SessionClaimsWithEmail & Record<string, unknown>)
      | null;
    let email =
      claims?.email ??
      claims?.primaryEmail ??
      claims?.user_email ??
      claims?.primary_email_address ??
      "";

    if (!email && process.env.CLERK_SECRET_KEY) {
      try {
        const clerk = createClerkClient({
          secretKey: process.env.CLERK_SECRET_KEY,
        });
        const user = await clerk.users.getUser(session.userId);
        const primaryEmailId = user.primaryEmailAddressId;
        const primaryObj = user.emailAddresses.find(
          (e) => e.id === primaryEmailId,
        );
        email = primaryObj?.emailAddress ?? "";
      } catch (lookupErr) {
        console.error(
          "[Media Gateway Auth] Failed to lookup user primary email:",
          lookupErr,
        );
      }
    }

    if (!isAuthorizedEmail(email)) {
      return new Response(
        JSON.stringify({
          error: "Forbidden",
          message: "Access restricted to @vitapstudent.ac.in verified accounts",
        }),
        { status: 403, headers: { "Content-Type": "application/json" } },
      );
    }

    return null;
  } catch (err) {
    console.error("[Media Gateway Auth Exception]", err);
    return new Response(
      JSON.stringify({
        error: "Unauthorized",
        message: "Authentication verification failed",
      }),
      { status: 401, headers: { "Content-Type": "application/json" } },
    );
  }
}

function inferContentType(key: string): string {
  if (key.endsWith(".pdf")) return "application/pdf";
  if (key.endsWith(".webp")) return "image/webp";
  if (key.endsWith(".png")) return "image/png";
  if (key.endsWith(".jpg") || key.endsWith(".jpeg")) return "image/jpeg";
  return "application/octet-stream";
}

function inferMediaType(key: string): "pdf" | "thumbnail" {
  if (key.endsWith(".pdf") || key.includes("/pdfs/")) {
    return "pdf";
  }
  return "thumbnail";
}

function getCacheControl(key: string, contentType: string): string {
  // STRICT SECURITY REQUIREMENT:
  // Protected PDFs must NEVER be publicly cached.
  if (key.endsWith(".pdf") || contentType === "application/pdf") {
    return "private, no-store";
  }
  // Thumbnails: edge POP caching (s-maxage=1y) + browser caching (7d)
  if (key.endsWith(".webp") || contentType.startsWith("image/")) {
    return "public, max-age=604800, s-maxage=31536000, stale-while-revalidate=86400";
  }
  return "private, no-store";
}

function isSafeKey(segments: string[]): boolean {
  if (!segments || segments.length === 0) return false;

  for (const segment of segments) {
    if (!segment) return false;
    // Check for traversal or path tampering
    if (
      segment === "." ||
      segment === ".." ||
      segment.includes("\\") ||
      segment.includes("\0")
    ) {
      return false;
    }
  }

  const key = segments.join("/");
  // Whitelist safe path characters: alphanumeric, _, -, ., /
  if (!/^[a-zA-Z0-9_\-\.\/]+$/.test(key)) {
    return false;
  }

  // Ensure key resides within known media folders
  if (!key.startsWith("papers/")) {
    return false;
  }

  return true;
}

async function getR2Bucket(): Promise<R2Bucket | undefined> {
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
    return ctx?.env?.R2_MEDIA;
  } catch {
    return undefined;
  }
}

export async function GET(
  req: Request,
  { params }: { params: { path: string[] } },
) {
  const authResponse = await verifyMediaAuth();
  if (authResponse) {
    return authResponse;
  }

  const segments = params.path;

  if (!isSafeKey(segments)) {
    return new Response("Invalid or unsafe media key", { status: 400 });
  }

  const key = segments.join("/");

  // 1. Try fetching from Cloudflare R2 bucket binding
  let r2Error: unknown = null;
  try {
    const r2Bucket = await getR2Bucket();

    if (r2Bucket) {
      const r2Object = await r2Bucket.get(key);
      if (r2Object?.body) {
        const contentType =
          r2Object.httpMetadata?.contentType ?? inferContentType(key);
        const cacheControl = getCacheControl(key, contentType);

        const headers = new Headers();
        headers.set("Content-Type", contentType);
        headers.set("Cache-Control", cacheControl);
        headers.set("X-Content-Type-Options", "nosniff");
        headers.set("Content-Length", r2Object.size.toString());

        if (r2Object.httpEtag) {
          headers.set("ETag", r2Object.httpEtag);
        }
        if (r2Object.uploaded) {
          headers.set("Last-Modified", r2Object.uploaded.toUTCString());
        }

        return new Response(r2Object.body, { status: 200, headers });
      }
    }
  } catch (err) {
    r2Error = err;
    console.error(`[Media Gateway] R2 read error for key "${key}":`, r2Error);
  }

  // 2. Check if Cloudinary Fallback is Enabled
  const fallbackEnabled = await isCloudinaryFallbackEnabled();
  const reason = r2Error ? "r2_error" : "not_found";

  if (!fallbackEnabled) {
    console.warn(
      JSON.stringify({
        event: "media_r2_failure",
        reason,
        fallback_enabled: false,
        key,
      }),
    );

    if (r2Error) {
      return new Response("Media retrieval error", { status: 500 });
    }
    return new Response("Media not found", { status: 404 });
  }

  // 3. Fallback is Enabled: Structured Fallback Log (Observability)
  console.info(
    JSON.stringify({
      event: "media_fallback",
      primary: "r2",
      fallback: "cloudinary",
      reason,
      media_type: inferMediaType(key),
      key,
    }),
  );

  // 4. Server-side Cloudinary Fallback (NO REDIRECTS to client)
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  if (!cloudName) {
    console.error("[Media Gateway] CLOUDINARY_CLOUD_NAME is not configured");
    return new Response("Media storage configuration error", { status: 500 });
  }

  const isRaw =
    key.endsWith(".pdf") ||
    key.startsWith("papers/pdfs/") ||
    key.startsWith("papers/unapproved/");
  const cloudinaryUrl = `https://res.cloudinary.com/${cloudName}/${isRaw ? "raw" : "image"}/upload/${key}`;

  try {
    const cldResponse = await fetch(cloudinaryUrl);

    if (!cldResponse.ok || !cldResponse.body) {
      if (cldResponse.status === 404) {
        return new Response("Media not found", { status: 404 });
      }
      return new Response("Upstream media error", {
        status: cldResponse.status,
      });
    }

    // Structured Fallback Success Log
    console.info(
      JSON.stringify({
        event: "media_fallback_success",
        primary: "r2",
        fallback: "cloudinary",
        key,
      }),
    );

    const contentType =
      cldResponse.headers.get("content-type") ?? inferContentType(key);
    const cacheControl = getCacheControl(key, contentType);

    const headers = new Headers();
    headers.set("Content-Type", contentType);
    headers.set("Cache-Control", cacheControl);
    headers.set("X-Content-Type-Options", "nosniff");

    const contentLength = cldResponse.headers.get("content-length");
    if (contentLength) {
      headers.set("Content-Length", contentLength);
    }
    const etag = cldResponse.headers.get("etag");
    if (etag) {
      headers.set("ETag", etag);
    }
    const lastModified = cldResponse.headers.get("last-modified");
    if (lastModified) {
      headers.set("Last-Modified", lastModified);
    }

    // Stream Cloudinary bytes directly through the Worker gateway
    return new Response(cldResponse.body, { status: 200, headers });
  } catch (fallbackError) {
    console.error(
      `[Media Gateway] Cloudinary fallback error for key "${key}":`,
      fallbackError,
    );
    return new Response("Failed to fetch media asset", { status: 502 });
  }
}

export async function HEAD(
  req: Request,
  { params }: { params: { path: string[] } },
) {
  const authResponse = await verifyMediaAuth();
  if (authResponse) {
    return new Response(null, { status: authResponse.status });
  }

  const segments = params.path;

  if (!isSafeKey(segments)) {
    return new Response(null, { status: 400 });
  }

  const key = segments.join("/");

  // 1. Try R2 HEAD
  let r2Error: unknown = null;
  try {
    const r2Bucket = await getR2Bucket();

    if (r2Bucket) {
      const head = await r2Bucket.head(key);
      if (head) {
        const contentType =
          head.httpMetadata?.contentType ?? inferContentType(key);
        const cacheControl = getCacheControl(key, contentType);

        const headers = new Headers();
        headers.set("Content-Type", contentType);
        headers.set("Cache-Control", cacheControl);
        headers.set("X-Content-Type-Options", "nosniff");
        headers.set("Content-Length", head.size.toString());

        if (head.httpEtag) headers.set("ETag", head.httpEtag);
        if (head.uploaded)
          headers.set("Last-Modified", head.uploaded.toUTCString());

        return new Response(null, { status: 200, headers });
      }
    }
  } catch (err) {
    r2Error = err;
    console.error(
      `[Media Gateway HEAD] R2 head error for key "${key}":`,
      r2Error,
    );
  }

  // 2. Check if Cloudinary Fallback is Enabled
  const fallbackEnabled = await isCloudinaryFallbackEnabled();
  const reason = r2Error ? "r2_error" : "not_found";

  if (!fallbackEnabled) {
    console.warn(
      JSON.stringify({
        event: "media_r2_failure",
        reason,
        fallback_enabled: false,
        key,
      }),
    );

    if (r2Error) {
      return new Response(null, { status: 500 });
    }
    return new Response(null, { status: 404 });
  }

  // 3. Fallback is Enabled: Structured Fallback Log (Observability)
  console.info(
    JSON.stringify({
      event: "media_fallback",
      primary: "r2",
      fallback: "cloudinary",
      reason,
      media_type: inferMediaType(key),
      key,
    }),
  );

  // 4. Cloudinary HEAD fallback
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  if (!cloudName) {
    return new Response(null, { status: 500 });
  }

  const isRaw =
    key.endsWith(".pdf") ||
    key.startsWith("papers/pdfs/") ||
    key.startsWith("papers/unapproved/");
  const cloudinaryUrl = `https://res.cloudinary.com/${cloudName}/${isRaw ? "raw" : "image"}/upload/${key}`;

  try {
    const cldResponse = await fetch(cloudinaryUrl, { method: "HEAD" });

    if (!cldResponse.ok) {
      return new Response(null, {
        status: cldResponse.status === 404 ? 404 : 502,
      });
    }

    console.info(
      JSON.stringify({
        event: "media_fallback_success",
        primary: "r2",
        fallback: "cloudinary",
        key,
      }),
    );

    const contentType =
      cldResponse.headers.get("content-type") ?? inferContentType(key);
    const cacheControl = getCacheControl(key, contentType);

    const headers = new Headers();
    headers.set("Content-Type", contentType);
    headers.set("Cache-Control", cacheControl);
    headers.set("X-Content-Type-Options", "nosniff");

    const contentLength = cldResponse.headers.get("content-length");
    if (contentLength) headers.set("Content-Length", contentLength);
    const etag = cldResponse.headers.get("etag");
    if (etag) headers.set("ETag", etag);
    const lastModified = cldResponse.headers.get("last-modified");
    if (lastModified) headers.set("Last-Modified", lastModified);

    return new Response(null, { status: 200, headers });
  } catch {
    return new Response(null, { status: 502 });
  }
}
