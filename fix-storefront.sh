#!/usr/bin/env bash
set -euo pipefail

BLUE='\033[0;34m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
info()  { echo -e "${BLUE}[INFO]${NC} $1"; }
ok()    { echo -e "${GREEN}[OK]${NC} $1"; }
warn()  { echo -e "${YELLOW}[WARN]${NC} $1"; }
error() { echo -e "${RED}[ERROR]${NC} $1"; }

cd "$(dirname "$0")"

# ============================================================
# 1. KREIRAJ DASHBOARD STRUKTURU AKO NEDOSTAJE
# ============================================================
mkdir -p "src/app/(company)/dashboard/catalog" "src/app/(company)/dashboard/orders" "src/app/(platform)/admin"

# ---- Dashboard layout ----
if [[ ! -f "src/app/(company)/dashboard/layout.tsx" ]]; then
cat > "src/app/(company)/dashboard/layout.tsx" << 'EOF'
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { Sidebar } from "@/components/dashboard/Sidebar";
import { NotificationBell } from "@/components/notifications/NotificationBell";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session?.user || !["COMPANY_ADMIN", "COMPANY_STAFF"].includes((session.user as any).platformRole)) {
    redirect("/login");
  }

  return (
    <div className="flex min-h-screen bg-slate-50">
      <Sidebar />
      <div className="flex-1">
        <header className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-4">
          <h1 className="text-lg font-semibold text-slate-900">Company Dashboard</h1>
          <NotificationBell />
        </header>
        <main className="p-6">{children}</main>
      </div>
    </div>
  );
}
EOF
ok "Dashboard layout created"
else
ok "Dashboard layout exists"
fi

# ---- Dashboard home page ----
if [[ ! -f "src/app/(company)/dashboard/page.tsx" ]]; then
cat > "src/app/(company)/dashboard/page.tsx" << 'EOF'
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { StatCard } from "@/components/dashboard/StatCard";

