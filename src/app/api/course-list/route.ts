import { getCourseList } from "@/lib/services/subject";
import { cachedJsonEndpoint } from "@/lib/utils/edge-cache";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return cachedJsonEndpoint({
    request,
    cacheKeyPrefix: "api_course_list",
    ttlSeconds: 300, // 5 minutes
    producer: () => getCourseList(),
  });
}
