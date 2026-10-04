import { type NextRequest, NextResponse } from "next/server";
import {
  aiUploadRatelimit,
  paperRequestRatelimit,
  subscribeRatelimit,
} from "./lib/utils/ratelimit";
import { failure } from "@/lib/utils/response";
import { MAINTENANCE_MODE } from "@/config/maintenance";

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - assets (public assets)
     */
    "/((?!_next/static|_next/image|favicon.ico|assets/).*)",
  ],
};

export default async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (MAINTENANCE_MODE) {
    // 1. Allow static assets, images, icons, and web manifests
    if (
      pathname.startsWith("/_next") ||
      pathname.startsWith("/assets") ||
      pathname === "/favicon.ico" ||
      pathname === "/robots.txt" ||
      pathname === "/sitemap.xml" ||
      pathname === "/manifest.webmanifest" ||
      /\.[a-zA-Z0-9]+$/.test(pathname)
    ) {
      return NextResponse.next();
    }

    // 2. Allow health/infrastructure endpoints required for monitoring
    if (pathname === "/api/health") {
      return NextResponse.next();
    }

    // 3. Allow admin endpoints if any exist
    if (pathname.startsWith("/admin") || pathname.startsWith("/api/admin")) {
      return NextResponse.next();
    }

    // 4. Return 503 Service Unavailable for all other API endpoints
    if (pathname.startsWith("/api/")) {
      return new NextResponse(
        JSON.stringify({
          success: false,
          message:
            "PyqVitAp is currently under maintenance. Expected return: Before 9 October 2026.",
        }),
        {
          status: 503,
          headers: {
            "Content-Type": "application/json",
            "Retry-After": "86400",
            "Cache-Control": "no-store, max-age=0",
          },
        }
      );
    }

    // 5. Explicit public maintenance exception: allow /disclaimer to render normally
    if (pathname === "/disclaimer" || pathname === "/disclaimer/") {
      return NextResponse.next();
    }

    // 6. For all other page requests, rewrite to root route "/"
    // This preserves the browser URL while preventing server components
    // (e.g. /paper/[id]) from executing backend database queries.
    if (pathname !== "/") {
      const url = request.nextUrl.clone();
      url.pathname = "/";
      return NextResponse.rewrite(url);
    }

    return NextResponse.next();
  }

  // --- Normal Operations (MAINTENANCE_MODE === false) ---
  const ip = request.ip ?? "127.0.0.1";

  if (pathname === "/api/upload") {
    const { success } = await aiUploadRatelimit.limit(ip);
    if (!success) {
      return failure("You can upload a maximum of 5 papers every 15 minutes", 429);
    }
  }

  if (pathname === "/api/request") {
    const { success } = await paperRequestRatelimit.limit(ip);
    if (!success) {
      return failure("You can submit a maximum of 5 requests every 15 minutes", 429);
    }
  }

  if (pathname === "/api/subscribe") {
    const { success } = await subscribeRatelimit.limit(ip);
    if (!success) {
      return failure("Maximum of 3 newsletter subscriptions per hour", 429);
    }
  }

  return NextResponse.next();
}
