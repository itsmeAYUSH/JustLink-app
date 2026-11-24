import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "./database.types";
import { getSupabaseEnv } from "./env";

// /s/<share_id> are public shared collections. /api/extension answers signed-out
// requests itself, with JSON the extension can read, instead of a redirect to /login.
const PUBLIC_PATHS = [
  "/login",
  "/auth",
  "/s",
  "/api/extension",
  // The design preview with sample data (app/design) only exists in development.
  ...(process.env.NODE_ENV === "production" ? [] : ["/design"]),
];

/**
 * Runs on every request (see /proxy.ts): refreshes the Supabase session cookie
 * and sends signed-out visitors to /login.
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });
  const { url, key } = getSupabaseEnv();

  const supabase = createServerClient<Database>(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
        for (const [header, value] of Object.entries(headers)) response.headers.set(header, value);
      },
    },
  });

  // Don't put code between createServerClient and getClaims: it validates and refreshes the session.
  const { data } = await supabase.auth.getClaims();
  const signedIn = Boolean(data?.claims);

  const { pathname, search } = request.nextUrl;
  const isPublic = PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));

  const redirectTo = (target: URL) => {
    const redirect = NextResponse.redirect(target);
    // Keep any refreshed auth cookies and no-cache headers.
    for (const cookie of response.cookies.getAll()) redirect.cookies.set(cookie);
    for (const header of ["cache-control", "expires", "pragma"]) {
      const value = response.headers.get(header);
      if (value) redirect.headers.set(header, value);
    }
    return redirect;
  };

  if (!signedIn && !isPublic) {
    const target = new URL("/login", request.url);
    if (pathname !== "/") target.searchParams.set("next", `${pathname}${search}`);
    return redirectTo(target);
  }

  if (signedIn && pathname === "/login") {
    return redirectTo(new URL("/", request.url));
  }

  return response;
}