export default async function DashboardHome() {
  const session = await getSession();
  const companyId = (session?.user as any).companyId;

  const [orders, totalOrders, newOrders, totalRevenue] = await Promise.all([
    prisma.order.findMany({ where: { companyId }, orderBy: { createdAt: "desc" }, take: 5, include: { customerOrg: true } }),
    prisma.order.count({ where: { companyId } }),
    prisma.order.count({ where: { companyId, status: "NEW" } }),
    prisma.order.aggregate({ where: { companyId }, _sum: { total: true } }),
  ]);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Total Orders" value={totalOrders} />
        <StatCard label="New Orders" value={newOrders} />
        <StatCard label="Revenue" value={totalRevenue._sum.total?.toString() ?? "0"} />
      </div>
      <div className="rounded-xl border border-slate-200 bg-white">
        <h2 className="border-b border-slate-200 p-4 font-semibold">Recent Orders</h2>
        <div className="divide-y divide-slate-100">
          {orders.map((o) => (
            <div key={o.id} className="flex items-center justify-between p-4">
              <div>
                <p className="font-medium text-slate-900">{o.orderNumber}</p>
                <p className="text-xs text-slate-500">{o.customerOrg.name}</p>
              </div>
              <div className="text-right">
                <p className="font-medium">{o.total} {o.currency}</p>
                <p className="text-xs text-slate-500">{o.status}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
EOF
ok "Dashboard home created"
else
ok "Dashboard home exists"
fi

# ---- Catalog page ----
if [[ ! -f "src/app/(company)/dashboard/catalog/page.tsx" ]]; then
cat > "src/app/(company)/dashboard/catalog/page.tsx" << 'EOF'
"use client";
import { useEffect, useState } from "react";

export default function CatalogPage() {
  const [tab, setTab] = useState<"glass" | "profiles" | "hardware">("glass");
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<any>({});

  async function load() {
    setLoading(true);
    const res = await fetch(`/api/catalog?type=${tab}`);
    const data = await res.json();
    setItems(data.items || []);
    setLoading(false);
  }

  useEffect(() => { load(); }, [tab]);

  async function createItem(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/catalog", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: tab, data: form }),
    });
    if (res.ok) { setShowForm(false); setForm({}); load(); }
  }

  function renderForm() {
    if (tab === "glass") return (
      <div className="grid grid-cols-2 gap-3">
        <input placeholder="Name" className="input" value={form.name || ""} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <input placeholder="Category" className="input" value={form.category || ""} onChange={(e) => setForm({ ...form, category: e.target.value })} />
        <input placeholder="Sell / m²" type="number" className="input" value={form.sellPricePerSqm || ""} onChange={(e) => setForm({ ...form, sellPricePerSqm: +e.target.value })} />
        <input placeholder="Cost / m²" type="number" className="input" value={form.costPricePerSqm || ""} onChange={(e) => setForm({ ...form, costPricePerSqm: +e.target.value })} />
        <input placeholder="Thickness (4,5,6)" className="input" value={(form.availableThicknessMm || []).join(",")} onChange={(e) => setForm({ ...form, availableThicknessMm: e.target.value.split(",").map(Number) })} />
      </div>
    );
    if (tab === "profiles") return (
      <div className="grid grid-cols-2 gap-3">
        <input placeholder="Brand" className="input" value={form.brand || ""} onChange={(e) => setForm({ ...form, brand: e.target.value })} />
        <input placeholder="System" className="input" value={form.systemName || ""} onChange={(e) => setForm({ ...form, systemName: e.target.value })} />
        <input placeholder="Chambers" type="number" className="input" value={form.chamberCount || ""} onChange={(e) => setForm({ ...form, chamberCount: +e.target.value })} />
        <input placeholder="Depth mm" type="number" className="input" value={form.installDepthMm || ""} onChange={(e) => setForm({ ...form, installDepthMm: +e.target.value })} />
        <input placeholder="Sell / m" type="number" className="input" value={form.sellPricePerMeter || ""} onChange={(e) => setForm({ ...form, sellPricePerMeter: +e.target.value })} />
        <input placeholder="Cost / m" type="number" className="input" value={form.costPricePerMeter || ""} onChange={(e) => setForm({ ...form, costPricePerMeter: +e.target.value })} />
        <input placeholder="Colors" className="input" value={(form.colorOptions || []).join(",")} onChange={(e) => setForm({ ...form, colorOptions: e.target.value.split(",") })} />
      </div>
    );
    return (
      <div className="grid grid-cols-2 gap-3">
        <input placeholder="Name" className="input" value={form.name || ""} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <input placeholder="Category" className="input" value={form.category || ""} onChange={(e) => setForm({ ...form, category: e.target.value })} />
        <input placeholder="Sell" type="number" className="input" value={form.sellPrice || ""} onChange={(e) => setForm({ ...form, sellPrice: +e.target.value })} />
        <input placeholder="Cost" type="number" className="input" value={form.costPrice || ""} onChange={(e) => setForm({ ...form, costPrice: +e.target.value })} />
        <input placeholder="Unit" className="input" value={form.unit || "piece"} onChange={(e) => setForm({ ...form, unit: e.target.value })} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Catalog & Pricing</h1>
        <button onClick={() => setShowForm(!showForm)} className="btn bg-blue-600 text-white">{showForm ? "Cancel" : "Add Item"}</button>
      </div>
      <div className="flex gap-2 border-b border-slate-200">
        {(["glass", "profiles", "hardware"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`border-b-2 px-4 py-2 text-sm font-medium ${tab === t ? "border-blue-600 text-blue-600" : "border-transparent text-slate-500"}`}>{t}</button>
        ))}
      </div>
      {showForm && (
        <form onSubmit={createItem} className="rounded-xl border border-slate-200 bg-white p-6">
          <h3 className="mb-4 font-semibold">Create {tab} item</h3>
          {renderForm()}
          <button className="btn mt-4 bg-blue-600 text-white">Save</button>
        </form>
      )}
      <div className="rounded-xl border border-slate-200 bg-white">
        {loading ? <p className="p-4">Loading...</p> : (
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-left">
              <tr><th className="p-4">Name</th><th className="p-4">Price</th><th className="p-4">Active</th></tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className="border-b border-slate-100">
                  <td className="p-4">{item.name || `${item.brand} ${item.systemName}`}</td>
                  <td className="p-4">{item.sellPricePerSqm || item.sellPricePerMeter || item.sellPrice}</td>
                  <td className="p-4">{item.isActive ? "Yes" : "No"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
EOF
ok "Catalog page created"
else
ok "Catalog page exists"
fi

# ---- Orders page ----
if [[ ! -f "src/app/(company)/dashboard/orders/page.tsx" ]]; then
cat > "src/app/(company)/dashboard/orders/page.tsx" << 'EOF'
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { OrderKanban } from "@/components/dashboard/OrderKanban";

export default async function OrdersPage() {
  const session = await getSession();
  const companyId = (session?.user as any).companyId;
  const orders = await prisma.order.findMany({
    where: { companyId },
    orderBy: { createdAt: "desc" },
    include: { customerOrg: true, items: true },
  });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Orders</h1>
      <OrderKanban orders={orders as any} />
    </div>
  );
}
EOF
ok "Orders page created"
else
ok "Orders page exists"
fi

# ---- Platform admin ----
if [[ ! -f "src/app/(platform)/admin/page.tsx" ]]; then
cat > "src/app/(platform)/admin/page.tsx" << 'EOF'
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";

export default async function AdminPage() {
  const session = await getSession();
  if ((session?.user as any)?.platformRole !== "SUPER_ADMIN") redirect("/login");

  const companies = await prisma.company.findMany({ include: { _count: { select: { users: true, orders: true } } } });

  return (
    <div className="p-8">
      <h1 className="mb-6 text-2xl font-bold">Platform Admin</h1>
      <div className="rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-left">
            <tr><th className="p-4">Company</th><th className="p-4">Slug</th><th className="p-4">Users</th><th className="p-4">Orders</th><th className="p-4">Status</th></tr>
          </thead>
          <tbody>
            {companies.map((c) => (
              <tr key={c.id} className="border-b border-slate-100">
                <td className="p-4 font-medium">{c.name}</td>
                <td className="p-4">{c.slug}</td>
                <td className="p-4">{c._count.users}</td>
                <td className="p-4">{c._count.orders}</td>
                <td className="p-4">{c.isActive ? "Active" : "Inactive"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
EOF
ok "Platform admin created"
else
ok "Platform admin exists"
fi

# ============================================================
# 2. POPRAVI MIDDLEWARE — ignorisi /dashboard i /admin
# ============================================================
cat > src/middleware.ts << 'EOF'
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
EOF
ok "Middleware fixed — /dashboard i /admin sada rade na subdomain-u"

# ============================================================
# 3. OČISTI KEŠ
# ============================================================
rm -rf .next
ok "Cleared .next cache"

echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}   Dashboard fix je gotov!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo "Pokreni:"
echo "  npm run dev"
echo ""
echo "Zatim prijavi se na:"
echo "  Supplier: http://localhost:3000/dashboard  (admin@acme.test / Password123!)"
echo "  Storefront: http://acme.localhost:3000    (bob@customers.test / Password123!)"
echo "  Super Admin: http://localhost:3000/admin   (superadmin@glazeflow.app / Password123!)"