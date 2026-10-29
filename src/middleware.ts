import { NextResponse, type NextRequest } from "next/server";

const PUBLIC = ["/login", "/api/auth/login", "/api/health"];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const isApi = pathname.startsWith("/api/");

  // CSRF defence in depth on top of SameSite=Lax: writes must come from our own origin.
  if (isApi && !["GET", "HEAD", "OPTIONS"].includes(req.method)) {
    const origin = req.headers.get("origin");
    if (origin && new URL(origin).host !== req.headers.get("host")) {
      return NextResponse.json({ error: "Please refresh the page and try again." }, { status: 403 });
    }
  }

  if (PUBLIC.some((p) => pathname === p)) return NextResponse.next();

  // Cheap presence check only. Signature, expiry and DB state are verified in getSessionUser().
  if (!req.cookies.get("pno_session")) {
    if (isApi) return NextResponse.json({ error: "Your session has ended. Please sign in again." }, { status: 401 });
    return NextResponse.redirect(new URL("/login", req.url));
  }
  return NextResponse.next();
}

// Icons are public so the sign-in page shows them too.
export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|apple-icon.png).*)"] };
