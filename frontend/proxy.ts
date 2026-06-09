import { NextRequest, NextResponse } from "next/server";

const SESSION_COOKIE = "polaris_session";
const PUBLIC_FILE = /\.(.*)$/;
const PUBLIC_PATHS = new Set(["/login", "/setup", "/offline"]);

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api") ||
    PUBLIC_FILE.test(pathname) ||
    PUBLIC_PATHS.has(pathname)
  ) {
    return NextResponse.next();
  }

  if (!request.cookies.has(SESSION_COOKIE)) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", `${pathname}${search}`);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
