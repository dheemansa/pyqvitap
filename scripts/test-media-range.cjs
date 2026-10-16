// @ts-nocheck
const assert = require("assert");

console.log("=== PyqVitAp Media Range Support Test Suite ===\n");

// 1. Test parseR2ObjectRange logic
function parseR2ObjectRange(range, totalSize) {
  let start = 0;
  let length = totalSize;

  if ("suffix" in range && typeof range.suffix === "number") {
    const actualSuffix = Math.min(Math.max(0, range.suffix), totalSize);
    start = totalSize - actualSuffix;
    length = actualSuffix;
  } else if ("offset" in range && typeof range.offset === "number") {
    start = Math.max(0, range.offset);
    if ("length" in range && typeof range.length === "number") {
      length = Math.max(0, range.length);
    } else {
      length = Math.max(0, totalSize - start);
    }
  } else if ("length" in range && typeof range.length === "number") {
    start = 0;
    length = Math.max(0, range.length);
  }

  const end = totalSize > 0 ? Math.min(start + length - 1, totalSize - 1) : 0;
  const actualLength = totalSize > 0 && end >= start ? end - start + 1 : 0;

  return {
    start,
    end,
    length: actualLength,
  };
}

// 2. Test parseByteRange logic
function parseByteRange(rangeHeader, totalSize) {
  const match = /^bytes=\s*(\d*)\s*-\s*(\d*)\s*$/i.exec(rangeHeader.trim());
  if (!match) {
    return { type: "invalid" };
  }

  const [, startStr, endStr] = match;
  if (!startStr && !endStr) {
    return { type: "invalid" };
  }

  if (!startStr) {
    if (!endStr) return { type: "invalid" };
    const suffix = parseInt(endStr, 10);
    if (isNaN(suffix) || suffix <= 0) return { type: "unsatisfiable" };
    return {
      type: "satisfiable",
      range: { suffix },
    };
  }

  const start = parseInt(startStr, 10);
  if (isNaN(start) || start < 0) return { type: "invalid" };

  if (start >= totalSize) {
    return { type: "unsatisfiable" };
  }

  if (!endStr) {
    return {
      type: "satisfiable",
      range: { offset: start },
    };
  }

  const end = parseInt(endStr, 10);
  if (isNaN(end) || end < start) {
    return { type: "unsatisfiable" };
  }

  const length = Math.min(end, totalSize - 1) - start + 1;
  return {
    type: "satisfiable",
    range: { offset: start, length },
  };
}

// --- Test Section 1: parseR2ObjectRange ---
console.log("Test 1: parseR2ObjectRange with offset and length");
{
  const res = parseR2ObjectRange({ offset: 0, length: 1024 }, 5000);
  assert.strictEqual(res.start, 0);
  assert.strictEqual(res.end, 1023);
  assert.strictEqual(res.length, 1024);
  console.log("  PASSED: 0-1023, length 1024");
}

console.log("Test 2: parseR2ObjectRange with offset only (open-ended)");
{
  const res = parseR2ObjectRange({ offset: 2000 }, 5000);
  assert.strictEqual(res.start, 2000);
  assert.strictEqual(res.end, 4999);
  assert.strictEqual(res.length, 3000);
  console.log("  PASSED: 2000-4999, length 3000");
}

console.log("Test 3: parseR2ObjectRange with suffix");
{
  const res = parseR2ObjectRange({ suffix: 500 }, 5000);
  assert.strictEqual(res.start, 4500);
  assert.strictEqual(res.end, 4999);
  assert.strictEqual(res.length, 500);
  console.log("  PASSED: 4500-4999, length 500");
}

console.log("Test 4: parseR2ObjectRange with suffix larger than totalSize");
{
  const res = parseR2ObjectRange({ suffix: 10000 }, 5000);
  assert.strictEqual(res.start, 0);
  assert.strictEqual(res.end, 4999);
  assert.strictEqual(res.length, 5000);
  console.log("  PASSED: 0-4999, length 5000");
}

