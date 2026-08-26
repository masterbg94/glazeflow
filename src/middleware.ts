import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

const ROOT = process.env.NEXT_PUBLIC_ROOT_DOMAIN || "localhost:3000";

export async function middleware(req: NextRequest) {
  const url = req.nextUrl;
  const hostname = req.headers.get("host") || "";
  const path = url.pathname;

  const cleanHost = hostname.replace(`.${ROOT}`, "").replace(ROOT, "");
  const isRoot = hostname === ROOT || hostname === `www.${ROOT}`;

  // NE prepisuj dashboard/admin kada dolaze sa subdomain-a
  if (
    !isRoot &&
    cleanHost &&
    !path.startsWith("/_next") &&
    !path.startsWith("/api") &&
    !path.startsWith("/login") &&
    !path.startsWith("/register") &&
    !path.startsWith("/dashboard") &&
    !path.startsWith("/admin")
  ) {
    const alreadyWithSlug = path === `/${cleanHost}` || path.startsWith(`/${cleanHost}/`);
    if (!alreadyWithSlug) {
      return NextResponse.rewrite(new URL(`/${cleanHost}${path}`, req.url));
    }
  }

  // Zaštita dashboard/admin
  if (path.startsWith("/dashboard") || path.startsWith("/admin")) {
    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
    if (!token) return NextResponse.redirect(new URL("/login", req.url));
    if (path.startsWith("/admin") && token.platformRole !== "SUPER_ADMIN") return NextResponse.redirect(new URL("/dashboard", req.url));
    if (path.startsWith("/dashboard") && !["COMPANY_ADMIN", "COMPANY_STAFF"].includes(token.platformRole as string)) return NextResponse.redirect(new URL("/login", req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest).*)"],
};
