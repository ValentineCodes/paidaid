import { type NextRequest, NextResponse } from "next/server";
import { updateSession } from "./lib/supabase/middleware";
import { isSupabaseConfigured } from "./lib/supabase/env";

const PROTECTED_PREFIXES = [
  "/account",
  "/requests/mine",
  "/responses/mine",
  "/notifications",
  "/engagements",
  "/messages",
];

export async function middleware(request: NextRequest) {
  if (!isSupabaseConfigured()) {
    return NextResponse.next();
  }

  const { pathname } = request.nextUrl;
  const { response, user } = await updateSession(request);

  if (pathname === "/conversations" || pathname.startsWith("/conversations/")) {
    const url = request.nextUrl.clone();
    url.pathname =
      pathname === "/conversations"
        ? "/messages"
        : pathname.replace(/^\/conversations/, "/messages");
    return NextResponse.redirect(url);
  }

  if (pathname === "/requests/new") {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    url.searchParams.set("create", "1");
    return NextResponse.redirect(url);
  }

  const isProtected = PROTECTED_PREFIXES.some((p) => pathname.startsWith(p));
  if (isProtected && !user) {
    const url = request.nextUrl.clone();
    url.pathname = "/auth/wallet";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