// --- Test Section 2: parseByteRange ---
console.log("Test 5: parseByteRange satisfiable standard range");
{
  const res = parseByteRange("bytes=0-1023", 5000);
  assert.strictEqual(res.type, "satisfiable");
  assert.deepStrictEqual(res.range, { offset: 0, length: 1024 });
  console.log("  PASSED: standard range");
}

console.log("Test 6: parseByteRange satisfiable open-ended range");
{
  const res = parseByteRange("bytes=1000-", 5000);
  assert.strictEqual(res.type, "satisfiable");
  assert.deepStrictEqual(res.range, { offset: 1000 });
  console.log("  PASSED: open-ended range");
}

console.log("Test 7: parseByteRange satisfiable suffix range");
{
  const res = parseByteRange("bytes=-500", 5000);
  assert.strictEqual(res.type, "satisfiable");
  assert.deepStrictEqual(res.range, { suffix: 500 });
  console.log("  PASSED: suffix range");
}

console.log("Test 8: parseByteRange unsatisfiable range (start >= totalSize)");
{
  const res = parseByteRange("bytes=5000-", 5000);
  assert.strictEqual(res.type, "unsatisfiable");
  const res2 = parseByteRange("bytes=99999-100000", 5000);
  assert.strictEqual(res2.type, "unsatisfiable");
  console.log("  PASSED: start >= totalSize detected as unsatisfiable");
}

console.log("Test 9: parseByteRange unsatisfiable range (start > end)");
{
  const res = parseByteRange("bytes=500-100", 5000);
  assert.strictEqual(res.type, "unsatisfiable");
  console.log("  PASSED: start > end detected as unsatisfiable");
}

console.log("Test 10: parseByteRange invalid syntax");
{
  const res1 = parseByteRange("bytes=abc-def", 5000);
  assert.strictEqual(res1.type, "invalid");
  const res2 = parseByteRange("pages=1-5", 5000);
  assert.strictEqual(res2.type, "invalid");
  const res3 = parseByteRange("bytes=0-10, 20-30", 5000);
  assert.strictEqual(res3.type, "invalid");
  console.log("  PASSED: malformed / multipart syntax treated as invalid");
}

// --- Test Section 3: Simulated Route Workflow ---
console.log("\n--- Testing Route Logic Simulation ---");

// Mock R2 bucket simulating Cloudflare workerd behavior
function createMockR2(fileSize, etag = '"abc123etag"') {
  const fileBytes = Buffer.alloc(fileSize, 0x41); // filled with 'A'
  return {
    async head(key) {
      if (key !== "papers/pdfs/test.pdf") return null;
      return {
        size: fileSize,
        httpEtag: etag,
        uploaded: new Date("2026-10-10T00:00:00Z"),
        httpMetadata: { contentType: "application/pdf" },
      };
    },
    async get(key, options = {}) {
      if (key !== "papers/pdfs/test.pdf") return null;

      // Handle onlyIf (conditional headers)
      if (options.onlyIf) {
        const ifNoneMatch = options.onlyIf.get
          ? options.onlyIf.get("if-none-match")
          : null;
        if (ifNoneMatch && ifNoneMatch === etag) {
          // Precondition failed: return R2Object with no body
          return {
            size: fileSize,
            httpEtag: etag,
            uploaded: new Date("2026-10-10T00:00:00Z"),
            httpMetadata: { contentType: "application/pdf" },
          };
        }
      }

      // Handle range
      let r2Range = undefined;
      if (options.range) {
        let rangeHeader = "";
        if (options.range.get) {
          rangeHeader = options.range.get("range") || "";
        }
        if (rangeHeader) {
          const parsed = parseByteRange(rangeHeader, fileSize);
          if (parsed.type === "unsatisfiable") {
            // workerd throws or returns null
            throw new Error("Range not satisfiable");
          }
          if (parsed.type === "satisfiable") {
            r2Range = parsed.range;
          }
        } else if (typeof options.range === "object" && !options.range.get) {
          r2Range = options.range;
        }
      }

      let slice = fileBytes;
      if (r2Range) {
        const { start, length } = parseR2ObjectRange(r2Range, fileSize);
        slice = fileBytes.subarray(start, start + length);
      }

      return {
        size: fileSize,
        httpEtag: etag,
        uploaded: new Date("2026-10-10T00:00:00Z"),
        httpMetadata: { contentType: "application/pdf" },
        range: r2Range,
        body: slice,
      };
    },
  };
}

