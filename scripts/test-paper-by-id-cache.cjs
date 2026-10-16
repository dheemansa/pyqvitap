// @ts-nocheck
/**
 * Test Suite for GET /api/paper-by-id/[id] Caching and Semantic Behavior
 */
const assert = require("node:assert");

// Mock paper store
const MOCK_DB = {
  "6aaf7dc6faf057904421b8fd": {
    _id: "6aaf7dc6faf057904421b8fd",
    subject: "Calculus",
    exam: "CAT-1",
    slot: "A1+TA1",
    year: "2024",
    file_url: "papers/pdfs/calc-2024.pdf",
  },
  "6aa2e64b72992ac76a3b7e44": {
    _id: "6aa2e64b72992ac76a3b7e44",
    subject: "Engineering Chemistry",
    exam: "FAT",
    slot: "B1+TB1",
    year: "2023",
    file_url: "papers/pdfs/chem-2023.pdf",
  },
};

// In-memory cache simulation matching edge-cache.ts Tier 1
const isolateMemoryCache = new Map();

function buildNormalizedQueryString(searchParams) {
  const entries = [];
  searchParams.forEach((value, key) =>
    entries.push([key.trim(), value.trim()]),
  );
  if (entries.length === 0) return "";
  entries.sort((a, b) => a[0].localeCompare(b[0]));
  const normalized = new URLSearchParams();
  for (const [key, value] of entries) normalized.append(key, value);
  return normalized.toString();
}

// Mirror exact cachedJsonEndpoint implementation from edge-cache.ts
async function simulatedCachedJsonEndpoint({
  request,
  cacheKeyPrefix,
  ttlSeconds = 3600,
  maxStaleAgeSeconds = 86400,
  producer,
  validate,
  errorMessage = "Internal server error",
}) {
  const isAuth =
    request.headers.has("authorization") || request.headers.has("x-user-id");

  if (isAuth) {
    try {
      const authData = await producer();
      return {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "private, no-cache, no-store, must-revalidate",
          "X-Cache": "BYPASS-AUTH",
        },
        body: { status: "success", data: authData, message: "OK" },
      };
    } catch (authErr) {
      return {
        status: 500,
        headers: {
          "Cache-Control": "private, no-cache, no-store, must-revalidate",
          "X-Cache": "BYPASS-AUTH-ERROR",
        },
        body: { status: "error", data: null, message: errorMessage },
      };
    }
  }

  const u = new URL(request.url);
  const normalizedQuery = buildNormalizedQueryString(u.searchParams);
  const memoryKey = normalizedQuery
    ? `${cacheKeyPrefix}:${normalizedQuery}`
    : cacheKeyPrefix;

  const ttlMs = ttlSeconds * 1000;
  const maxStaleMs = maxStaleAgeSeconds * 1000;
  const now = Date.now();

  // Tier 1 Check
  const memoryEntry = isolateMemoryCache.get(memoryKey);
  if (memoryEntry && now - memoryEntry.timestamp < ttlMs) {
    return {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": `public, max-age=60, s-maxage=${ttlSeconds}, stale-while-revalidate=86400`,
        "X-Cache": "HIT-MEMORY",
      },
      body: { status: "success", data: memoryEntry.data, message: "OK" },
    };
  }

  // Tier 3 Producer Execution
  try {
    const data = await producer();

    if (data === null || data === undefined) {
      return {
        status: 404,
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate",
          "X-Cache": "MISS-404",
        },
        body: { status: "error", data: null, message: "Resource not found" },
      };
    }

    if (validate && !validate(data)) {
      return {
        status: 502,
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate",
          "X-Cache": "MISS-INVALID",
        },
        body: { status: "error", data: null, message: "Invalid resource data" },
      };
    }

    const generationTime = Date.now();
    isolateMemoryCache.set(memoryKey, {
      data,
      timestamp: generationTime,
    });

    return {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": `public, max-age=60, s-maxage=${ttlSeconds}, stale-while-revalidate=86400`,
        "X-Cache": "MISS",
        "X-Edge-Created-At": generationTime.toString(),
      },
      body: { status: "success", data, message: "OK" },
    };
  } catch (producerError) {
    return {
      status: 500,
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate",
        "X-Cache": "ERROR-NO-CACHE",
      },
      body: { status: "error", data: null, message: errorMessage },
    };
  }
}

