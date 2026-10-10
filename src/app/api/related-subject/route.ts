import { getRelatedSubjects } from "@/lib/services/subject";
import { type NextRequest } from "next/server";
import { failure } from "@/lib/utils/response";
import { cachedJsonEndpoint } from "@/lib/utils/edge-cache";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams;
  const subject = url.get("subject");

  if (!subject?.trim()) {
    return failure("Subject query parameter is required", 400);
  }

  const cleanSubject = subject.trim();

  return cachedJsonEndpoint({
    request: req,
    cacheKeyPrefix: "api_related_subject",
    ttlSeconds: 900, // 15 minutes fresh TTL
    maxStaleAgeSeconds: 86400, // 24 hours max stale fallback
    errorMessage: "Failed to fetch related subject",
    producer: async () => {
      const relatedSubjects = await getRelatedSubjects(cleanSubject);
      return { related_subjects: relatedSubjects };
    },
    validate: (data) => {
      return Boolean(
        data &&
          typeof data === "object" &&
          Array.isArray((data as { related_subjects?: unknown[] }).related_subjects)
      );
    },
  });
}