// Route GET simulator matching src/app/api/media/[...path]/route.ts
async function simulateRouteGet(mockR2, reqHeaders) {
  const key = "papers/pdfs/test.pdf";
  const r2Bucket = mockR2;
  const hasRange = reqHeaders.has("range");

  let r2Object = null;
  try {
    r2Object = await r2Bucket.get(key, {
      onlyIf: reqHeaders,
      ...(hasRange ? { range: reqHeaders } : {}),
    });
  } catch (err) {
    if (hasRange) {
      r2Object = null;
    } else {
      throw err;
    }
  }

  // 304 Not Modified
  if (r2Object && !("body" in r2Object && r2Object.body)) {
    const headers = new Headers();
    headers.set("Content-Type", "application/pdf");
    headers.set("Cache-Control", "private, no-store");
    headers.set("Accept-Ranges", "bytes");
    if (r2Object.httpEtag) headers.set("ETag", r2Object.httpEtag);
    return { status: 304, headers, body: null };
  }

  // Object with body
  if (r2Object && r2Object.body) {
    const headers = new Headers();
    headers.set("Content-Type", "application/pdf");
    headers.set("Cache-Control", "private, no-store");
    headers.set("Accept-Ranges", "bytes");
    if (r2Object.httpEtag) headers.set("ETag", r2Object.httpEtag);

    if (r2Object.range) {
      const { start, end, length } = parseR2ObjectRange(
        r2Object.range,
        r2Object.size,
      );
      headers.set("Content-Range", `bytes ${start}-${end}/${r2Object.size}`);
      headers.set("Content-Length", length.toString());
      return { status: 206, headers, body: r2Object.body };
    }

    headers.set("Content-Length", r2Object.size.toString());
    return { status: 200, headers, body: r2Object.body };
  }

  // Unsatisfiable or fallback
  if (!r2Object && hasRange) {
    const head = await r2Bucket.head(key);
    if (head) {
      const parsedRange = parseByteRange(
        reqHeaders.get("range") || "",
        head.size,
      );
      if (parsedRange.type === "unsatisfiable") {
        const headers = new Headers();
        headers.set("Content-Type", "application/pdf");
        headers.set("Cache-Control", "private, no-store");
        headers.set("Accept-Ranges", "bytes");
        headers.set("Content-Range", `bytes */${head.size}`);
        if (head.httpEtag) headers.set("ETag", head.httpEtag);
        return { status: 416, headers, body: null };
      }

      // Ignore invalid and return 200
      const fallbackObj = await r2Bucket.get(key, { onlyIf: reqHeaders });
      if (fallbackObj && fallbackObj.body) {
        const headers = new Headers();
        headers.set("Content-Type", "application/pdf");
        headers.set("Cache-Control", "private, no-store");
        headers.set("Accept-Ranges", "bytes");
        headers.set("Content-Length", fallbackObj.size.toString());
        return { status: 200, headers, body: fallbackObj.body };
      }
    }
  }

  return { status: 404, headers: new Headers(), body: null };
}

// Route HEAD simulator
async function simulateRouteHead(mockR2, reqHeaders) {
  const key = "papers/pdfs/test.pdf";
  const r2Bucket = mockR2;
  const head = await r2Bucket.head(key);
  if (head) {
    const headers = new Headers();
    headers.set("Content-Type", "application/pdf");
    headers.set("Cache-Control", "private, no-store");
    headers.set("Accept-Ranges", "bytes");
    headers.set("Content-Length", head.size.toString());
    if (head.httpEtag) headers.set("ETag", head.httpEtag);

    const ifNoneMatch = reqHeaders.get("if-none-match");
    if (
      ifNoneMatch &&
      head.httpEtag &&
      (ifNoneMatch === head.httpEtag || ifNoneMatch === "*")
    ) {
      return { status: 304, headers, body: null };
    }
    return { status: 200, headers, body: null };
  }
  return { status: 404, headers: new Headers(), body: null };
}

