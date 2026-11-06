import { type NextRequest, NextResponse } from "next/server";
import { updateSession } from "./lib/supabase/middleware";
import { isSupabaseConfigured } from "./lib/supabase/env";

const PROTECTED_PREFIX = "/account";

export async function middleware(request: NextRequest) {
  if (!isSupabaseConfigured()) {
    return NextResponse.next();
  }

  const { pathname } = request.nextUrl;
  const { response, user } = await updateSession(request);

  if (pathname.startsWith(PROTECTED_PREFIX) && !user) {
    const url = request.nextUrl.clone();
    url.pathname = "/auth/login";
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
