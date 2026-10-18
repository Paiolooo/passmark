import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "./env";

const PROTECTED = ["/app"];
const AUTH_PAGES = ["/login", "/signup"];

function matches(pathname: string, paths: string[]) {
  return paths.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

// Refreshes the Supabase session cookie on every request and guards routes.
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });
  let cacheHeaders: Record<string, string> = {};

  const supabase = createServerClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value),
        );
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
        cacheHeaders = { ...cacheHeaders, ...(headers ?? {}) };
        Object.entries(cacheHeaders).forEach(([key, value]) =>
          response.headers.set(key, value),
        );
      },
    },
  });

  // Do not put code between createServerClient and getClaims():
  // it verifies the session and refreshes it when it has expired.
  const { data } = await supabase.auth.getClaims();
  const user = data?.claims?.sub ?? null;

  const { pathname } = request.nextUrl;
  let redirectTo: string | null = null;
  if (!user && matches(pathname, PROTECTED)) redirectTo = "/login";
  if (user && matches(pathname, AUTH_PAGES)) redirectTo = "/app";

  if (redirectTo) {
    const url = request.nextUrl.clone();
    url.pathname = redirectTo;
    url.search = "";
    const redirect = NextResponse.redirect(url);
    response.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
    Object.entries(cacheHeaders).forEach(([key, value]) =>
      redirect.headers.set(key, value),
    );
    return redirect;
  }

  return response;
}
