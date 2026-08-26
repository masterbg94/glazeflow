#!/usr/bin/env bash
set -euo pipefail

BLUE='\033[0;34m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
info()  { echo -e "${BLUE}[INFO]${NC} $1"; }
ok()    { echo -e "${GREEN}[OK]${NC} $1"; }
warn()  { echo -e "${YELLOW}[WARN]${NC} $1"; }
error() { echo -e "${RED}[ERROR]${NC} $1"; }

cd "$(dirname "$0")"

# ============================================================
# 1. CREIRAJ PROXY.TS (Next.js 16 konvencija)
# ============================================================
info "Creating src/proxy.ts..."
cat > src/proxy.ts << 'EOF'
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

const ROOT = process.env.NEXT_PUBLIC_ROOT_DOMAIN || "localhost:3000";

export async function proxy(req: NextRequest) {
  const url = req.nextUrl;
  const hostname = req.headers.get("host") || "";
  const path = url.pathname;

  const cleanHost = hostname.replace(`.${ROOT}`, "").replace(ROOT, "");
  const isRoot = hostname === ROOT || hostname === `www.${ROOT}`;

  // 1. Subdomain storefront — samo za ne-root domen i NE za dashboard/admin/api/login/register
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

  // 2. Zaštita /dashboard i /admin
  if (path.startsWith("/dashboard") || path.startsWith("/admin")) {
    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
    if (!token) return NextResponse.redirect(new URL("/login", req.url));
    if (path.startsWith("/admin") && token.platformRole !== "SUPER_ADMIN") {
      return NextResponse.redirect(new URL("/dashboard", req.url));
    }
    if (path.startsWith("/dashboard") && !["COMPANY_ADMIN", "COMPANY_STAFF"].includes(token.platformRole as string)) {
      return NextResponse.redirect(new URL("/login", req.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest).*)"],
};
EOF
ok "src/proxy.ts created"

# ============================================================
# 2. OBRIŠI STARI MIDDLEWARE.TS
# ============================================================
if [[ -f src/middleware.ts ]]; then
  rm src/middleware.ts
  ok "src/middleware.ts removed (deprecated in Next.js 16)"
else
  ok "src/middleware.ts not present"
fi

# ============================================================
# 3. PROVERI / KREIRAJ NEXTAUTH ROUTE
# ============================================================
mkdir -p "src/app/api/auth/[...nextauth]"
if [[ ! -f "src/app/api/auth/[...nextauth]/route.ts" ]]; then
cat > "src/app/api/auth/[...nextauth]/route.ts" << 'EOF'
import NextAuth from "next-auth";
import { authOptions } from "@/lib/auth";

const handler = NextAuth(authOptions);
export { handler as GET, handler as POST };
EOF
ok "Auth route created"
else
ok "Auth route exists"
fi

# ============================================================
# 4. PROVERI / KREIRAJ LOGIN STRANICU
# ============================================================
if [[ ! -f "src/app/(auth)/login/page.tsx" ]]; then
mkdir -p "src/app/(auth)/login"
cat > "src/app/(auth)/login/page.tsx" << 'EOF'
"use client";
import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const params = useSearchParams();
  const callback = params.get("callbackUrl") || "/dashboard";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const res = await signIn("credentials", {
      email,
      password,
      redirect: false,
    });
    setLoading(false);
    if (res?.error) {
      setError("Invalid email or password");
    } else {
      router.push(callback);
      router.refresh();
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="mb-8 text-center">
          <div className="inline-block h-12 w-12 rounded-xl bg-blue-600 text-2xl font-bold leading-[48px] text-white">G</div>
          <h1 className="mt-4 text-2xl font-bold">GlazeFlow</h1>
          <p className="mt-1 text-sm text-slate-500">Sign in to your account</p>
        </div>
        {error && (
          <div className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-600">{error}</div>
        )}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Email</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="input" required />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Password</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="input" required />
          </div>
          <button type="submit" disabled={loading} className="btn w-full bg-blue-600 text-white hover:bg-blue-700">
            {loading ? "Signing in..." : "Sign in"}
          </button>
        </form>
        <p className="mt-6 text-center text-sm text-slate-500">
          No account? <a href="/register" className="text-blue-600 hover:underline">Register</a>
        </p>
      </div>
    </div>
  );
}
EOF
ok "Login page created"
else
ok "Login page exists"
fi

# ============================================================
# 5. PROVERI AUTH LIB (ako fali — kreiraj)
# ============================================================
if [[ ! -f src/lib/auth.ts ]]; then
cat > src/lib/auth.ts << 'EOF'
import { NextAuthOptions, getServerSession } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { prisma } from "./prisma";
import bcrypt from "bcryptjs";

export const authOptions: NextAuthOptions = {
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [
    CredentialsProvider({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;
        const user = await prisma.user.findUnique({
          where: { email: credentials.email },
          include: { company: true, customerOrg: true },
        });
        if (!user || !user.passwordHash || !user.isActive) return null;
        const valid = await bcrypt.compare(credentials.password, user.passwordHash);
        if (!valid) return null;
        return {
          id: user.id,
          email: user.email,
          name: user.name,
          platformRole: user.platformRole,
          companyId: user.companyId,
          companySlug: user.company?.slug ?? null,
          customerOrgId: user.customerOrgId,
        } as any;
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.platformRole = (user as any).platformRole;
        token.companyId = (user as any).companyId;
        token.companySlug = (user as any).companySlug;
        token.customerOrgId = (user as any).customerOrgId;
        token.uid = (user as any).id;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as any).id = token.uid;
        (session.user as any).platformRole = token.platformRole;
        (session.user as any).companyId = token.companyId;
        (session.user as any).companySlug = token.companySlug;
        (session.user as any).customerOrgId = token.customerOrgId;
      }
      return session;
    },
  },
  secret: process.env.NEXTAUTH_SECRET,
};

export const getSession = () => getServerSession(authOptions);
EOF
ok "src/lib/auth.ts created"
else
ok "src/lib/auth.ts exists"
fi

# ============================================================
# 6. OČISTI KEŠ
# ============================================================
rm -rf .next
ok "Cleared .next cache"

echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}   Proxy fix + login repair gotov!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo "Pokreni:"
echo "  npm run dev"
echo ""
echo "Zatim:"
echo "  Supplier: http://localhost:3000/dashboard  (admin@acme.test / Password123!)"
echo "  Storefront: http://acme.localhost:3000    (bob@customers.test / Password123!)"
echo "  Super Admin: http://localhost:3000/admin   (superadmin@glazeflow.app / Password123!)"