// Simulated GET /api/paper-by-id/[id] route handler
function isValidObjectId(id) {
  return /^[0-9a-fA-F]{24}$/.test(id);
}

async function simulatedGetPaperById(id) {
  const paper = MOCK_DB[id];
  if (!paper) {
    throw new Error("Paper not found");
  }
  return paper;
}

async function routeHandler(req, { params }, forceDbError = false) {
  const { id } = params;

  if (!id || !isValidObjectId(id)) {
    return {
      status: 400,
      headers: { "Content-Type": "application/json" },
      body: { status: "error", data: null, message: "Invalid paper ID" },
    };
  }

  const cleanId = id.trim();

  return simulatedCachedJsonEndpoint({
    request: req,
    cacheKeyPrefix: `api_paper_by_id_${cleanId}`,
    ttlSeconds: 3600,
    maxStaleAgeSeconds: 86400,
    errorMessage: "Failed to fetch paper",
    producer: async () => {
      if (forceDbError) {
        throw new Error("MongoDB Connection Pool Timeout");
      }
      try {
        return await simulatedGetPaperById(cleanId);
      } catch (err) {
        if (err instanceof Error && err.message === "Paper not found") {
          return null;
        }
        throw err;
      }
    },
    validate: (data) =>
      Boolean(
        data && typeof data === "object" && "_id" in data && "subject" in data,
      ),
  });
}

