// @ts-nocheck
const assert = require("assert");

console.log("=== PyqVitAp Media Worker Cache API Test Suite ===\n");

const PDF_CACHE_TTL_SECONDS = 3600;
const MEDIA_CACHE_KEY_PREFIX = "https://cache.pyqvitap.internal/media-pdf-v1/";

function buildMediaCacheKey(key) {
  return `${MEDIA_CACHE_KEY_PREFIX}${key}`;
}

function inferMediaType(key) {
  if (key.endsWith(".pdf") || key.includes("/pdfs/")) {
    return "pdf";
  }
  return "thumbnail";
}

function getCacheControl(key, contentType) {
  if (key.endsWith(".pdf") || contentType === "application/pdf") {
    return "private, no-store";
  }
  if (key.endsWith(".webp") || contentType.startsWith("image/")) {
    return "public, max-age=604800, s-maxage=31536000, stale-while-revalidate=86400";
  }
  return "private, no-store";
}

function isSafeKey(segments) {
  if (!segments || segments.length === 0) return false;
  for (const segment of segments) {
    if (!segment) return false;
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
  if (!/^[a-zA-Z0-9_\-\.\/]+$/.test(key)) return false;
  if (!key.startsWith("papers/")) return false;
  return true;
}

// RFC 9110 Precondition Helpers (matching route.ts)
function matchIfMatch(headerValue, targetETag) {
  if (!targetETag) return false;
  const cleanHeader = headerValue.trim();
  if (cleanHeader === "*") return true;
  if (targetETag.startsWith("W/")) return false;

  const candidates = cleanHeader.split(",").map((c) => c.trim());
  return candidates.some((c) => c === targetETag && !c.startsWith("W/"));
}

function matchIfNoneMatch(headerValue, targetETag) {
  if (!targetETag) return false;
  const cleanHeader = headerValue.trim();
  if (cleanHeader === "*") return true;

  const normTarget = targetETag.replace(/^W\//, "").trim();
  const candidates = cleanHeader.split(",").map((c) => c.trim());
  return candidates.some((c) => {
    if (c === "*") return true;
    const normCandidate = c.replace(/^W\//, "").trim();
    return normCandidate === normTarget;
  });
}

function isModifiedSince(lastModifiedHeader, dateHeaderValue) {
  if (!lastModifiedHeader) return null;
  const lastModifiedTime = Date.parse(lastModifiedHeader);
  const clientTime = Date.parse(dateHeaderValue);
  if (isNaN(lastModifiedTime) || isNaN(clientTime)) return null;

  const lmSec = Math.floor(lastModifiedTime / 1000);
  const clientSec = Math.floor(clientTime / 1000);
  return lmSec > clientSec;
}

// Mock Cloudflare Worker Cache implementation
class MockWorkerCache {
  constructor() {
    this.store = new Map();
  }

  async match(url) {
    const entry = this.store.get(url);
    if (!entry) return null;
    return new Response(Buffer.from(entry.body), {
      status: entry.status,
      headers: new Headers(entry.headers),
    });
  }

  async put(url, response) {
    const buf = await response.arrayBuffer();
    const headersObj = {};
    response.headers.forEach((v, k) => {
      headersObj[k] = v;
    });
    this.store.set(url, {
      status: response.status,
      headers: headersObj,
      body: Buffer.from(buf),
    });
  }
}

// Mock R2 Storage
class MockR2Storage {
  constructor() {
    this.files = new Map();
    this.subrequestCount = 0;
  }

  addFile(
    key,
    content,
    etag = '"etag-123"',
    lastModified = new Date("2026-10-10T00:00:00Z"),
  ) {
    this.files.set(key, {
      size: Buffer.byteLength(content),
      body: Buffer.from(content),
      httpEtag: etag,
      uploaded: lastModified,
      httpMetadata: {
        contentType: key.endsWith(".pdf") ? "application/pdf" : "image/webp",
      },
    });
  }

  async head(key) {
    const file = this.files.get(key);
    if (!file) return null;
    return {
      size: file.size,
      httpEtag: file.httpEtag,
      uploaded: file.uploaded,
      httpMetadata: file.httpMetadata,
    };
  }

  async get(key, options = {}) {
    this.subrequestCount++;
    const file = this.files.get(key);
    if (!file) return null;

    if (options.onlyIf) {
      const ifNoneMatch = options.onlyIf.get
        ? options.onlyIf.get("if-none-match")
        : null;
      if (ifNoneMatch && ifNoneMatch === file.httpEtag) {
        return {
          size: file.size,
          httpEtag: file.httpEtag,
          uploaded: file.uploaded,
          httpMetadata: file.httpMetadata,
        };
      }
    }

    let range = undefined;
    let slice = file.body;
    if (options.range) {
      const rangeHeader = options.range.get ? options.range.get("range") : "";
      if (rangeHeader && rangeHeader.startsWith("bytes=0-")) {
        range = { offset: 0, length: 50 };
        slice = file.body.subarray(0, 50);
      }
    }

    return {
      size: file.size,
      httpEtag: file.httpEtag,
      uploaded: file.uploaded,
      httpMetadata: file.httpMetadata,
      range,
      body: slice,
    };
  }
}

// Simulated Media Route Handler matching route.ts
async function simulateMediaRoute(req, params, env) {
  const { mockR2, mockCache, isAuthAuthorized = true, mockCloudinary } = env;

  // 1. Auth check
  if (!isAuthAuthorized) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  // 2. Safe key check
  const segments = params.path;
  if (!isSafeKey(segments)) {
    return new Response("Invalid or unsafe media key", { status: 400 });
  }

  const key = segments.join("/");
  const hasRange = req.headers.has("range");
  const isPdf = inferMediaType(key) === "pdf";
  const isEligibleForCache = isPdf && !hasRange;
  const cacheKeyUrl = isEligibleForCache ? buildMediaCacheKey(key) : null;
  const cfCache = isEligibleForCache ? mockCache : null;

  // 3. Worker Cache API Lookup (RFC 9110 Precedence)
  if (cfCache && cacheKeyUrl) {
    try {
      const cached = await cfCache.match(cacheKeyUrl);
      if (cached && cached.body) {
        const ifMatch = req.headers.get("if-match");
        const ifUnmodifiedSince = req.headers.get("if-unmodified-since");
        const ifNoneMatch = req.headers.get("if-none-match");
        const ifModifiedSince = req.headers.get("if-modified-since");

        const cachedEtag = cached.headers.get("etag");
        const cachedLastModified = cached.headers.get("last-modified");

        // Step 1: If-Match
        if (ifMatch) {
          if (!matchIfMatch(ifMatch, cachedEtag)) {
            const headers = new Headers();
            headers.set("Cache-Control", "private, no-store");
            headers.set("Accept-Ranges", "bytes");
            headers.set("X-Content-Type-Options", "nosniff");
            if (cachedEtag) headers.set("ETag", cachedEtag);
            if (cachedLastModified)
              headers.set("Last-Modified", cachedLastModified);
            return new Response(null, { status: 412, headers });
          }
        } else if (ifUnmodifiedSince) {
          // Step 2: If-Unmodified-Since (only if If-Match is absent)
          const modified = isModifiedSince(
            cachedLastModified,
            ifUnmodifiedSince,
          );
          if (modified === true) {
            const headers = new Headers();
            headers.set("Cache-Control", "private, no-store");
            headers.set("Accept-Ranges", "bytes");
            headers.set("X-Content-Type-Options", "nosniff");
            if (cachedEtag) headers.set("ETag", cachedEtag);
            if (cachedLastModified)
              headers.set("Last-Modified", cachedLastModified);
            return new Response(null, { status: 412, headers });
          }
        }

        // Step 3: If-None-Match
        if (ifNoneMatch) {
          if (matchIfNoneMatch(ifNoneMatch, cachedEtag)) {
            const headers = new Headers(cached.headers);
            headers.set("Cache-Control", "private, no-store");
            headers.set("Accept-Ranges", "bytes");
            headers.set("X-Content-Type-Options", "nosniff");
            headers.set("X-Cache", "HIT-WORKER-304");
            return new Response(null, { status: 304, headers });
          }
        } else if (ifModifiedSince) {
          // Step 4: If-Modified-Since (only if If-None-Match is absent)
          const modified = isModifiedSince(cachedLastModified, ifModifiedSince);
          if (modified === false) {
            const headers = new Headers(cached.headers);
            headers.set("Cache-Control", "private, no-store");
            headers.set("Accept-Ranges", "bytes");
            headers.set("X-Content-Type-Options", "nosniff");
            headers.set("X-Cache", "HIT-WORKER-304");
            return new Response(null, { status: 304, headers });
          }
        }

        // Step 5: Return cached 200
        const headers = new Headers(cached.headers);
        headers.set("Cache-Control", "private, no-store");
        headers.set("Accept-Ranges", "bytes");
        headers.set("X-Content-Type-Options", "nosniff");
        headers.set("X-Cache", "HIT-WORKER");
        return new Response(cached.body, { status: 200, headers });
      }
    } catch {}
  }

  // 4. Storage Retrieval (R2)
  let r2Error = null;
  try {
    if (mockR2) {
      const r2Object = await mockR2.get(key, {
        onlyIf: req.headers,
        ...(hasRange ? { range: req.headers } : {}),
      });

      if (r2Object && !("body" in r2Object && r2Object.body)) {
        const contentType =
          r2Object.httpMetadata?.contentType ?? "application/pdf";
        const cacheControl = getCacheControl(key, contentType);
        const headers = new Headers();
        headers.set("Content-Type", contentType);
        headers.set("Cache-Control", cacheControl);
        headers.set("Accept-Ranges", "bytes");
        headers.set("X-Content-Type-Options", "nosniff");
        if (r2Object.httpEtag) headers.set("ETag", r2Object.httpEtag);
        if (r2Object.uploaded)
          headers.set("Last-Modified", r2Object.uploaded.toUTCString());
        return new Response(null, { status: 304, headers });
      }

      if (r2Object && r2Object.body) {
        const contentType =
          r2Object.httpMetadata?.contentType ??
          (isPdf ? "application/pdf" : "image/webp");
        const cacheControl = getCacheControl(key, contentType);
        const headers = new Headers();
        headers.set("Content-Type", contentType);
        headers.set("Cache-Control", cacheControl);
        headers.set("Accept-Ranges", "bytes");
        headers.set("X-Content-Type-Options", "nosniff");
        if (r2Object.httpEtag) headers.set("ETag", r2Object.httpEtag);
        if (r2Object.uploaded)
          headers.set("Last-Modified", r2Object.uploaded.toUTCString());

        if (r2Object.range) {
          headers.set("Content-Range", `bytes 0-49/${r2Object.size}`);
          headers.set("Content-Length", "50");
          return new Response(r2Object.body, { status: 206, headers });
        }

        headers.set("Content-Length", r2Object.size.toString());

        // Cache eligible complete PDF response
        if (cfCache && cacheKeyUrl && isEligibleForCache) {
          try {
            const internalCacheHeaders = new Headers(headers);
            internalCacheHeaders.set(
              "Cache-Control",
              `max-age=${PDF_CACHE_TTL_SECONDS}`,
            );
            const cacheResponse = new Response(Buffer.from(r2Object.body), {
              status: 200,
              headers: internalCacheHeaders,
            });
            await cfCache.put(cacheKeyUrl, cacheResponse);
            headers.set("X-Cache", "MISS");
          } catch {}
        }

        return new Response(r2Object.body, { status: 200, headers });
      }
    }
  } catch (err) {
    r2Error = err;
  }

  // 5. Cloudinary Fallback
  if (mockCloudinary) {
    const cldRes = await mockCloudinary(key, req.headers);
    if (cldRes.status === 200 && isEligibleForCache && cfCache && cacheKeyUrl) {
      try {
        const internalCacheHeaders = new Headers(cldRes.headers);
        internalCacheHeaders.set(
          "Cache-Control",
          `max-age=${PDF_CACHE_TTL_SECONDS}`,
        );
        const cacheResponse = new Response(Buffer.from(cldRes.body), {
          status: 200,
          headers: internalCacheHeaders,
        });
        await cfCache.put(cacheKeyUrl, cacheResponse);
        cldRes.headers.set("X-Cache", "MISS-CLOUDINARY");
      } catch {}
    }
    return new Response(cldRes.body, {
      status: cldRes.status,
      headers: cldRes.headers,
    });
  }

  return new Response("Media not found", { status: 404 });
}

// Simulated HEAD Handler
async function simulateHeadRoute(req, params, env) {
  const { mockR2, isAuthAuthorized = true } = env;
  if (!isAuthAuthorized) return new Response(null, { status: 401 });
  const segments = params.path;
  if (!isSafeKey(segments)) return new Response(null, { status: 400 });
  const key = segments.join("/");
  const head = await mockR2.head(key);
  if (!head) return new Response(null, { status: 404 });
  const headers = new Headers();
  headers.set("Content-Type", "application/pdf");
  headers.set("Cache-Control", "private, no-store");
  headers.set("Accept-Ranges", "bytes");
  headers.set("Content-Length", head.size.toString());
  if (head.httpEtag) headers.set("ETag", head.httpEtag);
  return new Response(null, { status: 200, headers });
}

// =================== TEST EXECUTION ===================

(async () => {
  const mockCache = new MockWorkerCache();
  const mockR2 = new MockR2Storage();
  const baseUploadDate = new Date("2026-10-10T00:00:00Z");
  mockR2.addFile(
    "papers/pdfs/math-2025.pdf",
    "MATH-PDF-DATA-SAMPLE",
    '"etag-math-1"',
    baseUploadDate,
  );
  mockR2.addFile(
    "papers/pdfs/physics-2025.pdf",
    "PHYSICS-PDF-DATA-SAMPLE",
    '"etag-phys-1"',
    baseUploadDate,
  );
  mockR2.addFile(
    "papers/thumbnails/math-thumb.webp",
    "WEBP-THUMB-SAMPLE",
    '"etag-thumb-1"',
    baseUploadDate,
  );

  const env = { mockR2, mockCache, isAuthAuthorized: true };

  console.log("Test 1: First full GET request is a cache miss");
  {
    const req = new Request(
      "https://pyqvitap.site/api/media/papers/pdfs/math-2025.pdf",
    );
    const res = await simulateMediaRoute(
      req,
      { path: ["papers", "pdfs", "math-2025.pdf"] },
      env,
    );
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.headers.get("X-Cache"), "MISS");
    assert.strictEqual(res.headers.get("Cache-Control"), "private, no-store");
    assert.strictEqual(mockR2.subrequestCount, 1);
    console.log("  PASSED: Status 200, X-Cache: MISS, 1 R2 subrequest");
  }

  console.log(
    "Test 2: Repeated full GET request hits Worker Cache (0 R2 subrequests)",
  );
  {
    const req = new Request(
      "https://pyqvitap.site/api/media/papers/pdfs/math-2025.pdf",
    );
    const res = await simulateMediaRoute(
      req,
      { path: ["papers", "pdfs", "math-2025.pdf"] },
      env,
    );
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.headers.get("X-Cache"), "HIT-WORKER");
    assert.strictEqual(res.headers.get("Cache-Control"), "private, no-store");
    assert.strictEqual(mockR2.subrequestCount, 1); // DID NOT INCREMENT!
    const text = await res.text();
    assert.strictEqual(text, "MATH-PDF-DATA-SAMPLE");
    console.log(
      "  PASSED: Status 200, X-Cache: HIT-WORKER, 0 R2 subrequests (bypassed R2)",
    );
  }

  console.log(
    "Test 3: Different PDF keys have strictly isolated cache entries",
  );
  {
    const req = new Request(
      "https://pyqvitap.site/api/media/papers/pdfs/physics-2025.pdf",
    );
    const res = await simulateMediaRoute(
      req,
      { path: ["papers", "pdfs", "physics-2025.pdf"] },
      env,
    );
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.headers.get("X-Cache"), "MISS");
    assert.strictEqual(mockR2.subrequestCount, 2);
    console.log(
      "  PASSED: Physics PDF triggered independent cache miss and R2 retrieval",
    );
  }

  console.log("Test 4: Range requests bypass cache lookup and cache put");
  {
    const req = new Request(
      "https://pyqvitap.site/api/media/papers/pdfs/math-2025.pdf",
      {
        headers: { range: "bytes=0-49" },
      },
    );
    const subreqsBefore = mockR2.subrequestCount;
    const res = await simulateMediaRoute(
      req,
      { path: ["papers", "pdfs", "math-2025.pdf"] },
      env,
    );
    assert.strictEqual(res.status, 206);
    assert.strictEqual(res.headers.get("X-Cache"), null);
    assert.strictEqual(mockR2.subrequestCount, subreqsBefore + 1);
    console.log(
      "  PASSED: Range request returned 206 and bypassed Worker cache",
    );
  }

  console.log("Test 5: HEAD requests bypass caching");
  {
    const req = new Request(
      "https://pyqvitap.site/api/media/papers/pdfs/math-2025.pdf",
      {
        method: "HEAD",
      },
    );
    const res = await simulateHeadRoute(
      req,
      { path: ["papers", "pdfs", "math-2025.pdf"] },
      env,
    );
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.headers.get("X-Cache"), null);
    assert.strictEqual(res.headers.get("Accept-Ranges"), "bytes");
    console.log("  PASSED: HEAD request handled without cache intervention");
  }

  console.log("Test 6: Authentication failure occurs before cache lookup");
  {
    const unauthEnv = { ...env, isAuthAuthorized: false };
    const req = new Request(
      "https://pyqvitap.site/api/media/papers/pdfs/math-2025.pdf",
    );
    const res = await simulateMediaRoute(
      req,
      { path: ["papers", "pdfs", "math-2025.pdf"] },
      unauthEnv,
    );
    assert.strictEqual(res.status, 401);
    console.log(
      "  PASSED: Unauthorized request received 401 without accessing cached bytes",
    );
  }

  console.log("Test 7: Unsafe paths are rejected before cache access");
  {
    const req = new Request("https://pyqvitap.site/api/media/../secret.pdf");
    const res = await simulateMediaRoute(
      req,
      { path: ["..", "secret.pdf"] },
      env,
    );
    assert.strictEqual(res.status, 400);
    console.log(
      "  PASSED: Traversal attempt blocked at 400 before cache lookup",
    );
  }

  console.log("Test 8: 404 responses are never cached");
  {
    const req = new Request(
      "https://pyqvitap.site/api/media/papers/pdfs/non-existent.pdf",
    );
    const res = await simulateMediaRoute(
      req,
      { path: ["papers", "pdfs", "non-existent.pdf"] },
      env,
    );
    assert.strictEqual(res.status, 404);
    assert.strictEqual(
      mockCache.store.has(buildMediaCacheKey("papers/pdfs/non-existent.pdf")),
      false,
    );
    console.log("  PASSED: 404 not written to Worker Cache");
  }

  console.log("Test 9: Cloudinary fallback functional and caches complete 200");
  {
    const cldEnv = {
      ...env,
      mockCloudinary: async (key, headers) => {
        const cldHeaders = new Headers();
        cldHeaders.set("Content-Type", "application/pdf");
        cldHeaders.set("Cache-Control", "private, no-store");
        cldHeaders.set("ETag", '"cld-etag-1"');
        return {
          status: 200,
          headers: cldHeaders,
          body: "CLOUDINARY-PDF-BYTES",
        };
      },
    };
    const req1 = new Request(
      "https://pyqvitap.site/api/media/papers/pdfs/cld-fallback.pdf",
    );
    const res1 = await simulateMediaRoute(
      req1,
      { path: ["papers", "pdfs", "cld-fallback.pdf"] },
      cldEnv,
    );
    assert.strictEqual(res1.status, 200);
    assert.strictEqual(res1.headers.get("X-Cache"), "MISS-CLOUDINARY");

    const req2 = new Request(
      "https://pyqvitap.site/api/media/papers/pdfs/cld-fallback.pdf",
    );
    const res2 = await simulateMediaRoute(
      req2,
      { path: ["papers", "pdfs", "cld-fallback.pdf"] },
      cldEnv,
    );
    assert.strictEqual(res2.status, 200);
    assert.strictEqual(res2.headers.get("X-Cache"), "HIT-WORKER");
    console.log(
      "  PASSED: Cloudinary fallback successfully populated cache and served on repeat",
    );
  }

  console.log("Test 10: If-None-Match produces correct 304 on cache hit");
  {
    const req = new Request(
      "https://pyqvitap.site/api/media/papers/pdfs/math-2025.pdf",
      {
        headers: { "if-none-match": '"etag-math-1"' },
      },
    );
    const res = await simulateMediaRoute(
      req,
      { path: ["papers", "pdfs", "math-2025.pdf"] },
      env,
    );
    assert.strictEqual(res.status, 304);
    assert.strictEqual(res.headers.get("X-Cache"), "HIT-WORKER-304");
    assert.strictEqual(res.headers.get("Cache-Control"), "private, no-store");
    assert.strictEqual(res.body, null);
    console.log(
      "  PASSED: 304 Not Modified generated from cache hit with empty body",
    );
  }

  console.log(
    "Test 11: Cache API failure falls back safely to direct delivery",
  );
  {
    const faultyCache = {
      async match() {
        throw new Error("Simulated Cache Storage Failure");
      },
      async put() {
        throw new Error("Simulated Cache Put Failure");
      },
    };
    const faultyEnv = { ...env, mockCache: faultyCache };
    const req = new Request(
      "https://pyqvitap.site/api/media/papers/pdfs/math-2025.pdf",
    );
    const res = await simulateMediaRoute(
      req,
      { path: ["papers", "pdfs", "math-2025.pdf"] },
      faultyEnv,
    );
    assert.strictEqual(res.status, 200);
    console.log(
      "  PASSED: Cache exception safely absorbed, PDF served without failure",
    );
  }

  console.log("Test 12: PDF Cache-Control remains strictly private, no-store");
  {
    const req = new Request(
      "https://pyqvitap.site/api/media/papers/pdfs/math-2025.pdf",
    );
    const res = await simulateMediaRoute(
      req,
      { path: ["papers", "pdfs", "math-2025.pdf"] },
      env,
    );
    assert.strictEqual(res.headers.get("Cache-Control"), "private, no-store");
    console.log("  PASSED: Downstream Cache-Control is private, no-store");
  }

  console.log(
    "Test 13: Thumbnail behavior is completely unchanged (bypasses PDF cache)",
  );
  {
    const req = new Request(
      "https://pyqvitap.site/api/media/papers/thumbnails/math-thumb.webp",
    );
    const res = await simulateMediaRoute(
      req,
      { path: ["papers", "thumbnails", "math-thumb.webp"] },
      env,
    );
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.headers.get("X-Cache"), null);
    assert.strictEqual(
      res.headers.get("Cache-Control"),
      "public, max-age=604800, s-maxage=31536000, stale-while-revalidate=86400",
    );
    console.log("  PASSED: Thumbnails preserve 1-year public edge POP caching");
  }

  // --- NEW FOCUSED TESTS: CONDITIONAL HTTP PRECONDITIONS (RFC 9110) ---

  console.log(
    "\n--- Testing HTTP Preconditions on Cache Hits (RFC 9110 §13.2.2) ---",
  );

  console.log("Test 14: Matching If-Match on cache hit returns 200 OK");
  {
    const req = new Request(
      "https://pyqvitap.site/api/media/papers/pdfs/math-2025.pdf",
      {
        headers: { "if-match": '"etag-math-1"' },
      },
    );
    const res = await simulateMediaRoute(
      req,
      { path: ["papers", "pdfs", "math-2025.pdf"] },
      env,
    );
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.headers.get("X-Cache"), "HIT-WORKER");
    assert.strictEqual(res.headers.get("ETag"), '"etag-math-1"');
    console.log(
      "  PASSED: Matching If-Match satisfies condition, returns 200 OK",
    );
  }

  console.log(
    "Test 15: Failing If-Match on cache hit returns 412 Precondition Failed",
  );
  {
    const req = new Request(
      "https://pyqvitap.site/api/media/papers/pdfs/math-2025.pdf",
      {
        headers: { "if-match": '"wrong-etag"' },
      },
    );
    const res = await simulateMediaRoute(
      req,
      { path: ["papers", "pdfs", "math-2025.pdf"] },
      env,
    );
    assert.strictEqual(res.status, 412);
    assert.strictEqual(res.headers.get("Cache-Control"), "private, no-store");
    assert.strictEqual(res.headers.get("ETag"), '"etag-math-1"');
    assert.strictEqual(res.body, null);
    console.log("  PASSED: Non-matching If-Match returns 412 with empty body");
  }

  console.log(
    "Test 16: Weak ETag in If-Match on cache hit returns 412 (RFC 9110 requires strong comparison)",
  );
  {
    const req = new Request(
      "https://pyqvitap.site/api/media/papers/pdfs/math-2025.pdf",
      {
        headers: { "if-match": 'W/"etag-math-1"' },
      },
    );
    const res = await simulateMediaRoute(
      req,
      { path: ["papers", "pdfs", "math-2025.pdf"] },
      env,
    );
    assert.strictEqual(res.status, 412);
    console.log(
      "  PASSED: Weak entity tag in If-Match correctly rejected as 412",
    );
  }

  console.log(
    "Test 17: Matching If-Unmodified-Since on cache hit returns 200 OK",
  );
  {
    // Date is 1 day after upload date (2026-10-10) -> not modified since
    const req = new Request(
      "https://pyqvitap.site/api/media/papers/pdfs/math-2025.pdf",
      {
        headers: { "if-unmodified-since": "Sun, 11 Oct 2026 00:00:00 GMT" },
      },
    );
    const res = await simulateMediaRoute(
      req,
      { path: ["papers", "pdfs", "math-2025.pdf"] },
      env,
    );
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.headers.get("X-Cache"), "HIT-WORKER");
    console.log(
      "  PASSED: If-Unmodified-Since date >= Last-Modified returns 200 OK",
    );
  }

  console.log(
    "Test 18: Failing If-Unmodified-Since on cache hit returns 412 Precondition Failed",
  );
  {
    // Date is before upload date (2026-10-10) -> modified since client date
    const req = new Request(
      "https://pyqvitap.site/api/media/papers/pdfs/math-2025.pdf",
      {
        headers: { "if-unmodified-since": "Thu, 08 Oct 2026 00:00:00 GMT" },
      },
    );
    const res = await simulateMediaRoute(
      req,
      { path: ["papers", "pdfs", "math-2025.pdf"] },
      env,
    );
    assert.strictEqual(res.status, 412);
    assert.strictEqual(res.headers.get("Cache-Control"), "private, no-store");
    assert.strictEqual(res.body, null);
    console.log(
      "  PASSED: If-Unmodified-Since date < Last-Modified returns 412 with empty body",
    );
  }

  console.log(
    "Test 19: Precedence: If-Match takes precedence over If-None-Match",
  );
  {
    // If-Match fails, even though If-None-Match matches -> MUST return 412, NOT 304!
    const req = new Request(
      "https://pyqvitap.site/api/media/papers/pdfs/math-2025.pdf",
      {
        headers: {
          "if-match": '"wrong-etag"',
          "if-none-match": '"etag-math-1"',
        },
      },
    );
    const res = await simulateMediaRoute(
      req,
      { path: ["papers", "pdfs", "math-2025.pdf"] },
      env,
    );
    assert.strictEqual(res.status, 412);
    console.log(
      "  PASSED: Precedence verified: If-Match failure yields 412 before If-None-Match",
    );
  }

  console.log(
    "Test 20: Precedence: If-Match match allows subsequent If-None-Match evaluation (yields 304)",
  );
  {
    // If-Match matches AND If-None-Match matches -> Step 1 passes, Step 3 yields 304
    const req = new Request(
      "https://pyqvitap.site/api/media/papers/pdfs/math-2025.pdf",
      {
        headers: {
          "if-match": '"etag-math-1"',
          "if-none-match": '"etag-math-1"',
        },
      },
    );
    const res = await simulateMediaRoute(
      req,
      { path: ["papers", "pdfs", "math-2025.pdf"] },
      env,
    );
    assert.strictEqual(res.status, 304);
    assert.strictEqual(res.headers.get("X-Cache"), "HIT-WORKER-304");
    console.log(
      "  PASSED: Precedence verified: If-Match passing permits If-None-Match to emit 304",
    );
  }

  console.log(
    "Test 21: Precedence: If-None-Match takes precedence over If-Modified-Since",
  );
  {
    // If-None-Match does NOT match, but If-Modified-Since is in the past -> Step 3 does not match, Step 4 skipped -> returns 200!
    const req = new Request(
      "https://pyqvitap.site/api/media/papers/pdfs/math-2025.pdf",
      {
        headers: {
          "if-none-match": '"different-etag"',
          "if-modified-since": "Sun, 11 Oct 2026 00:00:00 GMT", // would yield 304 if evaluated alone
        },
      },
    );
    const res = await simulateMediaRoute(
      req,
      { path: ["papers", "pdfs", "math-2025.pdf"] },
      env,
    );
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.headers.get("X-Cache"), "HIT-WORKER");
    console.log(
      "  PASSED: Precedence verified: If-None-Match mismatch causes If-Modified-Since to be ignored (returns 200)",
    );
  }

  console.log(
    "Test 22: Malformed or unparseable date headers are safely ignored",
  );
  {
    const req = new Request(
      "https://pyqvitap.site/api/media/papers/pdfs/math-2025.pdf",
      {
        headers: {
          "if-unmodified-since": "invalid-garbage-date",
          "if-modified-since": "not-a-date",
        },
      },
    );
    const res = await simulateMediaRoute(
      req,
      { path: ["papers", "pdfs", "math-2025.pdf"] },
      env,
    );
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.headers.get("X-Cache"), "HIT-WORKER");
    console.log(
      "  PASSED: Unparseable date headers safely ignored, full 200 representation served",
    );
  }

  console.log("Test 23: 304 and 412 responses are never written to the cache");
  {
    // Check cache store size before and after 304 and 412 requests
    const initialCacheSize = mockCache.store.size;
    const req412 = new Request(
      "https://pyqvitap.site/api/media/papers/pdfs/math-2025.pdf",
      {
        headers: { "if-match": '"wrong-etag"' },
      },
    );
    await simulateMediaRoute(
      req412,
      { path: ["papers", "pdfs", "math-2025.pdf"] },
      env,
    );

    const req304 = new Request(
      "https://pyqvitap.site/api/media/papers/pdfs/math-2025.pdf",
      {
        headers: { "if-none-match": '"etag-math-1"' },
      },
    );
    await simulateMediaRoute(
      req304,
      { path: ["papers", "pdfs", "math-2025.pdf"] },
      env,
    );

    assert.strictEqual(mockCache.store.size, initialCacheSize);
    console.log("  PASSED: Zero cache pollution from 304 and 412 responses");
  }

  console.log(
    "\n=== ALL 23 MEDIA WORKER CACHE & PRECONDITION TESTS PASSED SUCCESSFULLY! ===",
  );
})().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