(async () => {
  const mockR2 = createMockR2(10000, '"test-pdf-etag"');

  console.log("Test 11: Full GET request (no Range header)");
  {
    const reqHeaders = new Headers();
    const res = await simulateRouteGet(mockR2, reqHeaders);
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.headers.get("Accept-Ranges"), "bytes");
    assert.strictEqual(res.headers.get("Content-Length"), "10000");
    assert.strictEqual(res.headers.get("Content-Range"), null);
    assert.strictEqual(res.headers.get("Cache-Control"), "private, no-store");
    assert.strictEqual(res.body.length, 10000);
    console.log("  PASSED: 200 OK with full file and Accept-Ranges: bytes");
  }

  console.log("Test 12: Byte-range GET request (bytes=0-1023)");
  {
    const reqHeaders = new Headers({ range: "bytes=0-1023" });
    const res = await simulateRouteGet(mockR2, reqHeaders);
    assert.strictEqual(res.status, 206);
    assert.strictEqual(res.headers.get("Accept-Ranges"), "bytes");
    assert.strictEqual(res.headers.get("Content-Range"), "bytes 0-1023/10000");
    assert.strictEqual(res.headers.get("Content-Length"), "1024");
    assert.strictEqual(res.headers.get("Cache-Control"), "private, no-store");
    assert.strictEqual(res.body.length, 1024);
    console.log(
      "  PASSED: 206 Partial Content with Content-Range bytes 0-1023/10000",
    );
  }

  console.log("Test 13: Unsatisfiable byte-range GET request (bytes=50000-)");
  {
    const reqHeaders = new Headers({ range: "bytes=50000-" });
    const res = await simulateRouteGet(mockR2, reqHeaders);
    assert.strictEqual(res.status, 416);
    assert.strictEqual(res.headers.get("Accept-Ranges"), "bytes");
    assert.strictEqual(res.headers.get("Content-Range"), "bytes */10000");
    assert.strictEqual(res.body, null);
    console.log(
      "  PASSED: 416 Range Not Satisfiable with Content-Range bytes */10000",
    );
  }

  console.log("Test 14: Malformed byte-range GET request (bytes=garbage)");
  {
    const reqHeaders = new Headers({ range: "bytes=garbage" });
    const res = await simulateRouteGet(mockR2, reqHeaders);
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.headers.get("Accept-Ranges"), "bytes");
    assert.strictEqual(res.headers.get("Content-Length"), "10000");
    assert.strictEqual(res.body.length, 10000);
    console.log(
      "  PASSED: RFC-compliant safe fallback to 200 OK on malformed range",
    );
  }

  console.log("Test 15: Conditional GET with matching If-None-Match");
  {
    const reqHeaders = new Headers({ "if-none-match": '"test-pdf-etag"' });
    const res = await simulateRouteGet(mockR2, reqHeaders);
    assert.strictEqual(res.status, 304);
    assert.strictEqual(res.headers.get("Accept-Ranges"), "bytes");
    assert.strictEqual(res.headers.get("ETag"), '"test-pdf-etag"');
    assert.strictEqual(res.body, null);
    console.log("  PASSED: 304 Not Modified with empty body");
  }

  console.log("Test 16: HEAD request");
  {
    const reqHeaders = new Headers();
    const res = await simulateRouteHead(mockR2, reqHeaders);
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.headers.get("Accept-Ranges"), "bytes");
    assert.strictEqual(res.headers.get("Content-Length"), "10000");
    assert.strictEqual(res.body, null);
    console.log(
      "  PASSED: HEAD returns 200 with Content-Length: 10000, Accept-Ranges: bytes, no body",
    );
  }

  console.log("Test 17: HEAD request with matching If-None-Match");
  {
    const reqHeaders = new Headers({ "if-none-match": '"test-pdf-etag"' });
    const res = await simulateRouteHead(mockR2, reqHeaders);
    assert.strictEqual(res.status, 304);
    assert.strictEqual(res.body, null);
    console.log("  PASSED: HEAD returns 304 Not Modified when ETag matches");
  }

  console.log("\n=== ALL 17 TESTS PASSED SUCCESSFULLY! ===");
})().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
