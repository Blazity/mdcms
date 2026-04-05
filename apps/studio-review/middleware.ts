import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * CORS middleware for studio-review API routes.
 * Allows cross-origin requests from Studio iframe to the review API.
 */
const STUDIO_CORS_ALLOW_METHODS =
  "GET, HEAD, POST, PUT, PATCH, DELETE, OPTIONS";
const STUDIO_CORS_ALLOW_HEADERS = [
  "Authorization",
  "Content-Type",
  "X-MDCMS-Project",
  "X-MDCMS-Environment",
  "X-MDCMS-Locale",
  "X-MDCMS-Schema-Hash",
  "X-MDCMS-CSRF-Token",
].join(", ");

function createCorsHeaders(origin: string): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Methods": STUDIO_CORS_ALLOW_METHODS,
    "Access-Control-Allow-Headers": STUDIO_CORS_ALLOW_HEADERS,
    Vary: "Origin",
  };
}

export function middleware(request: NextRequest) {
  const origin = request.headers.get("origin");

  // Only handle CORS for review-api routes with an Origin header
  if (!origin || !request.nextUrl.pathname.startsWith("/review-api/")) {
    return NextResponse.next();
  }

  // Handle preflight OPTIONS requests
  if (request.method === "OPTIONS") {
    return new NextResponse(null, {
      status: 204,
      headers: createCorsHeaders(origin),
    });
  }

  // For other requests, add CORS headers to the response
  const response = NextResponse.next();
  const corsHeaders = createCorsHeaders(origin);

  for (const [key, value] of Object.entries(corsHeaders)) {
    response.headers.set(key, value);
  }

  return response;
}

export const config = {
  matcher: "/review-api/:path*",
};
