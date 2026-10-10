import { getCourseCounts } from "@/lib/services/paper";
import { cachedJsonEndpoint } from "@/lib/utils/edge-cache";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return cachedJsonEndpoint({
    request,
    cacheKeyPrefix: "api_papers_count",
    ttlSeconds: 300, // 5 minutes
    producer: () => getCourseCounts(),
  });
}