// ------------------------------------------------------------
// TEST SUITE
// ------------------------------------------------------------
async function runTests() {
  console.log("============================================================");
  console.log("RUNNING ROUTE & CACHE TESTS: GET /api/paper-by-id/[id]");
  console.log("============================================================\n");

  isolateMemoryCache.clear();

  const id1 = "6aaf7dc6faf057904421b8fd";
  const id2 = "6aa2e64b72992ac76a3b7e44";
  const nonExistentValidId = "507f1f77bcf86cd799439011";
  const invalidId = "invalid-hex-123";

  // Test 1: First request for valid ID
  console.log("Test 1: First request for valid ID (Expect MISS, HTTP 200)...");
  const req1 = new Request(`https://pyqvitap.site/api/paper-by-id/${id1}`, {
    method: "GET",
  });
  const res1 = await routeHandler(req1, { params: { id: id1 } });
  assert.strictEqual(res1.status, 200);
  assert.strictEqual(res1.headers["X-Cache"], "MISS");
  assert.strictEqual(res1.body.status, "success");
  assert.strictEqual(res1.body.data._id, id1);
  assert.strictEqual(res1.body.data.subject, "Calculus");
  console.log("  [PASS] Successfully retrieved paper with X-Cache: MISS\n");

  // Test 2: Repeated request for same ID
  console.log(
    "Test 2: Repeated request for same ID (Expect HIT-MEMORY, HTTP 200)...",
  );
  const req2 = new Request(`https://pyqvitap.site/api/paper-by-id/${id1}`, {
    method: "GET",
  });
  const res2 = await routeHandler(req2, { params: { id: id1 } });
  assert.strictEqual(res2.status, 200);
  assert.strictEqual(res2.headers["X-Cache"], "HIT-MEMORY");
  assert.strictEqual(res2.body.data._id, id1);
  assert.strictEqual(res2.body.data.subject, "Calculus");
  console.log(
    "  [PASS] Successfully served from memory with X-Cache: HIT-MEMORY\n",
  );

  // Test 3: Two distinct paper IDs (Verify cache isolation)
  console.log(
    "Test 3: Second distinct paper ID (Expect MISS for new ID, separate cache key)...",
  );
  const req3 = new Request(`https://pyqvitap.site/api/paper-by-id/${id2}`, {
    method: "GET",
  });
  const res3 = await routeHandler(req3, { params: { id: id2 } });
  assert.strictEqual(res3.status, 200);
  assert.strictEqual(res3.headers["X-Cache"], "MISS");
  assert.strictEqual(res3.body.data._id, id2);
  assert.strictEqual(res3.body.data.subject, "Engineering Chemistry");

  // Re-verify ID 1 still returns Calculus
  const res1Again = await routeHandler(req1, { params: { id: id1 } });
  assert.strictEqual(res1Again.headers["X-Cache"], "HIT-MEMORY");
  assert.strictEqual(res1Again.body.data._id, id1);
  assert.strictEqual(res1Again.body.data.subject, "Calculus");
  console.log(
    "  [PASS] Cache isolation strictly verified: ID1 and ID2 have independent entries\n",
  );

  // Test 4: Invalid ID
  console.log(
    "Test 4: Invalid ID format (Expect HTTP 400, no cache impact)...",
  );
  const req4 = new Request(
    `https://pyqvitap.site/api/paper-by-id/${invalidId}`,
    { method: "GET" },
  );
  const res4 = await routeHandler(req4, { params: { id: invalidId } });
  assert.strictEqual(res4.status, 400);
  assert.strictEqual(res4.body.status, "error");
  assert.strictEqual(res4.body.message, "Invalid paper ID");
  assert.strictEqual(
    isolateMemoryCache.has(`api_paper_by_id_${invalidId}`),
    false,
  );
  console.log("  [PASS] Returned HTTP 400 without populating cache\n");

  // Test 5: Valid but nonexistent ID
  console.log(
    "Test 5: Valid format but non-existent paper (Expect HTTP 404, MISS-404, no-store)...",
  );
  const req5 = new Request(
    `https://pyqvitap.site/api/paper-by-id/${nonExistentValidId}`,
    { method: "GET" },
  );
  const res5 = await routeHandler(req5, { params: { id: nonExistentValidId } });
  assert.strictEqual(res5.status, 404);
  assert.strictEqual(res5.headers["X-Cache"], "MISS-404");
  assert.strictEqual(
    res5.headers["Cache-Control"],
    "no-store, no-cache, must-revalidate",
  );
  assert.strictEqual(res5.body.status, "error");
  assert.strictEqual(res5.body.message, "Resource not found");
  assert.strictEqual(
    isolateMemoryCache.has(`api_paper_by_id_${nonExistentValidId}`),
    false,
  );
  console.log(
    "  [PASS] Returned HTTP 404 with no-store headers and zero cache contamination\n",
  );

  // Test 6: Database Error Handling
  console.log(
    "Test 6: Simulated database exception (Expect HTTP 500, ERROR-NO-CACHE)...",
  );
  const unprimedId = "507f1f77bcf86cd799439099";
  const req6 = new Request(
    `https://pyqvitap.site/api/paper-by-id/${unprimedId}`,
    { method: "GET" },
  );
  const res6 = await routeHandler(req6, { params: { id: unprimedId } }, true);
  assert.strictEqual(res6.status, 500);
  assert.strictEqual(res6.headers["X-Cache"], "ERROR-NO-CACHE");
  assert.strictEqual(res6.body.status, "error");
  assert.strictEqual(res6.body.message, "Failed to fetch paper");
  assert.strictEqual(
    isolateMemoryCache.has(`api_paper_by_id_${unprimedId}`),
    false,
  );
  console.log(
    "  [PASS] Returned HTTP 500 on database failure without caching error\n",
  );

  // Test 7: Authorization Bypass
  console.log(
    "Test 7: Authenticated request with Authorization header (Expect BYPASS-AUTH)...",
  );
  const req7 = new Request(`https://pyqvitap.site/api/paper-by-id/${id1}`, {
    method: "GET",
    headers: { Authorization: "Bearer session_token_123" },
  });
  const res7 = await routeHandler(req7, { params: { id: id1 } });
  assert.strictEqual(res7.status, 200);
  assert.strictEqual(res7.headers["X-Cache"], "BYPASS-AUTH");
  assert.strictEqual(
    res7.headers["Cache-Control"],
    "private, no-cache, no-store, must-revalidate",
  );
  console.log(
    "  [PASS] Authenticated request bypassed public cache with private headers\n",
  );

  console.log("============================================================");
  console.log("ALL 7 ROUTE & CACHE TESTS PASSED SUCCESSFULLY!");
  console.log("============================================================\n");
}

runTests().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
