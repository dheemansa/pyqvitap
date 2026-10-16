import { getUpcomingSubjects } from "@/lib/services/subject";
import { cachedJsonEndpoint } from "@/lib/utils/edge-cache";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return cachedJsonEndpoint({
    request,
    cacheKeyPrefix: "api_upcoming_papers",
    ttlSeconds: 300,
    maxStaleAgeSeconds: 86400,
    errorMessage: "Failed to fetch upcoming papers",
    producer: () => getUpcomingSubjects(),
    validate: (data) => Array.isArray(data),
  });
}
